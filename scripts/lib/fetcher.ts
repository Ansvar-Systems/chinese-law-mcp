/**
 * Rate-limited HTTP client for Chinese government law portals.
 *
 * - 1000ms minimum delay between requests (Chinese government sites are slower)
 * - User-Agent header identifying the MCP
 * - Handles HTML responses from npc.gov.cn and gov.cn
 * - Retry with exponential backoff for resilience against GFW/connectivity issues
 * - Connection timeout handling
 */

const USER_AGENT = 'ChineseLawMCP/1.0 (https://github.com/Ansvar-Systems/chinese-law-mcp; hello@ansvar.eu)';
const MIN_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
}

/**
 * Fetch a URL with rate limiting, timeout, and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
      };
    } catch (error) {
      clearTimeout(timer);

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  Error fetching ${url}: ${msg}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Fetch an NPC law page (Chinese text)
 */
export async function fetchNpcLaw(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}

/**
 * Fetch an NPC English translation page
 */
export async function fetchNpcEnglish(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}

/**
 * Fetch a State Council regulation page
 */
export async function fetchGovCn(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}
