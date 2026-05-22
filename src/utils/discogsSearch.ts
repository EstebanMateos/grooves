export const MIN_DISCOGS_SEARCH_LENGTH = 3;

export function normalizeDiscogsSearchQuery(query: string): string {
    return query.trim().replace(/\s+/g, " ");
}

export function isDiscogsSearchQueryValid(query: string): boolean {
    return normalizeDiscogsSearchQuery(query).length >= MIN_DISCOGS_SEARCH_LENGTH;
}
