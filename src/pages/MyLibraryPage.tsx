import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";
import { useAuthSession } from "../hooks/useAuthSession";
import { isDebugEnabled } from "../utils/supabaseDebug";
import BackButton from "../components/BackButton";
import { ensureCollectionGroupId } from "../utils/collectionGroup";
import { LIBRARY_CACHE_PREFIX } from "../utils/libraryCache";
import {
    addCollectionRecord,
    loadLibraryItems,
    removeCollectionItemById,
    removeWishlistItemById,
    type LibraryItem
} from "../utils/libraryApi";

type LibraryItemRow = LibraryItem;

type FilterType = "collection" | "wishlist" | "all";
type SortKey = "recent" | "title" | "artist" | "year";
type ViewMode = "grid" | "list";
type BusyAction = "remove" | "move";

type CachedLibrary = {
    updated_at: string;
    items: LibraryItemRow[];
};

export default function MyLibraryPage() {
    const library = useUserLibraryIndex();
    const auth = useAuthSession();

    const [items, setItems] = useState<LibraryItemRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchText, setSearchText] = useState<string>("");
    const [sortKey, setSortKey] = useState<SortKey>("recent");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [collectionGroupId, setCollectionGroupId] = useState<string | null>(null);
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

    function writeCache(userId: string, nextItems: LibraryItemRow[]) {
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
        setBusyAction(null);
        setLoading(false);
        setCollectionGroupId(null);
    }

    async function load(userId: string) {
        if (!userId) {
            resetLibraryState();
            return;
        }

        const seq = loadSeqRef.current + 1;
        loadSeqRef.current = seq;
        activeUserIdRef.current = userId;
        const isStale = () =>
            loadSeqRef.current !== seq || activeUserIdRef.current !== userId;

        setLoading(true);
        setError("");
        setStatus("");

        try {
            const result = await loadLibraryItems(userId);
            if (isStale()) {
                return;
            }
            setCollectionGroupId(result.collectionGroupId);

            if (result.items.length === 0) {
                if (isStale()) {
                    return;
                }
                setItems([]);
                writeCache(userId, []);
                return;
            }

            if (isStale()) {
                return;
            }

            setItems(result.items);
            writeCache(userId, result.items);
        } catch (e) {
            if (isStale()) {
                return;
            }

            if (isDebugEnabled()) {
                console.error("[MyLibraryPage] load failed", e);
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
        if (auth.is_loading) {
            return;
        }
        if (!auth.is_authenticated || !auth.user_id) {
            activeUserIdRef.current = null;
            resetLibraryState();
            return;
        }
        activeUserIdRef.current = auth.user_id;
        void load(auth.user_id);
    // load is intentionally called from the current auth snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.is_loading, auth.is_authenticated, auth.user_id]);

    async function removeItem(userRecord: LibraryItemRow) {
        setError("");
        setStatus("");
        setBusyId(userRecord.id);
        setBusyAction("remove");

        try {
            if (auth.is_loading) {
                return;
            }
            if (!auth.is_authenticated || !auth.user_id) {
                setError("Merci de te connecter.");
                return;
            }
            const userId = auth.user_id;

            if (userRecord.list_type === "collection") {
                if (!collectionGroupId) {
                    throw new Error("Groupe de collection introuvable.");
                }
                await removeCollectionItemById(userRecord.id, collectionGroupId);
            } else {
                await removeWishlistItemById(userRecord.id, userId);
            }

            setItems((prev) => {
                const next = prev.filter(
                    (x) => !(x.id === userRecord.id && x.list_type === userRecord.list_type)
                );
                writeCache(userId, next);
                return next;
            });
            await library.reload();

            setStatus(userRecord.list_type === "collection" ? "Retiré de la collection." : "Retiré de la wishlist.");
        } catch (e) {
            if (isDebugEnabled()) {
                console.error("[MyLibraryPage] removeItem failed", e);
            }
            setError(String(e));
        } finally {
            setBusyId(null);
            setBusyAction(null);
        }
    }

    async function moveWishlistItemToCollection(userRecord: LibraryItemRow) {
        if (userRecord.list_type !== "wishlist" || !userRecord.record) {
            return;
        }

        setError("");
        setStatus("");
        setBusyId(userRecord.id);
        setBusyAction("move");

        try {
            if (auth.is_loading) {
                return;
            }
            if (!auth.is_authenticated || !auth.user_id) {
                setError("Merci de te connecter.");
                return;
            }

            const userId = auth.user_id;
            const groupId = collectionGroupId ?? await ensureCollectionGroupId();
            const existingCollectionItem = items.find(
                (item) => item.list_type === "collection" && item.record_id === userRecord.record_id
            );

            const collectionItem = existingCollectionItem
                ? {
                    id: existingCollectionItem.id,
                    record_id: existingCollectionItem.record_id,
                    created_at: existingCollectionItem.created_at
                }
                : await addCollectionRecord(userRecord.record_id, userId, groupId);

            await removeWishlistItemById(userRecord.id, userId);
            setCollectionGroupId(groupId);

            setItems((prev) => {
                const withoutWishlist = prev.filter(
                    (item) => !(item.id === userRecord.id && item.list_type === "wishlist")
                );
                const alreadyInCollection = withoutWishlist.some(
                    (item) => item.list_type === "collection" && item.record_id === userRecord.record_id
                );
                const next = alreadyInCollection
                    ? withoutWishlist
                    : [
                        {
                            id: collectionItem.id,
                            list_type: "collection" as const,
                            record_id: collectionItem.record_id,
                            record: userRecord.record,
                            created_at: collectionItem.created_at
                        },
                        ...withoutWishlist
                    ];
                writeCache(userId, next);
                return next;
            });

            await library.reload();
            setStatus("Ajouté à la collection.");
        } catch (e) {
            if (isDebugEnabled()) {
                console.error("[MyLibraryPage] moveWishlistItemToCollection failed", e);
            }
            setError(String(e));
        } finally {
            setBusyId(null);
            setBusyAction(null);
        }
    }

    const sortedItems = useMemo(() => {
        let out = items.filter((ur) => !!ur.record);
        if (filter !== "all") {
            out = out.filter((ur) => ur.list_type === filter);
        }

        const needle = searchText.trim().toLowerCase();
        if (needle) {
            out = out.filter((ur) => {
                const r = ur.record;
                if (!r) {
                    return false;
                }
                return `${r.artist} ${r.title}`.toLowerCase().includes(needle);
            });
        }

        const next = [...out];
        const compareText = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" });

        if (sortKey === "recent") {
            next.sort((a, b) => {
                const aTime = a.created_at ? Date.parse(a.created_at) : 0;
                const bTime = b.created_at ? Date.parse(b.created_at) : 0;
                return bTime - aTime;
            });
        } else if (sortKey === "title") {
            next.sort((a, b) => {
                const titleCmp = compareText(a.record?.title ?? "", b.record?.title ?? "");
                if (titleCmp !== 0) {
                    return titleCmp;
                }
                const artistCmp = compareText(a.record?.artist ?? "", b.record?.artist ?? "");
                if (artistCmp !== 0) {
                    return artistCmp;
                }
                const yearA = a.record?.year ?? Number.POSITIVE_INFINITY;
                const yearB = b.record?.year ?? Number.POSITIVE_INFINITY;
                return yearA - yearB;
            });
        } else if (sortKey === "artist") {
            next.sort((a, b) => {
                const artistCmp = compareText(a.record?.artist ?? "", b.record?.artist ?? "");
                if (artistCmp !== 0) {
                    return artistCmp;
                }
                return compareText(a.record?.title ?? "", b.record?.title ?? "");
            });
        } else if (sortKey === "year") {
            next.sort((a, b) => {
                const yearA = a.record?.year ?? Number.POSITIVE_INFINITY;
                const yearB = b.record?.year ?? Number.POSITIVE_INFINITY;
                if (yearA !== yearB) {
                    return yearA - yearB;
                }
                return compareText(a.record?.title ?? "", b.record?.title ?? "");
            });
        }

        return next;
    }, [items, searchText, filter, sortKey]);

    const needsLogin = !auth.is_loading && !auth.is_authenticated;
    const collectionItems = filter === "all" ? sortedItems.filter((ur) => ur.list_type === "collection") : [];
    const wishlistItems = filter === "all" ? sortedItems.filter((ur) => ur.list_type === "wishlist") : [];

    const renderItem = (ur: LibraryItemRow) => {
        const r = ur.record;
        if (!r) {
            return null;
        }
        const isBusy = busyId === ur.id;
        const isMoving = isBusy && busyAction === "move";
        const isRemoving = isBusy && busyAction === "remove";

        if (viewMode === "grid") {
            return (
                <div key={ur.id} className="libraryGridItem">
                    <Link to={`/release/${r.discogs_release_id}`} className="cardLink libraryCoverLink">
                        <div className={`libraryCoverCard ${ur.list_type === "collection" ? "libraryCoverCardCollection" : "libraryCoverCardWishlist"}`}>
                            <div className="libraryCoverThumb">
                                {r.thumb_url ? <img className="thumbImg" src={r.thumb_url} alt={r.title} /> : null}
                            </div>
                            <span className={`pill libraryCoverPill ${ur.list_type === "collection" ? "pillCollection" : "pillWishlist"}`}>
                                {ur.list_type === "collection" ? "Collection" : "Wishlist"}
                            </span>
                        </div>
                    </Link>
                    {ur.list_type === "wishlist" ? (
                        <button
                            onClick={() => moveWishlistItemToCollection(ur)}
                            disabled={isBusy}
                            className="btn btnPrimary libraryGridAction"
                        >
                            {isMoving ? "Ajout…" : "Collection"}
                        </button>
                    ) : null}
                    <button
                        onClick={() => removeItem(ur)}
                        disabled={isBusy}
                        className="btn btnGhost libraryGridAction"
                    >
                        {isRemoving ? "Retrait…" : "Retirer"}
                    </button>
                </div>
            );
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
                    {r.thumb_url ? <img className="thumbImg" src={r.thumb_url} alt={r.title} /> : null}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 800 }}>{r.title}</div>
                        <span className={`pill ${ur.list_type === "collection" ? "pillCollection" : "pillWishlist"}`}>
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

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Link to={`/release/${r.discogs_release_id}`} className="btn btnGhost">
                            Ouvrir
                        </Link>
                        {ur.list_type === "wishlist" ? (
                            <button
                                onClick={() => moveWishlistItemToCollection(ur)}
                                disabled={isBusy}
                                className="btn btnPrimary"
                            >
                                {isMoving ? "Ajout…" : "Mettre en collection"}
                            </button>
                        ) : null}
                        <button
                            onClick={() => removeItem(ur)}
                            disabled={isBusy}
                            className="btn btnGhost"
                        >
                            {isRemoving ? "Retrait…" : "Retirer"}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

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
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setFilter("all")} disabled={filter === "all"} className="btn btnGhost">
                        Tout
                    </button>
                    <button
                        onClick={() => setFilter("collection")}
                        disabled={filter === "collection"}
                        className="btn btnGhost"
                    >
                        Collection
                    </button>
                    <button onClick={() => setFilter("wishlist")} disabled={filter === "wishlist"} className="btn btnGhost">
                        Wishlist
                    </button>

                    <div style={{ flex: 1 }} />

                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="muted small">Trier par</span>
                        <select
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                            className="input"
                            style={{ minWidth: 180 }}
                        >
                            <option value="recent">Ajouts récents</option>
                            <option value="title">Titre A-Z</option>
                            <option value="artist">Artiste A-Z</option>
                            <option value="year">Année</option>
                        </select>
                    </label>

                    <input
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Filtrer par artiste ou titre"
                        className="input"
                        style={{ minWidth: 240 }}
                    />

                    <div className="viewToggle" aria-label="Mode d'affichage">
                        <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            disabled={viewMode === "grid"}
                            className="btn btnGhost"
                        >
                            Carrés
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            disabled={viewMode === "list"}
                            className="btn btnGhost"
                        >
                            Liste
                        </button>
                    </div>
                </div>
            )}

            {loading ? <div style={{ marginTop: 12 }} className="muted">Chargement…</div> : null}
            {error && !needsLogin ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            {needsLogin ? null : (
                <div style={{ marginTop: 16 }}>
                    {filter === "all" ? (
                        <div style={{ display: "grid", gap: 16 }}>
                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Collection</div>
                                <div className={viewMode === "grid" ? "libraryGrid" : "libraryList"}>
                                    {collectionItems.length > 0 ? (
                                        collectionItems.map(renderItem)
                                    ) : (
                                        <div className="muted">Aucun disque dans la collection.</div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 8 }}>Wishlist</div>
                                <div className={viewMode === "grid" ? "libraryGrid" : "libraryList"}>
                                    {wishlistItems.length > 0 ? (
                                        wishlistItems.map(renderItem)
                                    ) : (
                                        <div className="muted">Aucun disque dans la wishlist.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={viewMode === "grid" ? "libraryGrid" : "libraryList"}>
                            {sortedItems.map(renderItem)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
