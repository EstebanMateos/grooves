import { afterEach, describe, expect, it, vi } from "vitest";

let authCallback: ((event: string, session: unknown) => void) | null = null;
const getSession = vi.fn();
const unsubscribe = vi.fn();

vi.mock("../supabaseClient", () => ({
    supabase: {
        auth: {
            getSession,
            onAuthStateChange: (callback: typeof authCallback) => {
                authCallback = callback;
                return { data: { subscription: { unsubscribe } } };
            }
        }
    }
}));

describe("useAuthSession store", () => {
    afterEach(async () => {
        const mod = await import("./useAuthSession");
        mod.stopAuthSessionStoreForTestsOnly();
        vi.resetModules();
        getSession.mockReset();
        authCallback = null;
    });

    it("ignores a stale getSession result after a newer SIGNED_OUT event", async () => {
        let resolveSession!: (value: unknown) => void;
        getSession.mockReturnValue(
            new Promise((resolve) => {
                resolveSession = resolve;
            })
        );

        const mod = await import("./useAuthSession");
        authCallback?.("SIGNED_OUT", null);
        resolveSession({
            data: {
                session: {
                    user: { id: "old-user", email: "old@example.com" }
                }
            },
            error: null
        });
        await Promise.resolve();

        expect(mod.getAuthSessionSnapshotForTestsOnly()).toMatchObject({
            is_authenticated: false,
            user_id: null,
            last_event: "SIGNED_OUT"
        });
    });
});
