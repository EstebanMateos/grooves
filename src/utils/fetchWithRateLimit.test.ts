import { describe, expect, it, vi } from "vitest";
import { fetchWithRateLimit } from "./fetchWithRateLimit";

describe("fetchWithRateLimit", () => {
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
});
