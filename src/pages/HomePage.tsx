import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

type RecordRow = {
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
    list_type: "collection" | "wishlist";
    records: RecordRow[];
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

type Props = {
    onRequireAuth: () => void;
};

export default function HomePage(props: Props) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

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

    useEffect(() => {
        async function init() {
            const { data } = await supabase.auth.getSession();
            setIsAuthenticated(!!data.session);
        }

        init();

        const {
            data: { subscription }
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthenticated(!!session);
        });

        return () => subscription.unsubscribe();
    }, []);

    async function loadLibraryPreview() {
        setLibraryLoading(true);
        setLibraryError("");

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                setCollectionItems([]);
                setWishlistItems([]);
                return;
            }

            const { data, error } = await supabase
                .from("user_records")
                .select(
                    `
                    list_type,
                    records (
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
                .order("created_at", { ascending: false })
                .limit(60);

            if (error) {
                throw error;
            }

            const rows = (data ?? []) as unknown as UserRecordRow[];

            const collection: RecordRow[] = [];
            const wishlist: RecordRow[] = [];

            for (const ur of rows) {
                const r = ur.records?.[0];
                if (!r) {
                    continue;
                }
                if (ur.list_type === "collection") {
                    collection.push(r);
                } else if (ur.list_type === "wishlist") {
                    wishlist.push(r);
                }
            }

            setCollectionItems(collection.slice(0, 8));
            setWishlistItems(wishlist.slice(0, 8));
        } catch (e) {
            setLibraryError(String(e));
        } finally {
            setLibraryLoading(false);
        }
    }

    useEffect(() => {
        if (!isAuthenticated) {
            setCollectionItems([]);
            setWishlistItems([]);
            return;
        }
        loadLibraryPreview();
    }, [isAuthenticated]);

    async function fetchSearchPage(nextPage: number, append: boolean) {
        setSearchError("");
        setSearchLoading(true);

        try {
            const baseUrl = import.meta.env.VITE_DISCOGS_PROXY_BASE_URL as string;
            const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&type=release&page=${nextPage}&per_page=50`;

            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const json = (await resp.json()) as DiscogsSearchResponse;

            const vinylReleases = (json.results ?? []).filter(
                (r) => r.type === "release" && Array.isArray(r.format) && r.format.includes("Vinyl")
            );

            const pagination = json.pagination;
            if (pagination) {
                setPage(pagination.page);
                setPagesTotal(pagination.pages);
                setItemsTotal(pagination.items);
            }

            setResults((prev) => (append ? [...prev, ...vinylReleases] : vinylReleases));
        } catch (e) {
            setSearchError(String(e));
        } finally {
            setSearchLoading(false);
        }
    }

    async function search() {
        setResults([]);
        setPage(1);
        setPagesTotal(1);
        setItemsTotal(0);
        await fetchSearchPage(1, false);
    }

    async function loadMore() {
        if (searchLoading) {
            return;
        }
        const nextPage = page + 1;
        if (nextPage > pagesTotal) {
            return;
        }
        await fetchSearchPage(nextPage, true);
    }

    const canLoadMore = !searchLoading && query.length > 0 && page < pagesTotal;

    const heroSubtitle = useMemo(() => {
        if (isAuthenticated) {
            return "Cherche des vinyles, ajoute les à ta collection ou à ta wishlist, et partage ton profil.";
        }
        return "Cherche des vinyles, prépare ta wishlist, garde ta collection à jour, et partage la avec tes amis.";
    }, [isAuthenticated]);

    return (
        <div className="page">
            <section className="hero">
                <div className="heroLeft">
                    <div className="badge">Grooves</div>
                    <h1 className="heroTitle">Ta collection de vinyles, simple à gérer, simple à partager.</h1>
                    <p className="heroSubtitle">{heroSubtitle}</p>

                    {!isAuthenticated ? (
                        <div className="heroCtas">
                            <button className="btn btnPrimary" onClick={props.onRequireAuth}>
                                Se connecter
                            </button>
                            <Link className="btn btnGhost" to="/people">
                                Découvrir des profils
                            </Link>
                        </div>
                    ) : (
                        <div className="heroCtas">
                            <Link className="btn btnPrimary" to="/my-library">
                                Ouvrir ma bibliothèque
                            </Link>
                            <Link className="btn btnGhost" to="/profile">
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
                                placeholder="Daft Punk, Discovery, 10th anniversary"
                            />
                            <button className="btn btnPrimary" onClick={search} disabled={!query || searchLoading}>
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
                                    <button className="btn btnGhost" onClick={loadMore} disabled={!canLoadMore}>
                                        Charger plus
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="sectionHeader">
                    <h2 className="sectionTitle">Ta bibliothèque</h2>
                    <div className="sectionRight">
                        {isAuthenticated ? (
                            <Link className="btn btnGhost" to="/my-library">
                                Voir tout
                            </Link>
                        ) : null}
                    </div>
                </div>

                {!isAuthenticated ? (
                    <div className="panel">
                        <div className="panelTitle">Bienvenue sur Grooves</div>
                        <p className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                            Grooves te permet de retrouver facilement des vinyles, puis de les classer en deux listes:
                            ta collection et ta wishlist. Ensuite tu peux partager un lien public pour que les autres
                            voient ce que tu as déjà, et ce que tu recherches.
                        </p>
                        <div className="heroCtas" style={{ marginTop: 14 }}>
                            <button className="btn btnPrimary" onClick={props.onRequireAuth}>
                                Se connecter pour commencer
                            </button>
                            <Link className="btn btnGhost" to="/people">
                                Découvrir des profils
                            </Link>
                        </div>
                    </div>
                ) : (
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
                )}
            </section>

            <footer className="footer">
                <div className="muted small">Données Discogs via proxy, stockage et auth via Supabase.</div>
            </footer>
        </div>
    );
}
