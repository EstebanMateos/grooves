import { expect, test, type Page } from "@playwright/test";

const PROXY_SEARCH_PATTERN = "**://grooves-discogs-proxy.grooves.workers.dev/search?**";

type SearchCall = {
    q: string | null;
    type: string | null;
    page: string | null;
    perPage: string | null;
};

async function mockDiscogsSearch(page: Page, calls: SearchCall[]) {
    await page.route(PROXY_SEARCH_PATTERN, async (route) => {
        const url = new URL(route.request().url());
        calls.push({
            q: url.searchParams.get("q"),
            type: url.searchParams.get("type"),
            page: url.searchParams.get("page"),
            perPage: url.searchParams.get("per_page")
        });

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                pagination: {
                    page: Number(url.searchParams.get("page") ?? "1"),
                    pages: 1,
                    per_page: Number(url.searchParams.get("per_page") ?? "50"),
                    items: 1
                },
                results: [
                    {
                        id: 123,
                        type: "release",
                        title: "Daft Punk - Discovery",
                        year: 2001,
                        country: "France",
                        format: ["Vinyl"]
                    }
                ]
            })
        });
    });
}

test("home search waits for submit and calls the Discogs proxy once", async ({ page }) => {
    const calls: SearchCall[] = [];
    await mockDiscogsSearch(page, calls);

    await page.goto("/");

    const searchInput = page.getByPlaceholder("Daft Punk, Discovery, 10th anniversary").first();
    await searchInput.fill("da");
    await expect(page.getByRole("button", { name: "Rechercher" }).first()).toBeDisabled();
    await expect.poll(() => calls.length).toBe(0);

    await searchInput.fill("  daft   punk  ");
    await expect.poll(() => calls.length).toBe(0);

    await page.getByRole("button", { name: "Rechercher" }).first().click();

    await expect(page.getByText("Daft Punk - Discovery")).toBeVisible();
    expect(calls).toEqual([
        {
            q: "daft punk",
            type: "release",
            page: "1",
            perPage: "50"
        }
    ]);
});

test("search results page fetches once for a valid query", async ({ page }) => {
    const calls: SearchCall[] = [];
    await mockDiscogsSearch(page, calls);

    await page.goto("/#/search?q=daft%20punk&page=1");

    await expect(page.getByText("Daft Punk - Discovery")).toBeVisible();
    expect(calls).toEqual([
        {
            q: "daft punk",
            type: "release",
            page: "1",
            perPage: "50"
        }
    ]);
});

test("search results page rejects short queries before the proxy", async ({ page }) => {
    const calls: SearchCall[] = [];
    await mockDiscogsSearch(page, calls);

    await page.goto("/#/search?q=ab&page=1");

    await expect(page.getByText(/Entre au moins 3 caract.res\./)).toBeVisible();
    await expect.poll(() => calls.length).toBe(0);
});
