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
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            reject(new Error("Supabase: requête expirée (timeout)."));
        }, FETCH_TIMEOUT_MS);
    });

    try {
        return await Promise.race([fetch(input, init), timeoutPromise]);
    } finally {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
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
