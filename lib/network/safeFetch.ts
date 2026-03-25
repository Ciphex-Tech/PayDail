"use client";

export class NetworkOfflineError extends Error {
  constructor(message = "No internet connection") {
    super(message);
    this.name = "NetworkOfflineError";
  }
}

export class RequestTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export class ServerError extends Error {
  status: number;
  constructor(status: number, message = "Something went wrong. Try again") {
    super(message);
    this.name = "ServerError";
    this.status = status;
  }
}

type ApiJson = { ok?: boolean; error?: string };

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  retry?: {
    retries: number;
    delayMs?: number;
  };
  sensitive?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isProbablyOfflineError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

export async function fetchWithTimeout(input: RequestInfo | URL, options: FetchWithTimeoutOptions = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new NetworkOfflineError();
  }

  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 9_000;
  const sensitive = Boolean(options.sensitive);

  const retry = options.retry;
  const shouldRetry = !sensitive && retry && retry.retries > 0;

  const { timeoutMs: _timeoutMs, retry: _retry, sensitive: _sensitive, ...fetchOptions } = options;

  let attempt = 0;
  const maxAttempts = shouldRetry ? 1 + retry!.retries : 1;

  while (attempt < maxAttempts) {
    attempt += 1;

    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(input, {
        ...fetchOptions,
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        let serverMessage = "";
        try {
          if (contentType.includes("application/json")) {
            const json = (await res.json()) as ApiJson;
            serverMessage = String(json?.error || "");
          } else {
            const raw = await res.text();
            serverMessage = raw;
          }
        } catch {
          // ignore
        }

        throw new ServerError(res.status, serverMessage || "Something went wrong. Try again");
      }

      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt >= maxAttempts) throw new RequestTimeoutError();
      } else if (isProbablyOfflineError(err)) {
        if (attempt >= maxAttempts) throw new NetworkOfflineError();
      } else if (err instanceof ServerError) {
        throw err;
      } else {
        if (attempt >= maxAttempts) {
          throw new Error("Something went wrong. Try again");
        }
      }

      if (!shouldRetry || attempt >= maxAttempts) throw err as any;

      const delayMs = typeof retry!.delayMs === "number" ? retry!.delayMs : 400;
      await sleep(delayMs);
    } finally {
      window.clearTimeout(t);
    }
  }

  throw new Error("Something went wrong. Try again");
}

export function errorMessageForToast(err: unknown) {
  if (err instanceof NetworkOfflineError) return "No internet connection";
  if (err instanceof RequestTimeoutError) return "Request timed out";
  if (err instanceof ServerError) {
    if (err.status === 429) return "Too many requests. Please wait and try again.";
    return err.message || "Something went wrong. Try again";
  }

  if (err instanceof Error) {
    const msg = (err.message || "").trim();
    if (msg) return msg;
  }

  return "Something went wrong. Try again";
}
