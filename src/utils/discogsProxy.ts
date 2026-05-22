export function getDiscogsProxyBaseUrl(): string {
    const baseUrl = (import.meta.env.VITE_DISCOGS_PROXY_BASE_URL as string | undefined)?.trim();
    if (!baseUrl) {
        throw new Error("VITE_DISCOGS_PROXY_BASE_URL manquant");
    }
    return baseUrl.replace(/\/+$/, "");
}
