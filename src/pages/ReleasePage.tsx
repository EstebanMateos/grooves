import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";
import { supabase } from "../supabaseClient";

type DiscogsRelease = {
    id: number;
    title: string;
    year?: number;
    country?: string;
    artists?: { name: string }[];
    images?: { uri: string; uri150: string; type: string }[];
    labels?: { name: string; catno: string }[];
    formats?: { name: string; qty: string; descriptions?: string[] }[];
    tracklist?: { position: string; title: string; duration: string }[];
};

type Props = {
    onRequireAuth: () => void;
};

function extractArtist(release: DiscogsRelease): string {
    const raw = release.artists?.[0]?.name ?? "";
    return raw.replace(/\s+\(\d+\)\s*$/, "").trim();
}

function extractLabel(release: DiscogsRelease): { label: string; catno: string } {
    return {
        label: release.labels?.[0]?.name ?? "",
        catno: release.labels?.[0]?.catno ?? ""
    };
}

function extractImages(release: DiscogsRelease): { thumb_url: string | null; cover_url: string | null } {
    const primary = release.images?.find((i) => i.type === "primary") ?? release.images?.[0];
    return {
        thumb_url: primary?.uri150 ?? null,
        cover_url: primary?.uri ?? null
    };
}

function formatFormats(release: DiscogsRelease): string {
    const f = release.formats ?? [];
    return f
        .map((x) => {
            const qty = x.qty && x.qty !== "1" ? `${x.qty}× ` : "";
            const desc = (x.descriptions ?? []).join(", ");
            return desc ? `${qty}${x.name} (${desc})` : `${qty}${x.name}`;
        })
        .join(" · ");
}

export default function ReleasePage({ onRequireAuth }: Props) {
    const library = useUserLibraryIndex();

    const { discogsReleaseId } = useParams();
    const [release, setRelease] = useState<DiscogsRelease | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");

    const [actionStatus, setActionStatus] = useState<string>("");
    const [actionLoading, setActionLoading] = useState<boolean>(false);

    useEffect(() => {
        async function load() {
            if (!discogsReleaseId) {
                return;
            }

            setLoading(true);
            setError("");
            setRelease(null);

            try {
                const baseUrl = import.meta.env.VITE_DISCOGS_PROXY_BASE_URL as string;
                const resp = await fetch(`${baseUrl}/release/${encodeURIComponent(discogsReleaseId)}`);
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }
                const json = (await resp.json()) as DiscogsRelease;
                setRelease(json);
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [discogsReleaseId]);

    async function addToList(listType: "wishlist" | "collection") {
        if (!release) {
            return;
        }

        setActionStatus("");
        setActionLoading(true);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                onRequireAuth();
                return;
            }

            const inCollectionNow = library.collection_ids.has(release.id);
            const inWishlistNow = library.wishlist_ids.has(release.id);

            if (listType === "collection" && inCollectionNow) {
                setActionStatus("Already in collection.");
                return;
            }

            if (listType === "wishlist" && inWishlistNow) {
                setActionStatus("Already in wishlist.");
                return;
            }

            const userId = session.user.id;

            const artist = extractArtist(release);
            const { label, catno } = extractLabel(release);
            const { thumb_url, cover_url } = extractImages(release);

            const recordPayload = {
                discogs_release_id: release.id,
                title: release.title,
                artist,
                year: release.year ?? null,
                country: release.country ?? null,
                thumb_url,
                cover_url,
                label: label || null,
                catno: catno || null,
                data_json: release
            };

            const { data: recordRow, error: recordError } = await supabase
                .from("records")
                .upsert(recordPayload, { onConflict: "discogs_release_id" })
                .select("id")
                .single();

            if (recordError || !recordRow?.id) {
                throw recordError ?? new Error("Failed to save record");
            }

            if (listType === "collection") {
                if (inWishlistNow) {
                    const { error: rmWishError } = await supabase
                        .from("user_records")
                        .delete()
                        .eq("user_id", userId)
                        .eq("record_id", recordRow.id)
                        .eq("list_type", "wishlist");

                    if (rmWishError) {
                        throw rmWishError;
                    }
                }
            }

            const { data: userRecordRow, error: userRecordError } = await supabase
                .from("user_records")
                .upsert(
                    {
                        user_id: userId,
                        record_id: recordRow.id,
                        list_type: listType
                    },
                    { onConflict: "user_id,record_id,list_type" }
                )
                .select("id")
                .single();

            if (userRecordError) {
                throw userRecordError;
            }

            if (listType === "collection" && userRecordRow?.id) {
                const { error: collectionItemError } = await supabase
                    .from("collection_items")
                    .upsert(
                        { user_record_id: userRecordRow.id, rating: 0 },
                        { onConflict: "user_record_id" }
                    );

                if (collectionItemError) {
                    throw collectionItemError;
                }
            }

            await library.reload();
            setActionStatus(listType === "wishlist" ? "Added to wishlist." : "Added to collection.");
        } catch (e) {
            setActionStatus(String(e));
        } finally {
            setActionLoading(false);
        }
    }

    if (loading) {
        return <div>Loading…</div>;
    }

    if (error) {
        return (
            <div>
                <Link to="/">← Back</Link>
                <div style={{ color: "red", marginTop: 12 }}>{error}</div>
            </div>
        );
    }

    if (!release) {
        return (
            <div>
                <Link to="/">← Back</Link>
                <div>No data</div>
            </div>
        );
    }

    const artist = extractArtist(release);
    const images = extractImages(release);
    const formatsLine = formatFormats(release);
    const { label, catno } = extractLabel(release);
    const labelLine = label || catno ? `${label}${label && catno ? " · " : ""}${catno}` : "";

    const inCollection = library.collection_ids.has(release.id);
    const inWishlist = !inCollection && library.wishlist_ids.has(release.id);

    const canAddToCollection = !inCollection && !actionLoading;
    const canAddToWishlist = !inCollection && !inWishlist && !actionLoading;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to="/">← Back</Link>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ width: 320, maxWidth: "40vw" }}>
                    {images.cover_url ? (
                        <img src={images.cover_url} alt={release.title} style={{ width: "100%" }} />
                    ) : (
                        <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#f2f2f2" }} />
                    )}
                </div>

                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0 }}>{release.title}</h1>
                    <div style={{ fontSize: 18, opacity: 0.85, marginTop: 6 }}>{artist}</div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        {inCollection ? (
                            <span style={{ fontSize: 13, padding: "3px 8px", background: "#d1fae5", borderRadius: 4 }}>
                                In collection
                            </span>
                        ) : null}
                        {!inCollection && inWishlist ? (
                            <span style={{ fontSize: 13, padding: "3px 8px", background: "#e0e7ff", borderRadius: 4 }}>
                                In wishlist
                            </span>
                        ) : null}
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.8 }}>
                        {release.year ?? "?"} · {release.country ?? "?"}
                    </div>

                    {labelLine ? <div style={{ marginTop: 6, opacity: 0.8 }}>{labelLine}</div> : null}
                    {formatsLine ? <div style={{ marginTop: 6, opacity: 0.8 }}>{formatsLine}</div> : null}

                    <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                        <button onClick={() => addToList("wishlist")} disabled={!canAddToWishlist}>
                            Add to wishlist
                        </button>
                        <button onClick={() => addToList("collection")} disabled={!canAddToCollection}>
                            Add to collection
                        </button>
                    </div>

                    {actionStatus ? <div style={{ marginTop: 8, fontSize: 14 }}>{actionStatus}</div> : null}
                </div>
            </div>

            <h2 style={{ marginTop: 22 }}>Tracklist</h2>
            <div style={{ display: "grid", gap: 6 }}>
                {(release.tracklist ?? []).map((t, i) => (
                    <div key={`${t.position}_${t.title}_${i}`} style={{ display: "flex", gap: 12 }}>
                        <div style={{ width: 64, opacity: 0.7 }}>{t.position || "–"}</div>
                        <div style={{ flex: 1 }}>{t.title}</div>
                        <div style={{ width: 80, textAlign: "right", opacity: 0.7 }}>{t.duration}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
