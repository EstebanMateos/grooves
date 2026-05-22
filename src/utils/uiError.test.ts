import { describe, expect, it } from "vitest";
import { formatUiError } from "./uiError";

describe("formatUiError", () => {
    it("removes technical Error prefixes", () => {
        expect(formatUiError(new Error("Error: Something failed"))).toBe("Something failed");
    });

    it("formats common HTTP errors for users", () => {
        expect(formatUiError(new Error("HTTP 429"))).toBe(
            "Discogs reçoit trop de requêtes. Réessaie dans quelques instants."
        );
        expect(formatUiError(new Error("HTTP 500"))).toBe(
            "Service temporairement indisponible. Vérifie ta connexion et réessaie."
        );
    });

    it("keeps useful retry-after messages", () => {
        expect(formatUiError(new Error("Trop de requêtes. Réessaie dans 60s."))).toBe(
            "Trop de requêtes. Réessaie dans 60s."
        );
    });
});
