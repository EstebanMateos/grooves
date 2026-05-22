import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";
import { useAuthSession } from "../hooks/useAuthSession";
import { supabase } from "../supabaseClient";
import { fetchWithRateLimit } from "../utils/fetchWithRateLimit";
import { isDebugEnabled } from "../utils/supabaseDebug";
import { ensureCollectionGroupId, getCollectionGroupId } from "../utils/collectionGroup";
import {
    getRecordIdByDiscogsReleaseId,
    removeCollectionRecord,
    removeWishlistRecord
} from "../utils/libraryApi";
import { getDiscogsProxyBaseUrl } from "../utils/discogsProxy";
import BackButton from "../components/BackButton";

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
    const auth = useAuthSession();

    const { discogsReleaseId } = useParams();
    const [release, setRelease] = useState<DiscogsRelease | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const loadSeqRef = useRef<number>(0);

    const [actionStatus, setActionStatus] = useState<string>("");
    const [actionLoading, setActionLoading] = useState<boolean>(false);

    useEffect(() => {
        const controller = new AbortController();
        const seq = loadSeqRef.current + 1;
        loadSeqRef.current = seq;
        const isStale = () => loadSeqRef.current !== seq;

        async function load() {
            if (!discogsReleaseId) {
                return;
            }

            setLoading(true);
            setError("");
            setRelease(null);

            try {
                const baseUrl = getDiscogsProxyBaseUrl();
                const resp = await fetchWithRateLimit(
                    `${baseUrl}/release/${encodeURIComponent(discogsReleaseId)}`,
                    { signal: controller.signal }
                );
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }
                const json = (await resp.json()) as DiscogsRelease;
                if (isStale()) {
                    return;
                }
                setRelease(json);
            } catch (e) {
                if (controller.signal.aborted || isStale()) {
                    return;
                }
                setError(String(e));
            } finally {
                if (!isStale()) {
                    setLoading(false);
                }
            }
        }

        load();
        return () => {
            controller.abort();
            loadSeqRef.current += 1;
        };
    }, [discogsReleaseId]);

    function requireUserId(): string | null {
        if (auth.is_loading) {
            setActionStatus("Vérification de la session…");
            return null;
        }
        if (!auth.is_authenticated || !auth.user_id) {
            onRequireAuth();
            return null;
        }
        return auth.user_id;
    }

    async function upsertRecordFromRelease(releaseData: DiscogsRelease): Promise<string> {
        const artist = extractArtist(releaseData);
        const { label, catno } = extractLabel(releaseData);
        const { thumb_url, cover_url } = extractImages(releaseData);

        const recordPayload = {
            discogs_release_id: releaseData.id,
            title: releaseData.title,
            artist,
            year: releaseData.year ?? null,
            country: releaseData.country ?? null,
            thumb_url,
            cover_url,
            label: label || null,
            catno: catno || null,
            data_json: releaseData
        };

        const { data: recordRow, error: recordError } = await supabase
            .from("records")
            .upsert(recordPayload, { onConflict: "discogs_release_id" })
            .select("id")
            .single();

        if (recordError || !recordRow?.id) {
            throw recordError ?? new Error("Impossible d'enregistrer le disque");
        }

        return recordRow.id as string;
    }

    async function addToList(listType: "wishlist" | "collection") {
        if (!release) {
            return;
        }

        setActionStatus("");
        const userId = requireUserId();
        if (!userId) {
            return;
        }
        setActionLoading(true);

        try {
            const inCollectionNow = library.collection_ids.has(release.id);
            const inWishlistNow = library.wishlist_ids.has(release.id);

            if (listType === "collection" && inCollectionNow) {
                setActionStatus("Déjà dans la collection.");
                return;
            }

            if (listType === "wishlist" && (inWishlistNow || inCollectionNow)) {
                setActionStatus(inCollectionNow ? "Déjà dans la collection." : "Déjà dans la wishlist.");
                return;
            }

            const recordId = await upsertRecordFromRelease(release);

            if (listType === "collection" && inWishlistNow) {
                await removeWishlistRecord(recordId, userId);
            }

            if (listType === "collection") {
                const groupId = await ensureCollectionGroupId();
                const { error: collectionItemError } = await supabase
                    .from("collection_group_items")
                    .upsert(
                        {
                            group_id: groupId,
                            record_id: recordId,
                            added_by_user_id: userId
                        },
                        { onConflict: "group_id,record_id" }
                    );

                if (collectionItemError) {
                    throw collectionItemError;
                }
            } else {
                const { error: userRecordError } = await supabase
                    .from("user_records")
                    .upsert(
                        {
                            user_id: userId,
                            record_id: recordId,
                            list_type: "wishlist"
                        },
                        { onConflict: "user_id,record_id,list_type" }
                    );

                if (userRecordError) {
                    throw userRecordError;
                }
            }

            await library.reload();
            setActionStatus(listType === "wishlist" ? "Ajouté à la wishlist." : "Ajouté à la collection.");
        } catch (e) {
            if (isDebugEnabled()) {
                console.error("[ReleasePage] addToList failed", e);
            }
            setActionStatus(String(e));
        } finally {
            setActionLoading(false);
        }
    }

    async function removeFromList(listType: "wishlist" | "collection") {
        if (!release) {
            return;
        }

        setActionStatus("");
        const userId = requireUserId();
        if (!userId) {
            return;
        }
        setActionLoading(true);

        try {
            const recordId = await getRecordIdByDiscogsReleaseId(release.id);
            if (!recordId) {
                await library.reload();
                setActionStatus("Retiré.");
                return;
            }

            if (listType === "collection") {
                const groupId = await getCollectionGroupId(userId);
                if (!groupId) {
                    await library.reload();
                    setActionStatus("Retiré.");
                    return;
                }

                await removeCollectionRecord(recordId, groupId);
            } else {
                await removeWishlistRecord(recordId, userId);
            }

            await library.reload();
            setActionStatus(listType === "wishlist" ? "Retiré de la wishlist." : "Retiré de la collection.");
        } catch (e) {
            if (isDebugEnabled()) {
                console.error("[ReleasePage] removeFromList failed", e);
            }
            setActionStatus(String(e));
        } finally {
            setActionLoading(false);
        }
    }

    async function moveWishlistToCollection() {
        if (!release) {
            return;
        }

        if (library.collection_ids.has(release.id)) {
            setActionStatus("Déjà dans la collection.");
            return;
        }

        await addToList("collection");
    }

    if (loading) {
        return <div>Chargement…</div>;
    }

    if (error) {
        return (
            <div>
                <BackButton className="btn btnGhost" />
                <div style={{ color: "red", marginTop: 12 }}>{error}</div>
            </div>
        );
    }

    if (!release) {
        return (
            <div>
                <BackButton className="btn btnGhost" />
                <div>Aucune donnée</div>
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
    const actionDisabled = actionLoading || library.loading || !!library.error;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
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
                    <div style={{ fontSize: 18, opacity: 0.85, marginTop: 6 }}>
                        <Link to={`/search?q=${encodeURIComponent(artist)}`} style={{ textDecoration: "none" }}>
                            {artist}
                        </Link>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        {inCollection ? <span className="pill pillCollection">Dans la collection</span> : null}
                        {!inCollection && inWishlist ? <span className="pill pillWishlist">Dans la wishlist</span> : null}
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.8 }}>
                        {release.year ?? "?"} · {release.country ?? "?"}
                    </div>

                    {labelLine ? <div style={{ marginTop: 6, opacity: 0.8 }}>{labelLine}</div> : null}
                    {formatsLine ? <div style={{ marginTop: 6, opacity: 0.8 }}>{formatsLine}</div> : null}

                    <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!inCollection && !inWishlist ? (
                            <>
                                <button onClick={() => addToList("wishlist")} disabled={actionDisabled}>
                                    Ajouter à la wishlist
                                </button>
                                <button onClick={() => addToList("collection")} disabled={actionDisabled}>
                                    Ajouter à la collection
                                </button>
                            </>
                        ) : null}

                        {inWishlist ? (
                            <>
                                <button onClick={moveWishlistToCollection} disabled={actionDisabled}>
                                    Déplacer vers la collection
                                </button>
                                <button onClick={() => removeFromList("wishlist")} disabled={actionDisabled}>
                                    Retirer de la wishlist
                                </button>
                            </>
                        ) : null}

                        {inCollection ? (
                            <button onClick={() => removeFromList("collection")} disabled={actionDisabled}>
                                Retirer de la collection
                            </button>
                        ) : null}
                    </div>

                    {library.error ? (
                        <div style={{ marginTop: 8 }} className="error">
                            Connexion Supabase indisponible. Réessaie.
                        </div>
                    ) : null}
                    {actionStatus ? <div style={{ marginTop: 8, fontSize: 14 }}>{actionStatus}</div> : null}
                </div>
            </div>

            <h2 style={{ marginTop: 22 }}>Pistes</h2>
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
