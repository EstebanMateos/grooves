export const LIBRARY_CACHE_PREFIX = "grooves:library_cache_v2:";

export function clearLibraryCache(userId?: string | null) {
    try {
        if (userId) {
            window.localStorage.removeItem(`${LIBRARY_CACHE_PREFIX}${userId}`);
            return;
        }
        Object.keys(window.localStorage)
            .filter((key) => key.startsWith(LIBRARY_CACHE_PREFIX))
            .forEach((key) => window.localStorage.removeItem(key));
    } catch {
        return;
    }
}
