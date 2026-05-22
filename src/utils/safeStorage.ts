type SupportedStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getBrowserStorage(): SupportedStorage | undefined {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
}

export function createSafeBrowserStorage(storage: SupportedStorage | undefined): SupportedStorage {
    const fallback = new Map<string, string>();

    return {
        getItem(key: string): string | null {
            try {
                return storage?.getItem(key) ?? fallback.get(key) ?? null;
            } catch {
                return fallback.get(key) ?? null;
            }
        },
        setItem(key: string, value: string): void {
            fallback.set(key, value);
            try {
                storage?.setItem(key, value);
            } catch {
                return;
            }
        },
        removeItem(key: string): void {
            fallback.delete(key);
            try {
                storage?.removeItem(key);
            } catch {
                return;
            }
        }
    };
}
