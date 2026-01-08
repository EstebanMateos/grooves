import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";
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

type UserRecordBaseRow = {
    id: string;
    list_type: "collection" | "wishlist";
    record_id: string;
};

type UserRecordRow = {
    id: string;
    list_type: "collection" | "wishlist";
    record_id: string;
    record: RecordRow | null;
};

type FilterType = "collection" | "wishlist" | "all";

export default function MyLibraryPage() {
    const library = useUserLibraryIndex();

    const [items, setItems] = useState<UserRecordRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [filter, setFilter] = useState<FilterType>("collection");
    const [searchText, setSearchText] = useState<string>("");

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

            let q = supabase
                .from("user_records")
                .select("id,list_type,record_id")
                .eq("user_id", session.user.id)
                .order("created_at", { ascending: false })
                .limit(400);

            if (filter !== "all") {
                q = q.eq("list_type", filter);
            }

            const { data: urData, error: urError } = await q;

            if (urError) {
                throw urError;
            }

            const userRecords = (urData ?? []) as UserRecordBaseRow[];
            if (userRecords.length === 0) {
                setItems([]);
                return;
            }

            const recordIds = Array.from(new Set(userRecords.map((x) => x.record_id)));

            const { data: recData, error: recError } = await supabase
                .from("records")
                .select("id,discogs_release_id,title,artist,year,country,thumb_url,label,catno")
                .in("id", recordIds);

            if (recError) {
                throw recError;
            }

            const recordById = new Map<string, RecordRow>();
            for (const r of (recData ?? []) as RecordRow[]) {
                recordById.set(r.id, r);
            }

            const merged: UserRecordRow[] = userRecords.map((ur) => ({
                id: ur.id,
                list_type: ur.list_type,
                record_id: ur.record_id,
                record: recordById.get(ur.record_id) ?? null
            }));

            setItems(merged);
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
            await library.reload();

            setStatus(userRecord.list_type === "collection" ? "Removed from collection." : "Removed from wishlist.");
        } catch (e) {
            setError(String(e));
        } finally {
            setBusyId(null);
        }
    }

    const filteredItems = useMemo(() => {
        const needle = searchText.trim().toLowerCase();
        if (!needle) {
            return items;
        }

        return items.filter((ur) => {
            const r = ur.record;
            if (!r) {
                return false;
            }
            return `${r.artist} ${r.title}`.toLowerCase().includes(needle);
        });
    }, [items, searchText]);

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to="/">← Back</Link>
            </div>

            <h1>My library</h1>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => setFilter("collection")} disabled={filter === "collection"} className="btn btnGhost">
                    Collection
                </button>
                <button onClick={() => setFilter("wishlist")} disabled={filter === "wishlist"} className="btn btnGhost">
                    Wishlist
                </button>
                <button onClick={() => setFilter("all")} disabled={filter === "all"} className="btn btnGhost">
                    All
                </button>

                <div style={{ flex: 1 }} />

                <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filter by artist or title"
                    className="input"
                    style={{ minWidth: 240 }}
                />
            </div>

            {loading ? <div style={{ marginTop: 12 }} className="muted">Loading…</div> : null}
            {error ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {filteredItems.map((ur) => {
                    const r = ur.record;
                    if (!r) {
                        return null;
                    }

                    return (
                        <div
                            key={ur.id}
                            className="panel"
                            style={{
                                padding: 12,
                                display: "flex",
                                gap: 12,
                                alignItems: "center"
                            }}
                        >
                            <div className="thumb" style={{ width: 80, height: 80 }}>
                                {r.thumb_url ? (
                                    <img className="thumbImg" src={r.thumb_url} alt={r.title} />
                                ) : null}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                    <div style={{ fontWeight: 800 }}>{r.title}</div>
                                    <span className="muted small">{ur.list_type}</span>
                                </div>

                                <div className="muted" style={{ marginTop: 4 }}>
                                    {r.artist} · {r.year ?? "?"} · {r.country ?? "?"}
                                </div>

                                <div className="muted small" style={{ marginTop: 2 }}>
                                    {r.label ?? "?"}
                                    {r.catno ? ` · ${r.catno}` : ""}
                                </div>

                                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                                    <Link to={`/release/${r.discogs_release_id}`} className="btn btnGhost">
                                        Open
                                    </Link>
                                    <button
                                        onClick={() => removeItem(ur)}
                                        disabled={busyId === ur.id}
                                        className="btn btnGhost"
                                    >
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
