import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/prod",
    timeout: 30_000,
    expect: {
        timeout: 10_000
    },
    fullyParallel: false,
    reporter: "list",
    use: {
        baseURL: "https://estebanmateos.github.io/grooves/",
        serviceWorkers: "block",
        trace: "on-first-retry"
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ]
});
