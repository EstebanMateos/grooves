export function formatUiError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const message = raw.replace(/^Error:\s*/i, "").trim();
    const normalized = message.toLowerCase();

    if (!message) {
        return "Une erreur est survenue. Réessaie.";
    }
    if (normalized.includes("too many requests") || normalized.includes("trop de requêtes") || normalized.includes("http 429")) {
        return message.includes("Réessaie") ? message : "Discogs reçoit trop de requêtes. Réessaie dans quelques instants.";
    }
    if (normalized.includes("http 401") || normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
        return "Email ou mot de passe incorrect.";
    }
    if (normalized.includes("http 403")) {
        return "Accès refusé. Reconnecte-toi puis réessaie.";
    }
    if (normalized.includes("http 404")) {
        return "Cette ressource est introuvable.";
    }
    if (normalized.includes("http 5") || normalized.includes("failed to fetch") || normalized.includes("network")) {
        return "Service temporairement indisponible. Vérifie ta connexion et réessaie.";
    }
    if (normalized.includes("timeout") || normalized.includes("expir")) {
        return "Délai dépassé. Vérifie ta connexion et réessaie.";
    }

    return message;
}
