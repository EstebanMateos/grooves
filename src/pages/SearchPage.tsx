import { useState } from "react";
import { Link } from "react-router-dom";
import { useUserLibraryIndex } from "../hooks/useUserLibraryIndex";

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

export default function SearchPage() {
    const library = useUserLibraryIndex();

    const [query, setQuery] = useState<string>("");
    const [results, setResults] = useState<DiscogsReleaseSearchItem[]>([]);
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);
    const [page, setPage] = useState<number>(1);
    const [pagesTotal, setPagesTotal] = useState<number>(1);
    const [itemsTotal, setItemsTotal] = useState<number>(0);

    async function fetchPage(nextPage: number, append: boolean) {
        setError("");
        setLoading(true);

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
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    async function search() {
        setResults([]);
        setPage(1);
        setPagesTotal(1);
        setItemsTotal(0);
        await fetchPage(1, false);
    }

    async function loadMore() {
        if (loading) {
            return;
        }
        const nextPage = page + 1;
        if (nextPage > pagesTotal) {
            return;
        }
        await fetchPage(nextPage, true);
    }

    const canLoadMore = !loading && query.length > 0 && page < pagesTotal;

    return (
        <div>
            <h1>Search vinyls</h1>

            <div style={{ display: "flex", gap: 8 }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Daft Punk 10th anniversary"
                    style={{ flex: 1 }}
                />
                <button onClick={search} disabled={!query || loading}>
                    Search
                </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 14, opacity: 0.8 }}>
                {itemsTotal > 0 ? (
                    <span>
                        Results: {itemsTotal} · Page {page}/{pagesTotal}
                    </span>
                ) : null}
            </div>

            {loading ? <div style={{ marginTop: 12 }}>Loading…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {results.map((r) => {
                    const inCollection = library.collection_ids.has(r.id);
                    const inWishlist = library.wishlist_ids.has(r.id);

                    return (
                        <div
                            key={r.id}
                            style={{
                                display: "flex",
                                gap: 12,
                                padding: 12,
                                border: "1px solid #ddd",
                                borderRadius: 6
                            }}
                        >
                            <div style={{ width: 80, height: 80, background: "#f2f2f2", flexShrink: 0 }}>
                                {r.thumb ? (
                                    <img
                                        src={r.thumb}
                                        alt={r.title}
                                        style={{ width: 80, height: 80, objectFit: "cover" }}
                                    />
                                ) : null}
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                                    {inCollection ? (
                                        <span
                                            style={{
                                                fontSize: 12,
                                                padding: "2px 6px",
                                                background: "#d1fae5",
                                                borderRadius: 4
                                            }}
                                        >
                                            In collection
                                        </span>
                                    ) : null}
                                    {!inCollection && inWishlist ? (
                                        <span
                                            style={{
                                                fontSize: 12,
                                                padding: "2px 6px",
                                                background: "#e0e7ff",
                                                borderRadius: 4
                                            }}
                                        >
                                            In wishlist
                                        </span>
                                    ) : null}
                                </div>

                                <div style={{ fontWeight: 700 }}>
                                    <Link to={`/release/${r.id}`} style={{ textDecoration: "none" }}>
                                        {r.title}
                                    </Link>
                                </div>

                                <div style={{ fontSize: 14, opacity: 0.7 }}>
                                    {r.year ?? "?"} · {r.country ?? "?"}
                                </div>
                                <div style={{ fontSize: 13, opacity: 0.7 }}>
                                    {(r.format ?? []).join(", ")}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button onClick={loadMore} disabled={!canLoadMore}>
                    Load more
                </button>
            </div>
        </div>
    );
}
