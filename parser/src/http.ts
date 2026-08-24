export interface FetchOptions {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  userAgent: string;
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  html: string;
  attempts: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchPublicPage(url: URL, options: FetchOptions): Promise<FetchResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "user-agent": options.userAgent,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
        },
      });
      if (!response.ok) {
        if (!RETRYABLE.has(response.status) || attempt > options.retries) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : options.baseDelayMs * 2 ** (attempt - 1);
        await sleep(Math.min(delay, 10000));
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(`Unsupported response content-type: ${contentType || "unknown"}`);
      }
      return { url: url.toString(), status: response.status, contentType, html: await response.text(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt > options.retries) throw error;
      await sleep(Math.min(options.baseDelayMs * 2 ** (attempt - 1), 10000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
