import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

type PublicProfileRow = {
    username: string;
    display_name: string | null;
    is_public_collection: boolean;
    is_public_wishlist: boolean;
};

export default function DiscoverProfilesPage() {
    const [query, setQuery] = useState<string>("");
    const [rows, setRows] = useState<PublicProfileRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");

    async function search() {
        setLoading(true);
        setError("");
        setRows([]);

        try {
            const q = query.trim().toLowerCase();
            if (!q) {
                return;
            }

            const { data, error: dbError } = await supabase
                .from("profiles")
                .select("username,display_name,is_public_collection,is_public_wishlist")
                .or("is_public_collection.eq.true,is_public_wishlist.eq.true")
                .ilike("username", `%${q}%`)
                .order("username", { ascending: true })
                .limit(30);

            if (dbError) {
                throw dbError;
            }

            setRows((data ?? []) as PublicProfileRow[]);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!query.trim()) {
            setRows([]);
            setError("");
            return;
        }

        const handle = window.setTimeout(() => {
            search();
        }, 250);

        return () => window.clearTimeout(handle);
    }, [query]);

    const results = useMemo(() => {
        const seen = new Set<string>();
        const out: PublicProfileRow[] = [];
        rows.forEach((r) => {
            if (!r.username) {
                return;
            }
            if (seen.has(r.username)) {
                return;
            }
            seen.add(r.username);
            out.push(r);
        });
        return out;
    }, [rows]);

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to="/">← Back</Link>
            </div>

            <h1>Discover profiles</h1>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search username"
                    style={{ flex: 1 }}
                />
                <button onClick={search} disabled={loading || !query.trim()}>
                    Search
                </button>
            </div>

            {loading ? <div style={{ marginTop: 12 }}>Loading…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}

            {!loading && !error && query.trim() && results.length === 0 ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>No public profiles match this username.</div>
            ) : null}

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {results.map((r) => {
                    const flags =
                        `${r.is_public_collection ? "Collection" : ""}${r.is_public_collection && r.is_public_wishlist ? " · " : ""}${r.is_public_wishlist ? "Wishlist" : ""}` ||
                        "Public";

                    return (
                        <div
                            key={r.username}
                            style={{
                                padding: 12,
                                border: "1px solid #ddd",
                                borderRadius: 6,
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "center"
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 700 }}>
                                    <Link to={`/u/${r.username}`} style={{ textDecoration: "none" }}>
                                        {r.username}
                                    </Link>
                                </div>
                                <div style={{ fontSize: 13, opacity: 0.8 }}>
                                    {r.display_name ?? " "}
                                </div>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.8 }}>{flags}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
