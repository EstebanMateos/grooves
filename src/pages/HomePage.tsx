import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { fetchWithRateLimit } from "../utils/fetchWithRateLimit";
import { useUserProfileSummary } from "../hooks/useUserProfileSummary";
import { useAuthSession } from "../hooks/useAuthSession";
import { isDebugEnabled } from "../utils/supabaseDebug";

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
    list_type: "collection" | "wishlist";
    record_id: string;
};

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

    const [collectionItems, setCollectionItems] = useState<RecordRow[]>([]);
    const [wishlistItems, setWishlistItems] = useState<RecordRow[]>([]);

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
            debugTime("[HomePage] user_records");

            const { data: urData, error: urError } = await supabase
                .from("user_records")
                .select("list_type,record_id")
                .eq("user_id", k_user_id)
                .order("created_at", { ascending: false })
                .limit(120);

            debugTimeEnd("[HomePage] user_records");

            debugLog("user_records count", urData?.length, "error", urError);

            if (urError) {
                throw urError;
            }

            const user_records = (urData ?? []) as UserRecordBaseRow[];
            if (user_records.length === 0) {
                debugLog("no user records");
                if (libraryLoadSeqRef.current === request_id) {
                    setCollectionItems([]);
                    setWishlistItems([]);
                }
                return;
            }

            const record_ids = Array.from(new Set(user_records.map((x) => x.record_id)));
            debugLog("record_ids count", record_ids.length);

            debugTime("[HomePage] records");

            const { data: recData, error: recError } = await supabase
                .from("records")
                .select("id,discogs_release_id,title,artist,year,country,thumb_url,label,catno")
                .in("id", record_ids);

            debugTimeEnd("[HomePage] records");

            debugLog("records count", recData?.length, "error", recError);

            if (recError) {
                throw recError;
            }

            const record_by_id = new Map<string, RecordRow>();
            for (const r of (recData ?? []) as RecordRow[]) {
                record_by_id.set(r.id, r);
            }

            const collection: RecordRow[] = [];
            const wishlist: RecordRow[] = [];

            for (const ur of user_records) {
                const r = record_by_id.get(ur.record_id);
                if (!r) {
                    continue;
                }
                if (ur.list_type === "collection") {
                    collection.push(r);
                } else {
                    wishlist.push(r);
                }
            }

            debugLog("collection size", collection.length);
            debugLog("wishlist size", wishlist.length);

            if (libraryLoadSeqRef.current !== request_id) {
                debugWarn("stale request, skip state update");
                return;
            }

            setCollectionItems(collection.slice(0, 8));
            setWishlistItems(wishlist.slice(0, 8));
        } catch (e) {
            debugError("[HomePage] loadLibraryPreview error", e);
            if (libraryLoadSeqRef.current === request_id) {
                setLibraryError(String(e));
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
    }, [auth.is_loading, user_id]);

    async function fetchSearchPage(nextPage: number, append: boolean) {
        const request_id = searchLoadSeqRef.current + 1;
        searchLoadSeqRef.current = request_id;
        const is_stale = () => searchLoadSeqRef.current !== request_id;

        debugGroup("[HomePage] search");
        debugLog("request_id", request_id);
        debugLog("query", query);
        debugLog("page", nextPage);

        setSearchError("");
        setSearchLoading(true);

        try {
            const baseUrl = import.meta.env.VITE_DISCOGS_PROXY_BASE_URL as string;
            const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&type=release&page=${nextPage}&per_page=50`;

            const resp = await fetchWithRateLimit(url);
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
            if (!is_stale()) {
                setSearchError(String(e));
            }
        } finally {
            if (!is_stale()) {
                setSearchLoading(false);
            }
            debugGroupEnd();
        }
    }

    async function search() {
        setResults([]);
        setPage(1);
        setPagesTotal(1);
        setItemsTotal(0);
        await fetchSearchPage(1, false);
    }

    const canOpenSearch = !searchLoading && query.length > 0 && results.length > 0;

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
                        <div className="searchRow">
                            <input
                                className="input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && query.trim() && !searchLoading) {
                                        void search();
                                    }
                                }}
                                placeholder="Daft Punk, Discovery, 10th anniversary"
                            />
                            <button className="btn btnPrimary" onClick={() => void search()} disabled={!query || searchLoading}>
                                Rechercher
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
                                        onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`)}
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
