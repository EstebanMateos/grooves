import { supabase } from "../supabaseClient";
import { formatUiError } from "./uiError";

export type EnsuredProfileUsername = {
    username: string;
    isAnon: boolean;
};

export function formatAuthError(error: unknown): string {
    return formatUiError(error);
}

function buildAnonUsername(suffix?: string): string {
    const safeSuffix = (suffix ?? "").replace(/[^a-z0-9_]/g, "");
    if (safeSuffix) {
        return `ano_${safeSuffix}`;
    }
    const timePart = Date.now().toString(36);
    const randPart = Math.random().toString(36).slice(2, 8);
    return `ano_${timePart}_${randPart}`;
}

async function generateAnonUsername(): Promise<string> {
    try {
        const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .ilike("username", "ano_%");
        if (typeof count === "number") {
            return buildAnonUsername(String(count + 1));
        }
    } catch {
        // Fall back to timestamp-based ID if count fails.
    }
    return buildAnonUsername();
}

export async function ensureProfileUsername(userId: string): Promise<EnsuredProfileUsername> {
    const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
        throw profileError;
    }

    if (profileRow?.username) {
        return { username: profileRow.username, isAnon: profileRow.username.startsWith("ano_") };
    }

    let candidate = await generateAnonUsername();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const { error: upsertError } = await supabase
            .from("profiles")
            .upsert(
                { id: userId, username: candidate, display_name: candidate },
                { onConflict: "id" }
            );

        if (!upsertError) {
            return { username: candidate, isAnon: true };
        }

        lastError = upsertError;
        const message = upsertError.message?.toLowerCase() ?? "";
        if (upsertError.code === "23505" || message.includes("duplicate")) {
            candidate = buildAnonUsername();
            continue;
        }

        throw upsertError;
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Impossible de créer un pseudo automatique.");
}
