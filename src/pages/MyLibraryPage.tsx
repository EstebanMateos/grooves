import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

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

type CachedLibrary = {
    updated_at: string;
    items: UserRecordRow[];
};

const LIBRARY_CACHE_PREFIX = "grooves:library_cache:";

export default function MyLibraryPage() {
    const library = useUserLibraryIndex();

    const [items, setItems] = useState<UserRecordRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchText, setSearchText] = useState<string>("");
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState<boolean>(false);
    const activeUserIdRef = useRef<string | null>(null);
    const loadSeqRef = useRef<number>(0);

    function readCache(userId: string): CachedLibrary | null {
        try {
            const raw = window.localStorage.getItem(`${LIBRARY_CACHE_PREFIX}${userId}`);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as CachedLibrary;
            if (!parsed || !Array.isArray(parsed.items)) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    function writeCache(userId: string, nextItems: UserRecordRow[]) {
        try {
            const payload: CachedLibrary = {
                updated_at: new Date().toISOString(),
                items: nextItems
            };
            window.localStorage.setItem(`${LIBRARY_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
        } catch {
            return;
        }
    }

    function resetLibraryState() {
        setItems([]);
        setStatus("");
        setError("");
        setBusyId(null);
        setLoading(false);
    }

    async function load(userId: string) {
        if (!userId) {
            resetLibraryState();
            return;
        }

        const seq = loadSeqRef.current + 1;
        loadSeqRef.current = seq;
        const isStale = () =>
            loadSeqRef.current !== seq || activeUserIdRef.current !== userId;

        setLoading(true);
        setError("");
        setStatus("");

        try {
            const q = supabase
                .from("user_records")
                .select("id,list_type,record_id")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(400);

            const { data: urData, error: urError } = await q;

            if (urError) {
                throw urError;
            }

            const userRecords = (urData ?? []) as UserRecordBaseRow[];
            if (userRecords.length === 0) {
                if (isStale()) {
                    return;
                }
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

            if (isStale()) {
                return;
            }

            setItems(merged);
            writeCache(userId, merged);
        } catch (e) {
            if (isStale()) {
                return;
            }

            const cached = readCache(userId);
            if (cached?.items?.length) {
                setItems(cached.items);
                const when = new Date(cached.updated_at).toLocaleString();
                setStatus(`Mode hors-ligne — dernière mise à jour ${when}.`);
                return;
            }

            setError(String(e));
        } finally {
            if (!isStale()) {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        let isMounted = true;

        async function initAuth() {
            try {
                const { data, error: sessionError } = await supabase.auth.getSession();
                if (!isMounted) {
                    return;
                }
                if (sessionError) {
                    console.error("[MyLibraryPage] getSession failed", sessionError);
                }
                const userId = data.session?.user.id ?? null;
                activeUserIdRef.current = userId;
                setAuthUserId(userId);
                setAuthReady(true);
                if (!userId) {
                    resetLibraryState();
                }
            } catch (error) {
                if (!isMounted) {
                    return;
                }
                console.error("[MyLibraryPage] getSession failed", error);
                activeUserIdRef.current = null;
                setAuthUserId(null);
                setAuthReady(true);
                resetLibraryState();
            }
        }

        initAuth();

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            const prevUserId = activeUserIdRef.current;
            const userId = session?.user.id ?? null;
            activeUserIdRef.current = userId;
            setAuthUserId(userId);
            setAuthReady(true);
            if (!userId || (prevUserId && prevUserId !== userId)) {
                resetLibraryState();
            }
        });

        return () => {
            isMounted = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!authReady || !authUserId) {
            return;
        }
        load(authUserId);
    }, [authReady, authUserId]);

    async function removeItem(userRecord: UserRecordRow) {
        setError("");
        setStatus("");
        setBusyId(userRecord.id);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                setError("Merci de te connecter.");
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

            setItems((prev) => {
                const next = prev.filter((x) => x.id !== userRecord.id);
                if (session) {
                    writeCache(session.user.id, next);
                }
                return next;
            });
            await library.reload();

            setStatus(userRecord.list_type === "collection" ? "Retiré de la collection." : "Retiré de la wishlist.");
        } catch (e) {
            setError(String(e));
        } finally {
            setBusyId(null);
        }
    }

    const filteredItems = useMemo(() => {
        let out = items;
        if (filter !== "all") {
            out = out.filter((ur) => ur.list_type === filter);
        }

        const needle = searchText.trim().toLowerCase();
        if (!needle) {
            return out;
        }

        return out.filter((ur) => {
            const r = ur.record;
            if (!r) {
                return false;
            }
            return `${r.artist} ${r.title}`.toLowerCase().includes(needle);
        });
    }, [items, searchText]);

    const needsLogin = authReady && !authUserId;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
            </div>

            <h1>Ma bibliothèque</h1>

            {needsLogin ? (
                <div className="panel" style={{ marginTop: 16, maxWidth: 520 }}>
                    <div className="panelTitle">Connexion requise</div>
                    <div className="muted" style={{ marginTop: 8 }}>
                        Connecte-toi pour voir et gérer ta bibliothèque.
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <Link className="btn btnPrimary" to="/login">
                            Aller à la connexion
                        </Link>
                    </div>
                </div>
            ) : null}

            {needsLogin ? null : (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => setFilter("all")} disabled={filter === "all"} className="btn btnGhost">
                    Tout
                </button>
                <button onClick={() => setFilter("collection")} disabled={filter === "collection"} className="btn btnGhost">
                    Collection
                </button>
                <button onClick={() => setFilter("wishlist")} disabled={filter === "wishlist"} className="btn btnGhost">
                    Wishlist
                </button>

                <div style={{ flex: 1 }} />

                <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filtrer par artiste ou titre"
                    className="input"
                    style={{ minWidth: 240 }}
                />
            </div>
            )}

            {loading ? <div style={{ marginTop: 12 }} className="muted">Chargement…</div> : null}
            {error && !needsLogin ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            {needsLogin ? null : (
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
                                        <span
                                            className={`pill ${ur.list_type === "collection" ? "pillCollection" : "pillWishlist"}`}
                                        >
                                            {ur.list_type === "collection" ? "Collection" : "Wishlist"}
                                        </span>
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
                                            Ouvrir
                                        </Link>
                                        <button
                                            onClick={() => removeItem(ur)}
                                            disabled={busyId === ur.id}
                                            className="btn btnGhost"
                                        >
                                            Retirer
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
