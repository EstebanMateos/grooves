import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

type PublicLibraryRow = {
    list_type: "collection" | "wishlist";
    discogs_release_id: number;
    title: string;
    artist: string;
    year: number | null;
    country: string | null;
    thumb_url: string | null;
    label: string | null;
    catno: string | null;
};

type FilterType = "collection" | "wishlist" | "all";

export default function PublicProfilePage() {
    const { username } = useParams();

    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");

    const [notFound, setNotFound] = useState<boolean>(false);
    const [isPrivate, setIsPrivate] = useState<boolean>(false);

    const [rows, setRows] = useState<PublicLibraryRow[]>([]);
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchText, setSearchText] = useState<string>("");

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError("");
            setRows([]);
            setNotFound(false);
            setIsPrivate(false);

            try {
                const u = (username ?? "").trim().toLowerCase();
                if (!u) {
                    setNotFound(true);
                    return;
                }

                const { data: profile, error: profError } = await supabase
                    .from("profiles")
                    .select("username,is_public_collection,is_public_wishlist,display_name")
                    .eq("username", u)
                    .maybeSingle();

                if (profError) {
                    throw profError;
                }

                if (!profile) {
                    setNotFound(true);
                    return;
                }

                if (!profile.is_public_collection && !profile.is_public_wishlist) {
                    setIsPrivate(true);
                    return;
                }

                const { data, error: rpcError } = await supabase.rpc("public_library", { p_username: u });
                if (rpcError) {
                    throw rpcError;
                }

                setRows((data ?? []) as PublicLibraryRow[]);
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [username]);

    const filtered = useMemo(() => {
        let out = rows;

        if (filter !== "all") {
            out = out.filter((r) => r.list_type === filter);
        }

        const needle = searchText.trim().toLowerCase();
        if (needle) {
            out = out.filter((r) => `${r.artist} ${r.title}`.toLowerCase().includes(needle));
        }

        return out;
    }, [rows, filter, searchText]);

    if (notFound) {
        return (
            <div>
                <div style={{ marginBottom: 12 }}>
                    <BackButton className="btn btnGhost" />
                </div>
                <h1>Profile not found</h1>
                <div style={{ opacity: 0.8, marginTop: 8 }}>No user exists with username: {username}</div>
            </div>
        );
    }

    if (isPrivate) {
        return (
            <div>
                <div style={{ marginBottom: 12 }}>
                    <BackButton className="btn btnGhost" />
                </div>
                <h1>This profile is private</h1>
                <div style={{ opacity: 0.8, marginTop: 8 }}>
                    This user exists, but they did not enable public sharing.
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
            </div>

            <h1>Library: {username}</h1>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => setFilter("all")} disabled={filter === "all"}>
                    All
                </button>
                <button onClick={() => setFilter("collection")} disabled={filter === "collection"}>
                    Collection
                </button>
                <button onClick={() => setFilter("wishlist")} disabled={filter === "wishlist"}>
                    Wishlist
                </button>

                <div style={{ flex: 1 }} />

                <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filter by artist or title"
                    style={{ minWidth: 240 }}
                />
            </div>

            {loading ? <div style={{ marginTop: 12 }}>Loading…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}

            {!loading && !error && rows.length === 0 ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>
                    No public items. This profile may have no entries yet, or sharing is enabled but empty.
                </div>
            ) : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {filtered.map((r) => (
                    <div
                        key={`${r.list_type}_${r.discogs_release_id}`}
                        style={{
                            display: "flex",
                            gap: 12,
                            padding: 12,
                            border: "1px solid #ddd",
                            borderRadius: 6
                        }}
                    >
                        <div style={{ width: 80, height: 80, background: "#f2f2f2", flexShrink: 0 }}>
                            {r.thumb_url ? (
                                <img
                                    src={r.thumb_url}
                                    alt={r.title}
                                    style={{ width: 80, height: 80, objectFit: "cover" }}
                                />
                            ) : null}
                        </div>

                        <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ fontWeight: 700 }}>{r.title}</div>
                                <span
                                    style={{
                                        fontSize: 12,
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        background: r.list_type === "collection" ? "#d1fae5" : "#e0e7ff"
                                    }}
                                >
                                    {r.list_type === "collection" ? "Collection" : "Wishlist"}
                                </span>
                            </div>

                            <div style={{ opacity: 0.85 }}>{r.artist}</div>

                            <div style={{ fontSize: 14, opacity: 0.7 }}>
                                {r.year ?? "?"} · {r.country ?? "?"}
                            </div>

                            <div style={{ fontSize: 13, opacity: 0.7 }}>
                                {r.label ?? "?"}
                                {r.catno ? ` · ${r.catno}` : ""}
                            </div>

                            <div style={{ marginTop: 10 }}>
                                <Link to={`/release/${r.discogs_release_id}`}>Open release</Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
