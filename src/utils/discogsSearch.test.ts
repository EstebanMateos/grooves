import { describe, expect, it } from "vitest";
import {
    isDiscogsSearchQueryValid,
    MIN_DISCOGS_SEARCH_LENGTH,
    normalizeDiscogsSearchQuery
} from "./discogsSearch";

describe("Discogs search helpers", () => {
    it("normalizes surrounding and repeated spaces", () => {
        expect(normalizeDiscogsSearchQuery("  daft   punk  ")).toBe("daft punk");
    });

    it("validates the minimum query length", () => {
        expect(MIN_DISCOGS_SEARCH_LENGTH).toBe(3);
        expect(isDiscogsSearchQueryValid("ab")).toBe(false);
        expect(isDiscogsSearchQueryValid("abc")).toBe(true);
    });
});
