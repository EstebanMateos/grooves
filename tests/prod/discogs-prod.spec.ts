import { expect, test } from "@playwright/test";

const PROXY_SEARCH_URL = "https://grooves.letruel.com/api/discogs/search";

test("production search uses the live Discogs proxy without rate limiting", async ({ page }) => {
    const proxyResponses: Array<{ status: number; url: string; cacheStatus: string | null }> = [];

    page.on("response", (response) => {
        if (response.url().startsWith(PROXY_SEARCH_URL)) {
            proxyResponses.push({
                status: response.status(),
                url: response.url(),
                cacheStatus: response.headers()["cf-cache-status"] ?? null
            });
        }
    });

    await page.goto("https://grooves.letruel.com/#/search?q=daft%20punk&page=1");

    await expect(page.getByText(/Daft Punk/i).first()).toBeVisible();
    expect(proxyResponses.map((response) => response.status)).not.toContain(429);
    expect(proxyResponses).toHaveLength(1);
    expect(proxyResponses[0]?.status).toBe(200);
});
