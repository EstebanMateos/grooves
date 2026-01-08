import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const FETCH_TIMEOUT_MS = 8000;
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 1000;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase env manquant: vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");
}

function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
        controller.abort();
    }, FETCH_TIMEOUT_MS);

    if (init?.signal) {
        if (init.signal.aborted) {
            controller.abort();
        } else {
            init.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }
    }

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error("Supabase: requête expirée (timeout).");
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const canRetry = method === "GET" || method === "HEAD";
    const maxRetries = canRetry ? FETCH_RETRIES : 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            const response = await fetchWithTimeout(input, init);
            if (canRetry && response.status >= 500 && attempt < maxRetries) {
                await delay(FETCH_RETRY_DELAY_MS);
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                await delay(FETCH_RETRY_DELAY_MS);
                continue;
            }
            throw error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: fetchWithRetry
    }
});
