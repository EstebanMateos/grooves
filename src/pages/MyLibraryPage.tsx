import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

type RecordRow = {
    id: string;
    discogs_release_id: number;
    title: string;
    artist: string;
    year: number | null;
    country: string | null;
    thumb_url: string | null;
    label: string | null;
    catno: string | null;
};

type UserRecordRow = {
    id: string;
    list_type: "collection" | "wishlist";
    record_id: string;
    records: RecordRow | null;
};

type FilterType = "collection" | "wishlist" | "all";

export default function MyLibraryPage() {
    const [items, setItems] = useState<UserRecordRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [filter, setFilter] = useState<FilterType>("collection");

    async function load() {
        setLoading(true);
        setError("");
        setStatus("");

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                setItems([]);
                setError("Please login first.");
                return;
            }

            const q = supabase
                .from("user_records")
                .select(
                    `
                    id,
                    list_type,
                    record_id,
                    records (
                        id,
                        discogs_release_id,
                        title,
                        artist,
                        year,
                        country,
                        thumb_url,
                        label,
                        catno
                    )
                `
                )
                .eq("user_id", session.user.id)
                .order("created_at", { ascending: false });

            const { data, error: dbError } =
                filter === "all" ? await q : await q.eq("list_type", filter);

            if (dbError) {
                throw dbError;
            }

            setItems((data ?? []) as UserRecordRow[]);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, [filter]);

    async function removeItem(userRecord: UserRecordRow) {
        setError("");
        setStatus("");
        setBusyId(userRecord.id);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                setError("Please login first.");
                return;
            }

            if (userRecord.list_type === "collection") {
                const { error: collError } = await supabase
                    .from("collection_items")
                    .delete()
                    .eq("user_record_id", userRecord.id);

                if (collError) {
                    throw collError;
                }
            }

            const { error: delError } = await supabase
                .from("user_records")
                .delete()
                .eq("id", userRecord.id)
                .eq("user_id", session.user.id);

            if (delError) {
                throw delError;
            }

            setItems((prev) => prev.filter((x) => x.id !== userRecord.id));
            setStatus(userRecord.list_type === "collection" ? "Removed from collection." : "Removed from wishlist.");
        } catch (e) {
            setError(String(e));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to="/">← Back</Link>
            </div>

            <h1>My library</h1>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => setFilter("collection")} disabled={filter === "collection"}>
                    Collection
                </button>
                <button onClick={() => setFilter("wishlist")} disabled={filter === "wishlist"}>
                    Wishlist
                </button>
                <button onClick={() => setFilter("all")} disabled={filter === "all"}>
                    All
                </button>
            </div>

            {loading ? <div style={{ marginTop: 12 }}>Loading…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {items.map((ur) => {
                    const r = ur.records;
                    if (!r) {
                        return null;
                    }

                    return (
                        <div
                            key={ur.id}
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
                                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                                        {ur.list_type === "collection" ? "Collection" : "Wishlist"}
                                    </div>
                                </div>

                                <div style={{ opacity: 0.85 }}>{r.artist}</div>

                                <div style={{ fontSize: 14, opacity: 0.7 }}>
                                    {r.year ?? "?"} · {r.country ?? "?"}
                                </div>

                                <div style={{ fontSize: 13, opacity: 0.7 }}>
                                    {r.label ?? "?"}
                                    {r.catno ? ` · ${r.catno}` : ""}
                                </div>

                                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                                    <Link to={`/release/${r.discogs_release_id}`}>Open</Link>
                                    <button onClick={() => removeItem(ur)} disabled={busyId === ur.id}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
