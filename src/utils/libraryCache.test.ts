import { beforeEach, describe, expect, it } from "vitest";
import { clearLibraryCache, LIBRARY_CACHE_PREFIX } from "./libraryCache";

describe("library cache", () => {
    beforeEach(() => window.localStorage.clear());

    it("clears only the selected user cache on logout", () => {
        window.localStorage.setItem(`${LIBRARY_CACHE_PREFIX}a`, "a");
        window.localStorage.setItem(`${LIBRARY_CACHE_PREFIX}b`, "b");
        clearLibraryCache("a");
        expect(window.localStorage.getItem(`${LIBRARY_CACHE_PREFIX}a`)).toBeNull();
        expect(window.localStorage.getItem(`${LIBRARY_CACHE_PREFIX}b`)).toBe("b");
    });
});
