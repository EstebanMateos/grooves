type RateLimitOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  signal?: AbortSignal;
};

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, jitterMs: number): number {
  const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = jitterMs > 0 ? Math.random() * jitterMs : 0;
  return expDelay + jitter;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const handle = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(handle);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort);
  });
}

export async function fetchWithRateLimit(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RateLimitOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const maxDelayMs = options.maxDelayMs ?? 16000;
  const jitterMs = options.jitterMs ?? 500;
  const signal = options.signal ?? init.signal ?? undefined;

  let attempt = 0;
  while (true) {
    const response = await fetch(input, {...init, signal});
    if (response.status !== 429) {
      return response;
    }

    if (attempt >= maxRetries) {
      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      if (retryAfterMs !== null) {
        const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        throw new Error(`Trop de requêtes. Réessaie dans ${seconds}s.`);
      }
      throw new Error("Trop de requêtes. Réessaie dans quelques instants.");
    }

    const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
    const waitMs = retryAfterMs ?? backoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs);
    await delayWithAbort(waitMs, signal);
    attempt += 1;
  }
}
