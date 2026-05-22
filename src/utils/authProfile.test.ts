import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureProfileUsername, formatAuthError } from "./authProfile";

const mocks = vi.hoisted(() => ({
    from: vi.fn()
}));

vi.mock("../supabaseClient", () => ({
    supabase: {
        from: mocks.from
    }
}));

function profileLookup(data: { username: string } | null, error: unknown = null) {
    return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data, error })
    };
}

function anonCount(count: number | null) {
    return {
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockResolvedValue({ count })
    };
}

function profileUpsert(error: unknown = null) {
    return {
        upsert: vi.fn().mockResolvedValue({ error })
    };
}

describe("auth profile helpers", () => {
    beforeEach(() => {
        mocks.from.mockReset();
    });

    it("returns an existing profile username", async () => {
        mocks.from.mockReturnValueOnce(profileLookup({ username: "alice" }));

        await expect(ensureProfileUsername("user-1")).resolves.toEqual({
            username: "alice",
            isAnon: false
        });
        expect(mocks.from).toHaveBeenCalledTimes(1);
    });

    it("creates an anonymous username when the profile has none", async () => {
        const upsert = profileUpsert();
        mocks.from
            .mockReturnValueOnce(profileLookup(null))
            .mockReturnValueOnce(anonCount(7))
            .mockReturnValueOnce(upsert);

        await expect(ensureProfileUsername("user-2")).resolves.toEqual({
            username: "ano_8",
            isAnon: true
        });
        expect(upsert.upsert).toHaveBeenCalledWith(
            { id: "user-2", username: "ano_8", display_name: "ano_8" },
            { onConflict: "id" }
        );
    });

    it("formats empty auth errors", () => {
        expect(formatAuthError("")).toBe("Une erreur est survenue. Réessaie.");
    });
});
