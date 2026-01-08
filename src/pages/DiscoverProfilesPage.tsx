import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

type PublicProfileRow = {
    username: string;
    display_name: string | null;
    is_public_collection: boolean;
    is_public_wishlist: boolean;
    collection_count?: number | null;
};

type FavoriteRow = {
    favorite_user_id: string;
    profile: PublicProfileRow | PublicProfileRow[] | null;
};

const REQUEST_TIMEOUT_MS = 8000;
const REQUEST_RETRIES = 2;
const REQUEST_RETRY_DELAY_MS = 1000;

export default function DiscoverProfilesPage() {
    const [query, setQuery] = useState<string>("");
    const [rows, setRows] = useState<PublicProfileRow[]>([]);
    const [defaultRows, setDefaultRows] = useState<PublicProfileRow[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [defaultLoading, setDefaultLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [favorites, setFavorites] = useState<string[]>([]);
    const [favoriteRows, setFavoriteRows] = useState<PublicProfileRow[]>([]);
    const [favoritesLoading, setFavoritesLoading] = useState<boolean>(false);
    const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
    const [favoriteStatus, setFavoriteStatus] = useState<string>("");

    const isSearching = query.trim().length > 0;

    async function withTimeout<T>(promise: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
        let timeoutId: number | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(new Error("Impossible d'accéder à Supabase. Vérifie ta connexion et réessaie."));
            }, timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    async function withRetry<T>(
        factory: () => Promise<T>,
        retries = REQUEST_RETRIES,
        delayMs = REQUEST_RETRY_DELAY_MS
    ): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                return await withTimeout(factory());
            } catch (e) {
                lastError = e;
                if (attempt < retries) {
                    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    async function search() {
        setLoading(true);
        setError("");
        setRows([]);

        try {
            const q = query.trim().toLowerCase();
            if (!q) {
                return;
            }

            const { data, error: dbError } = await withRetry(() =>
                supabase
                    .from("profiles")
                    .select("username,display_name,is_public_collection,is_public_wishlist")
                    .or("is_public_collection.eq.true,is_public_wishlist.eq.true")
                    .ilike("username", `%${q}%`)
                    .order("username", { ascending: true })
                    .limit(30)
            );

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

    async function loadDefault() {
        setDefaultLoading(true);
        setError("");

        try {
            const { data, error: dbError } = await withRetry(() =>
                supabase
                    .from("top_profiles_by_collection")
                    .select("username,display_name,is_public_collection,is_public_wishlist,collection_count")
            );

            if (dbError) {
                throw dbError;
            }

            setDefaultRows((data ?? []) as PublicProfileRow[]);
        } catch (e) {
            try {
                const { data, error: fallbackError } = await withRetry(() =>
                    supabase
                        .from("profiles")
                        .select("username,display_name,is_public_collection,is_public_wishlist")
                        .or("is_public_collection.eq.true,is_public_wishlist.eq.true")
                        .order("username", { ascending: true })
                        .limit(5)
                );

                if (fallbackError) {
                    throw fallbackError;
                }

                setDefaultRows((data ?? []) as PublicProfileRow[]);
            } catch (fallback) {
                setError(String(fallback));
            }
        } finally {
            setDefaultLoading(false);
        }
    }

    async function loadFavorites() {
        setFavoritesLoading(true);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;
            if (!session) {
                setFavorites([]);
                setFavoriteRows([]);
                return;
            }

            const { data, error: favError } = await withRetry(() =>
                supabase
                    .from("profile_favorites")
                    .select(
                        `
                        favorite_user_id,
                        profile:profiles!profile_favorites_favorite_user_id_fkey (
                            username,
                            display_name,
                            is_public_collection,
                            is_public_wishlist
                        )
                    `
                    )
                    .eq("user_id", session.user.id)
            );

            if (favError) {
                throw favError;
            }

            const favRows = (data ?? []) as unknown as FavoriteRow[];
            const favProfiles = favRows
                .map((r) => (Array.isArray(r.profile) ? r.profile[0] : r.profile))
                .filter((x): x is PublicProfileRow => !!x);
            setFavorites(favProfiles.map((p) => p.username).filter((x) => !!x));
            setFavoriteRows(favProfiles.filter((x) => x.is_public_collection || x.is_public_wishlist));
        } catch (e) {
            setFavorites([]);
            setFavoriteRows([]);
            setError(String(e));
        } finally {
            setFavoritesLoading(false);
        }
    }

    async function toggleFavorite(username: string) {
        if (favoriteBusy) {
            return;
        }

        setFavoriteStatus("");
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            setFavoriteStatus("Connecte-toi pour ajouter des favoris.");
            return;
        }

        const wasFavorite = favorites.includes(username);
        const optimistic = wasFavorite ? favorites.filter((u) => u !== username) : [...favorites, username];
        setFavorites(optimistic);
        setFavoriteBusy(username);

            const { data: profileRow, error: profileError } = await withRetry(() =>
                supabase
                    .from("profiles")
                    .select("id")
                    .eq("username", username)
                    .maybeSingle()
            );

        if (profileError || !profileRow?.id) {
            setFavorites(favorites);
            setFavoriteStatus("Impossible de mettre à jour ce favori.");
            setFavoriteBusy(null);
            return;
        }

        if (wasFavorite) {
            const { error: delError } = await withRetry(() =>
                supabase
                    .from("profile_favorites")
                    .delete()
                    .eq("user_id", session.user.id)
                    .eq("favorite_user_id", profileRow.id)
            );
            if (delError) {
                setFavorites(favorites);
                setFavoriteStatus(delError.message);
            }
        } else {
            const { error: insError } = await withRetry(() =>
                supabase
                    .from("profile_favorites")
                    .upsert(
                        { user_id: session.user.id, favorite_user_id: profileRow.id },
                        { onConflict: "user_id,favorite_user_id", ignoreDuplicates: true }
                    )
            );
            if (insError) {
                setFavorites(favorites);
                setFavoriteStatus(insError.message);
            }
        }

        await loadFavorites();
        setFavoriteBusy(null);
    }

    useEffect(() => {
        if (!query.trim()) {
            setRows([]);
            setError("");
            loadDefault();
            return;
        }

        const handle = window.setTimeout(() => {
            search();
        }, 250);

        return () => window.clearTimeout(handle);
    }, [query]);

    useEffect(() => {
        loadFavorites();
        const { data: sub } = supabase.auth.onAuthStateChange(() => loadFavorites());
        return () => {
            sub.subscription.unsubscribe();
        };
    }, []);

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

    const defaultResults = useMemo(() => {
        const seen = new Set<string>();
        const out: PublicProfileRow[] = [];
        defaultRows.forEach((r) => {
            if (!r.username) {
                return;
            }
            if (!r.is_public_collection && !r.is_public_wishlist) {
                return;
            }
            if (seen.has(r.username)) {
                return;
            }
            seen.add(r.username);
            out.push(r);
        });
        return out;
    }, [defaultRows]);

    const activeResults = isSearching ? results : defaultResults;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
            </div>

            <h1>Découvrir des profils</h1>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher un pseudo"
                    style={{ flex: 1 }}
                />
                <button onClick={search} disabled={loading || !query.trim()}>
                    Rechercher
                </button>
            </div>

            {loading || defaultLoading || favoritesLoading ? <div style={{ marginTop: 12 }}>Chargement…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}
            {favoriteStatus ? <div style={{ marginTop: 12 }} className="error">{favoriteStatus}</div> : null}

            {!loading && !error && query.trim() && results.length === 0 ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>Aucun profil public ne correspond à ce pseudo.</div>
            ) : null}

            {favorites.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Favoris</div>
                    <div style={{ display: "grid", gap: 10 }}>
                        {favoriteRows.map((r) => {
                            const isFavorite = favorites.includes(r.username);
                            const countLabel =
                                typeof r.collection_count === "number" ? `${r.collection_count} vinyles` : null;

                            return (
                                <div
                                    key={r.username}
                                    className="panel"
                                    style={{
                                        padding: 12,
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

                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                            {r.is_public_collection ? (
                                                <span className="pill pillCollection">Collection</span>
                                            ) : null}
                                            {r.is_public_wishlist ? (
                                                <span className="pill pillWishlist">Wishlist</span>
                                            ) : null}
                                            {countLabel ? <span className="muted small">{countLabel}</span> : null}
                                        </div>
                                        <button
                                            className={`btn ${isFavorite ? "btnPrimary" : "btnGhost"}`}
                                            onClick={() => toggleFavorite(r.username)}
                                            aria-label="Retirer des favoris"
                                        >
                                            {isFavorite ? "★ Favori" : "☆ Ajouter"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {!isSearching ? (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Profils populaires</div>
                    <div style={{ display: "grid", gap: 10 }}>
                        {activeResults.map((r) => {
                            const isFavorite = favorites.includes(r.username);
                            const countLabel =
                                typeof r.collection_count === "number" ? `${r.collection_count} vinyles` : null;

                            return (
                                <div
                                    key={r.username}
                                    className="panel"
                                    style={{
                                        padding: 12,
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

                                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                            {r.is_public_collection ? (
                                                <span className="pill pillCollection">Collection</span>
                                            ) : null}
                                            {r.is_public_wishlist ? (
                                                <span className="pill pillWishlist">Wishlist</span>
                                            ) : null}
                                            {countLabel ? <span className="muted small">{countLabel}</span> : null}
                                        </div>
                                        <button
                                            className={`btn ${isFavorite ? "btnPrimary" : "btnGhost"}`}
                                            onClick={() => toggleFavorite(r.username)}
                                            aria-label="Ajouter aux favoris"
                                        >
                                            {isFavorite ? "★ Favori" : "☆ Ajouter"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                    {activeResults.map((r) => {
                        const isFavorite = favorites.includes(r.username);
                        const countLabel =
                            typeof r.collection_count === "number" ? `${r.collection_count} vinyles` : null;

                        return (
                            <div
                                key={r.username}
                                className="panel"
                                style={{
                                    padding: 12,
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

                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                        {r.is_public_collection ? (
                                            <span className="pill pillCollection">Collection</span>
                                        ) : null}
                                        {r.is_public_wishlist ? (
                                            <span className="pill pillWishlist">Wishlist</span>
                                        ) : null}
                                        {countLabel ? <span className="muted small">{countLabel}</span> : null}
                                    </div>
                                    <button
                                        className={`btn ${isFavorite ? "btnPrimary" : "btnGhost"}`}
                                        onClick={() => toggleFavorite(r.username)}
                                        aria-label="Ajouter aux favoris"
                                    >
                                        {isFavorite ? "★ Favori" : "☆ Ajouter"}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
