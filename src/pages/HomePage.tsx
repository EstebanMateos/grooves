import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithRateLimit } from "../utils/fetchWithRateLimit";
import { useUserProfileSummary } from "../hooks/useUserProfileSummary";
import { useAuthSession } from "../hooks/useAuthSession";
import { isDebugEnabled } from "../utils/supabaseDebug";
import { loadLibraryPreview as fetchLibraryPreview, type LibraryRecord } from "../utils/libraryApi";
import {
    isDiscogsSearchQueryValid,
    MIN_DISCOGS_SEARCH_LENGTH,
    normalizeDiscogsSearchQuery
} from "../utils/discogsSearch";
import { getDiscogsProxyBaseUrl } from "../utils/discogsProxy";
import { formatUiError } from "../utils/uiError";

type DiscogsReleaseSearchItem = {
    id: number;
    type: string;
    title: string;
    year?: number;
    country?: string;
    format?: string[];
    thumb?: string;
};

type DiscogsSearchResponse = {
    pagination?: {
        page: number;
        pages: number;
        per_page: number;
        items: number;
    };
    results?: DiscogsReleaseSearchItem[];
};

export default function HomePage() {
    const navigate = useNavigate();
    const auth = useAuthSession();
    const profile = useUserProfileSummary();
    const debugEnabled = isDebugEnabled();
    const debugLog = (...args: unknown[]) => {
        if (debugEnabled) {
            console.log(...args);
        }
    };
    const debugWarn = (...args: unknown[]) => {
        if (debugEnabled) {
            console.warn(...args);
        }
    };
    const debugError = (...args: unknown[]) => {
        if (debugEnabled) {
            console.error(...args);
        }
    };
    const debugGroup = (label: string) => {
        if (debugEnabled) {
            console.group(label);
        }
    };
    const debugGroupEnd = () => {
        if (debugEnabled) {
            console.groupEnd();
        }
    };
    const debugTime = (label: string) => {
        if (debugEnabled) {
            console.time(label);
        }
    };
    const debugTimeEnd = (label: string) => {
        if (debugEnabled) {
            console.timeEnd(label);
        }
    };

    const is_authenticated = !auth.is_loading && auth.is_authenticated;
    const user_id = auth.user_id;

    const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
    const [libraryError, setLibraryError] = useState<string>("");

    const [collectionItems, setCollectionItems] = useState<LibraryRecord[]>([]);
    const [wishlistItems, setWishlistItems] = useState<LibraryRecord[]>([]);

    const [query, setQuery] = useState<string>("");
    const [searchLoading, setSearchLoading] = useState<boolean>(false);
    const [searchError, setSearchError] = useState<string>("");
    const [results, setResults] = useState<DiscogsReleaseSearchItem[]>([]);

    const [page, setPage] = useState<number>(1);
    const [pagesTotal, setPagesTotal] = useState<number>(1);
    const [itemsTotal, setItemsTotal] = useState<number>(0);

    const libraryLoadSeqRef = useRef<number>(0);
    const libraryActiveRef = useRef<number>(0);
    const searchLoadSeqRef = useRef<number>(0);
    const searchControllerRef = useRef<AbortController | null>(null);

    async function loadLibraryPreview(k_user_id: string) {
        const request_id = libraryLoadSeqRef.current + 1;
        libraryLoadSeqRef.current = request_id;

        libraryActiveRef.current += 1;

        debugGroup("[HomePage] loadLibraryPreview");
        debugLog("request_id", request_id);
        debugLog("active_requests", libraryActiveRef.current);
        debugLog("user_id", k_user_id);

        setLibraryLoading(true);
        setLibraryError("");

        try {
            debugTime("[HomePage] collection_group_items");
            const preview = await fetchLibraryPreview(k_user_id);
            debugTimeEnd("[HomePage] collection_group_items");

            debugLog("collection count", preview.collection.length);
            debugLog("wishlist count", preview.wishlist.length);

            if (preview.collection.length === 0 && preview.wishlist.length === 0) {
                debugLog("no library rows");
                if (libraryLoadSeqRef.current === request_id) {
                    setCollectionItems([]);
                    setWishlistItems([]);
                }
                return;
            }

            if (libraryLoadSeqRef.current !== request_id) {
                debugWarn("stale request, skip state update");
                return;
            }

            setCollectionItems(preview.collection.slice(0, 8));
            setWishlistItems(preview.wishlist.slice(0, 8));
        } catch (e) {
            debugError("[HomePage] loadLibraryPreview error", e);
            if (libraryLoadSeqRef.current === request_id) {
                setLibraryError(formatUiError(e));
            }
        } finally {
            libraryActiveRef.current = Math.max(0, libraryActiveRef.current - 1);
            debugLog("active_requests after finally", libraryActiveRef.current);

            if (libraryActiveRef.current === 0) {
                debugLog("libraryLoading -> false");
                setLibraryLoading(false);
            }

            debugGroupEnd();
        }
    }

    useEffect(() => {
        debugGroup("[HomePage] auth effect");
        debugLog("auth_loading", auth.is_loading);
        debugLog("auth_user_id", user_id);
        debugGroupEnd();

        libraryLoadSeqRef.current += 1;

        if (auth.is_loading) {
            debugLog("[HomePage] auth loading, skip library load");
            setLibraryLoading(false);
            return;
        }

        if (!user_id) {
            debugLog("[HomePage] no user_id, clear library");
            setCollectionItems([]);
            setWishlistItems([]);
            setLibraryLoading(false);
            setLibraryError("");
            return;
        }

        void loadLibraryPreview(user_id);
    // The load helper intentionally captures the current debug functions and user id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.is_loading, user_id]);

    useEffect(() => {
        return () => {
            searchControllerRef.current?.abort();
        };
    }, []);

    async function fetchSearchPage(nextPage: number, append: boolean) {
        const normalizedQuery = normalizeDiscogsSearchQuery(query);
        const request_id = searchLoadSeqRef.current + 1;
        searchLoadSeqRef.current = request_id;
        searchControllerRef.current?.abort();
        const controller = new AbortController();
        searchControllerRef.current = controller;
        const is_stale = () => searchLoadSeqRef.current !== request_id;

        debugGroup("[HomePage] search");
        debugLog("request_id", request_id);
        debugLog("query", normalizedQuery);
        debugLog("page", nextPage);

        setSearchError("");
        setSearchLoading(true);

        try {
            const baseUrl = getDiscogsProxyBaseUrl();
            const url = `${baseUrl}/search?q=${encodeURIComponent(normalizedQuery)}&type=release&page=${nextPage}&per_page=50`;

            const resp = await fetchWithRateLimit(url, { signal: controller.signal });
            debugLog("search status", resp.status);

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const json = (await resp.json()) as DiscogsSearchResponse;
            debugLog("search results raw", json.results?.length);

            const vinylReleases = (json.results ?? []).filter(
                (r) => r.type === "release" && Array.isArray(r.format) && r.format.includes("Vinyl")
            );

            debugLog("vinyl results", vinylReleases.length);

            const pagination = json.pagination;
            if (pagination) {
                if (is_stale()) {
                    return;
                }
                setPage(pagination.page);
                setPagesTotal(pagination.pages);
                setItemsTotal(pagination.items);
            }

            if (is_stale()) {
                return;
            }
            setResults((prev) => (append ? [...prev, ...vinylReleases] : vinylReleases));
        } catch (e) {
            debugError("[HomePage] search error", e);
            if (!controller.signal.aborted && !is_stale()) {
                setSearchError(formatUiError(e));
            }
        } finally {
            if (!is_stale()) {
                setSearchLoading(false);
            }
            debugGroupEnd();
        }
    }

    async function search() {
        const normalizedQuery = normalizeDiscogsSearchQuery(query);
        if (!isDiscogsSearchQueryValid(normalizedQuery)) {
            searchControllerRef.current?.abort();
            setResults([]);
            setPage(1);
            setPagesTotal(1);
            setItemsTotal(0);
            setSearchError(`Entre au moins ${MIN_DISCOGS_SEARCH_LENGTH} caractères.`);
            return;
        }
        if (query !== normalizedQuery) {
            setQuery(normalizedQuery);
        }
        searchControllerRef.current?.abort();
        setResults([]);
        setPage(1);
        setPagesTotal(1);
        setItemsTotal(0);
        await fetchSearchPage(1, false);
    }

    const canSearch = isDiscogsSearchQueryValid(query);
    const canOpenSearch = !searchLoading && canSearch && results.length > 0;

    const heroSubtitle = useMemo(() => {
        if (auth.is_loading || is_authenticated) {
            return "Cherche des vinyles, ajoute les à ta collection ou à ta wishlist, et partage ton profil.";
        }
        return "Cherche des vinyles, prépare ta wishlist, garde ta collection à jour, et partage la avec tes amis.";
    }, [auth.is_loading, is_authenticated]);

    const showProfilePrompt =
        is_authenticated && !profile.loading && !!profile.username && profile.username.startsWith("ano_");

    return (
        <div className="page">
            {showProfilePrompt ? (
                <div className="panel" style={{ marginBottom: 16 }}>
                    <div className="panelTitle">Choisis ton pseudo</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                        Tu utilises encore un pseudo automatique. Personnalise le pour ton profil public.
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <button className="btn btnPrimary" onClick={() => navigate("/profile")}>
                            Mettre à jour mon profil
                        </button>
                    </div>
                </div>
            ) : null}

            <section className="hero">
                <div className="heroLeft">
                    <div className="badge">Grooves</div>
                    <h1 className="heroTitle">Ta collection de vinyles, simple à gérer, simple à partager.</h1>
                    <p className="heroSubtitle">{heroSubtitle}</p>

                    {auth.is_loading ? null : !is_authenticated ? (
                        <div className="heroCtas">
                            <Link className="btn btnPrimary" to="/login">
                                Se connecter
                            </Link>
                            <Link className="btn btnGhost" to="/people">
                                Découvrir des profils
                            </Link>
                        </div>
                    ) : (
                        <div className="heroCtas">
                            <Link className="btn btnPrimary" to="/my-library" style={{ justifyContent: "center" }}>
                                Ouvrir ma bibliothèque
                            </Link>
                            <Link className="btn btnGhost" to="/profile" style={{ justifyContent: "center" }}>
                                Paramètres du profil
                            </Link>
                        </div>
                    )}
                </div>

                <div className="heroRight">
                    <div className="panel">
                        <div className="panelTitle">Recherche</div>
                        <label className="srOnly" htmlFor="home-search-input">
                            Recherche Discogs
                        </label>
                        <div className="searchRow">
                            <input
                                id="home-search-input"
                                className="input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && canSearch && !searchLoading) {
                                        void search();
                                    }
                                }}
                                placeholder="Daft Punk, Discovery, 10th anniversary"
                            />
                            <button className="btn btnPrimary" onClick={() => void search()} disabled={!canSearch || searchLoading}>
                                {searchLoading ? "Recherche…" : "Rechercher"}
                            </button>
                        </div>

                        <div className="muted small" style={{ marginTop: 10 }}>
                            {itemsTotal > 0 ? (
                                <span>
                                    Résultats: {itemsTotal} · Page {page}/{pagesTotal}
                                </span>
                            ) : (
                                <span>Astuce: cherche un artiste, un album, une édition, un label.</span>
                            )}
                        </div>

                        {searchLoading ? <div className="muted" style={{ marginTop: 12 }}>Chargement…</div> : null}
                        {searchError ? <div className="error" style={{ marginTop: 12 }}>{searchError}</div> : null}

                        {results.length > 0 ? (
                            <>
                                <div className="grid" style={{ marginTop: 14 }}>
                                    {results.slice(0, 8).map((r) => (
                                        <Link key={r.id} to={`/release/${r.id}`} className="cardLink">
                                            <div className="card">
                                                <div className="thumb">
                                                    {r.thumb ? <img className="thumbImg" src={r.thumb} alt={r.title} /> : null}
                                                </div>
                                                <div className="cardBody">
                                                    <div className="cardTitle">{r.title}</div>
                                                    <div className="muted small">
                                                        {r.year ?? "?"} · {r.country ?? "?"}
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>

                                <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                                    <button
                                        className="btn btnGhost"
                                        onClick={() => navigate(`/search?q=${encodeURIComponent(normalizeDiscogsSearchQuery(query))}`)}
                                        disabled={!canOpenSearch}
                                    >
                                        Charger plus
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </section>

            {is_authenticated ? (
                <section className="section">
                    <div className="sectionHeader">
                        <h2 className="sectionTitle">Ta bibliothèque</h2>
                        <div className="sectionRight">
                            <Link className="btn btnGhost" to="/my-library">
                                Voir tout
                            </Link>
                        </div>
                    </div>

                    <>
                        {libraryLoading ? <div className="muted">Chargement…</div> : null}
                        {libraryError ? <div className="error">{libraryError}</div> : null}

                        <div className="twoCols">
                            <div className="panel">
                                <div className="panelTitle">Collection</div>
                                {collectionItems.length === 0 ? (
                                    <div className="muted" style={{ marginTop: 10 }}>
                                        Ta collection est vide pour le moment. Cherche un vinyle et ajoute le.
                                    </div>
                                ) : (
                                    <div className="grid" style={{ marginTop: 12 }}>
                                        {collectionItems.map((r) => (
                                            <Link
                                                key={`c_${r.discogs_release_id}`}
                                                to={`/release/${r.discogs_release_id}`}
                                                className="cardLink"
                                            >
                                                <div className="card">
                                                    <div className="thumb">
                                                        {r.thumb_url ? (
                                                            <img className="thumbImg" src={r.thumb_url} alt={r.title} />
                                                        ) : null}
                                                    </div>
                                                    <div className="cardBody">
                                                        <div className="cardTitle">{r.title}</div>
                                                        <div className="muted small">
                                                            {r.artist} · {r.year ?? "?"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="panel">
                                <div className="panelTitle">Wishlist</div>
                                {wishlistItems.length === 0 ? (
                                    <div className="muted" style={{ marginTop: 10 }}>
                                        Ta wishlist est vide pour le moment. Cherche un vinyle et ajoute le.
                                    </div>
                                ) : (
                                    <div className="grid" style={{ marginTop: 12 }}>
                                        {wishlistItems.map((r) => (
                                            <Link
                                                key={`w_${r.discogs_release_id}`}
                                                to={`/release/${r.discogs_release_id}`}
                                                className="cardLink"
                                            >
                                                <div className="card">
                                                    <div className="thumb">
                                                        {r.thumb_url ? (
                                                            <img className="thumbImg" src={r.thumb_url} alt={r.title} />
                                                        ) : null}
                                                    </div>
                                                    <div className="cardBody">
                                                        <div className="cardTitle">{r.title}</div>
                                                        <div className="muted small">
                                                            {r.artist} · {r.year ?? "?"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                </section>
            ) : null}

            <footer className="footer">
                <div className="muted small">Données Discogs via proxy, stockage et auth via Supabase.</div>
            </footer>
        </div>
    );
}
