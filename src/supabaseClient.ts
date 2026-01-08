import {createClient} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const FETCH_TIMEOUT_MS = 8000;
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 1000;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
      'Supabase env manquant: vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mergeSignals(
    signalA?: AbortSignal|null,
    signalB?: AbortSignal|null): AbortSignal|undefined {
  if (!signalA) {
    return signalB ?? undefined;
  }
  if (!signalB) {
    return signalA;
  }

  const controller = new AbortController();

  const onAbort = () => {
    controller.abort();
  };

  if (signalA.aborted || signalB.aborted) {
    controller.abort();
    return controller.signal;
  }

  signalA.addEventListener('abort', onAbort, {once: true});
  signalB.addEventListener('abort', onAbort, {once: true});

  return controller.signal;
}

async function fetchWithTimeout(
    input: RequestInfo|URL, init?: RequestInit): Promise<Response> {
  const timeoutController = new AbortController();
  const mergedSignal = mergeSignals(init?.signal, timeoutController.signal);

  const timeoutId = window.setTimeout(() => {
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(input, {...init, signal: mergedSignal});

    return resp;
  } catch (e) {
    if (timeoutController.signal.aborted) {
      throw new Error('Supabase: requête expirée (timeout).');
    }
    throw e;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
      msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
      msg.includes('Load failed') || msg.includes('fetch'));
}

async function fetchWithRetry(
    input: RequestInfo|URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
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

      if (canRetry && attempt < maxRetries && isNetworkError(error)) {
        await delay(FETCH_RETRY_DELAY_MS);
        continue;
      }

      if (attempt < maxRetries) {
        await delay(FETCH_RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const supabase = createClient(
    supabaseUrl, supabaseAnonKey, {global: {fetch: fetchWithRetry}});
