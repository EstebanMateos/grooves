import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchWithRateLimit } from "../utils/fetchWithRateLimit";
import {
    isDiscogsSearchQueryValid,
    MIN_DISCOGS_SEARCH_LENGTH,
    normalizeDiscogsSearchQuery
} from "../utils/discogsSearch";
import { getDiscogsProxyBaseUrl } from "../utils/discogsProxy";

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

const SEARCH_RESPONSE_CACHE_MS = 2_000;
const searchResponseCache = new Map<string, { expiresAt: number; promise: Promise<DiscogsSearchResponse> }>();

function parsePage(value: string | null): number {
    const n = Number(value ?? "1");
    if (!Number.isFinite(n) || n < 1) {
        return 1;
    }
    return Math.floor(n);
}

function loadDiscogsSearch(url: string): Promise<DiscogsSearchResponse> {
    const now = Date.now();
    for (const [cacheKey, entry] of searchResponseCache) {
        if (entry.expiresAt <= now) {
            searchResponseCache.delete(cacheKey);
        }
    }

    const cached = searchResponseCache.get(url);
    if (cached && cached.expiresAt > now) {
        return cached.promise;
    }

    const promise = fetchWithRateLimit(url).then(async (resp) => {
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        return (await resp.json()) as DiscogsSearchResponse;
    });

    searchResponseCache.set(url, {
        expiresAt: now + SEARCH_RESPONSE_CACHE_MS,
        promise
    });

    promise.catch(() => {
        if (searchResponseCache.get(url)?.promise === promise) {
            searchResponseCache.delete(url);
        }
    });

    return promise;
}

export default function SearchResultsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryParam = searchParams.get("q") ?? "";
    const pageParam = parsePage(searchParams.get("page"));

    const [query, setQuery] = useState<string>(queryParam);
    const [page, setPage] = useState<number>(pageParam);
    const [pagesTotal, setPagesTotal] = useState<number>(1);
    const [itemsTotal, setItemsTotal] = useState<number>(0);
    const [results, setResults] = useState<DiscogsReleaseSearchItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [pageInput, setPageInput] = useState<string>(String(pageParam));
    const fetchSeqRef = useRef<number>(0);

    async function fetchPage(q: string, nextPage: number) {
        const normalizedQuery = normalizeDiscogsSearchQuery(q);
        const requestId = fetchSeqRef.current + 1;
        fetchSeqRef.current = requestId;
        const isStale = () => fetchSeqRef.current !== requestId;
        setError("");
        setLoading(true);

        try {
            const baseUrl = getDiscogsProxyBaseUrl();
            const url = `${baseUrl}/search?q=${encodeURIComponent(normalizedQuery)}&type=release&page=${nextPage}&per_page=50`;

            const json = await loadDiscogsSearch(url);
            const vinylReleases = (json.results ?? []).filter(
                (r) => r.type === "release" && Array.isArray(r.format) && r.format.includes("Vinyl")
            );

            const pagination = json.pagination;
            if (pagination) {
                if (isStale()) {
                    return;
                }
                setPage(pagination.page);
                setPagesTotal(pagination.pages);
                setItemsTotal(pagination.items);
            }

            if (isStale()) {
                return;
            }
            setResults(vinylReleases);
        } catch (e) {
            if (isStale()) {
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
        setQuery(queryParam);
        setPage(pageParam);
        setPageInput(String(pageParam));

        if (!queryParam || !isDiscogsSearchQueryValid(queryParam)) {
            fetchSeqRef.current += 1;
            setResults([]);
            setItemsTotal(0);
            setPagesTotal(1);
            setError(queryParam ? `Entre au moins ${MIN_DISCOGS_SEARCH_LENGTH} caractères.` : "");
            setLoading(false);
            return;
        }

        fetchPage(queryParam, pageParam);
    }, [queryParam, pageParam]);

    function updateSearchParams(nextQuery: string, nextPage: number) {
        const next = normalizeDiscogsSearchQuery(nextQuery);
        if (!next) {
            setSearchParams({});
            return;
        }
        if (!isDiscogsSearchQueryValid(next)) {
            setQuery(next);
            setError(`Entre au moins ${MIN_DISCOGS_SEARCH_LENGTH} caractères.`);
            return;
        }
        setSearchParams({ q: next, page: String(nextPage) });
    }

    function submitSearch() {
        updateSearchParams(query, 1);
    }

    function goToPage(nextPage: number) {
        const safePage = Math.max(1, Math.min(nextPage, pagesTotal || 1));
        updateSearchParams(queryParam || query, safePage);
    }

    const canGoPrev = !loading && page > 1;
    const canGoNext = !loading && page < pagesTotal;
    const canJump = !loading && pageInput.trim().length > 0;
    const canSearch = isDiscogsSearchQueryValid(query);
    const pageStats = useMemo(() => {
        if (!queryParam) {
            return "Entre une recherche pour commencer.";
        }
        return itemsTotal > 0 ? `Résultats: ${itemsTotal} · Page ${page}/${pagesTotal}` : "Aucun résultat.";
    }, [itemsTotal, page, pagesTotal, queryParam]);

    return (
        <div className="page">
            <div className="panel">
                <div className="panelTitle">Recherche avancée</div>
                <div className="searchRow">
                    <input
                        className="input"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canSearch && !loading) {
                                submitSearch();
                            }
                        }}
                        placeholder="Daft Punk, Discovery, 10th anniversary"
                    />
                    <button className="btn btnPrimary" onClick={submitSearch} disabled={!canSearch || loading}>
                        Rechercher
                    </button>
                </div>

                <div className="muted small" style={{ marginTop: 10 }}>
                    {pageStats}
                </div>

                {loading ? <div className="muted" style={{ marginTop: 12 }}>Chargement…</div> : null}
                {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
            </div>

            {results.length > 0 ? (
                <>
                    <div className="grid" style={{ marginTop: 16 }}>
                        {results.map((r) => (
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
                                        <div className="muted small">
                                            {(r.format ?? []).join(", ")}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    <div
                        style={{
                            marginTop: 16,
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            flexWrap: "wrap"
                        }}
                    >
                        <button className="btn btnGhost" onClick={() => goToPage(page - 1)} disabled={!canGoPrev}>
                            Page précédente
                        </button>
                        <div className="muted small">Page {page} / {pagesTotal}</div>
                        <button className="btn btnGhost" onClick={() => goToPage(page + 1)} disabled={!canGoNext}>
                            Page suivante
                        </button>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                                className="input"
                                style={{ width: 90 }}
                                type="number"
                                min={1}
                                max={pagesTotal}
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                            />
                            <button
                                className="btn btnPrimary"
                                onClick={() => goToPage(parsePage(pageInput))}
                                disabled={!canJump}
                            >
                                Aller
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
