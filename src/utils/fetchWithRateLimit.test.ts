import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRateLimit } from "./fetchWithRateLimit";

describe("fetchWithRateLimit", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not retry an aborted request", async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchMock = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            fetchWithRateLimit("/discogs", { signal: controller.signal })
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry a rate-limited request by default", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(null, { status: 429, headers: { "Retry-After": "60" } })
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchWithRateLimit("/discogs")).rejects.toThrow("Réessaie dans 60s");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
