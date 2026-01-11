import {createClient} from '@supabase/supabase-js';

import {isDebugEnabled, logSupabaseRequest} from './utils/supabaseDebug';

const supabase_url = import.meta.env.VITE_SUPABASE_URL as string;
const supabase_anon_key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const debugEnabled = isDebugEnabled();

const FETCH_TIMEOUT_MS = 8000;
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 1000;

if (!supabase_url || !supabase_anon_key) {
  if (debugEnabled) {
    console.error(
        'Supabase env manquant: vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeSignals(signal_a?: AbortSignal|null, signal_b?: AbortSignal|null):
    AbortSignal|undefined {
  if (!signal_a) {
    return signal_b ?? undefined;
  }
  if (!signal_b) {
    return signal_a;
  }

  const controller = new AbortController();

  const onAbort = () => {
    controller.abort();
  };

  if (signal_a.aborted || signal_b.aborted) {
    controller.abort();
    return controller.signal;
  }

  signal_a.addEventListener('abort', onAbort, {once: true});
  signal_b.addEventListener('abort', onAbort, {once: true});

  return controller.signal;
}

async function fetchWithTimeout(
    input: RequestInfo|URL, init?: RequestInit): Promise<Response> {
  const timeout_controller = new AbortController();
  const merged_signal = mergeSignals(init?.signal, timeout_controller.signal);

  const timeout_id = window.setTimeout(() => {
    timeout_controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      signal: merged_signal,
    });

    return response;
  } catch (error) {
    if (timeout_controller.signal.aborted) {
      throw new Error('Supabase: requête expirée (timeout).');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout_id);
  }
}

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
      message.includes('Failed to fetch') || message.includes('NetworkError') ||
      message.includes('Load failed') || message.includes('fetch'));
}

async function fetchWithRetry(
    input: RequestInfo|URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const can_retry = method === 'GET' || method === 'HEAD';
  const max_retries = can_retry ? FETCH_RETRIES : 0;
  let last_error: unknown;

  for (let attempt = 0; attempt <= max_retries; attempt += 1) {
    try {
      logSupabaseRequest(input, init);
      const response = await fetchWithTimeout(input, init);

      if (can_retry && response.status >= 500 && attempt < max_retries) {
        await delay(FETCH_RETRY_DELAY_MS);
        continue;
      }

      return response;
    } catch (error) {
      last_error = error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      if (init?.signal?.aborted) {
        throw error;
      }

      if (can_retry && attempt < max_retries && isNetworkError(error)) {
        await delay(FETCH_RETRY_DELAY_MS);
        continue;
      }

      if (attempt < max_retries) {
        await delay(FETCH_RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw last_error instanceof Error ? last_error :
                                      new Error(String(last_error));
}

export const supabase = createClient(supabase_url, supabase_anon_key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

if (debugEnabled) {
  try {
    const keys = Object.keys(window.localStorage);
    const sb_keys =
        keys.filter((k) => k.includes('sb-') || k.includes('supabase'));
    console.log('[storage] keys', sb_keys);
    for (const k of sb_keys) {
      const v = window.localStorage.getItem(k);
      console.log('[storage] item', k, v ? `len=${v.length}` : 'null');
    }
  } catch (e) {
    console.warn('[storage] cannot read localStorage', e);
  }
}

const original_sign_out = supabase.auth.signOut.bind(supabase.auth);
supabase.auth.signOut = async (...args) => {
  if (debugEnabled) {
    console.trace('[supabase] signOut called');
  }
  return await original_sign_out(...args);
};

const original_remove_item =
    window.localStorage.removeItem.bind(window.localStorage);
window.localStorage.removeItem = (key: string) => {
  if (key.includes('sb-') || key.includes('supabase')) {
    if (debugEnabled) {
      console.trace(`[localStorage] removeItem ${key}`);
    }
  }
  return original_remove_item(key);
};

const original_clear = window.localStorage.clear.bind(window.localStorage);
window.localStorage.clear = () => {
  if (debugEnabled) {
    console.trace('[localStorage] clear');
  }
  return original_clear();
};
