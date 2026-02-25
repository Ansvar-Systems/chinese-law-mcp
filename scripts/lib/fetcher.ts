/**
 * Rate-limited HTTP client for flk.npc.gov.cn (National Law Database).
 *
 * - 500ms minimum delay between requests
 * - User-Agent header identifying the MCP
 * - Downloads DOCX files via the FLK download API
 * - Retry with exponential backoff
 */

const USER_AGENT = 'ChineseLawMCP/1.0 (https://github.com/Ansvar-Systems/chinese-law-mcp; hello@ansvar.eu)';
const MIN_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 60_000;

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

export interface FetchBinaryResult {
  status: number;
  buffer: Buffer;
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
          'Accept': '*/*',
        },
        signal: controller.signal,
        redirect: 'follow',
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
 * Download a DOCX file from the FLK download API.
 * The API returns a 302 redirect to a signed S3 URL on Huawei Cloud OBS.
 */
export async function fetchFlkDocx(bbbs: string, maxRetries = 3): Promise<FetchBinaryResult> {
  const url = `https://flk.npc.gov.cn/law-search/download/mobile?format=docx&bbbs=${bbbs}`;

  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timer);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(`  HTTP ${response.status} for bbbs=${bbbs}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      if (response.status !== 200) {
        return {
          status: response.status,
          buffer: Buffer.alloc(0),
          contentType: response.headers.get('content-type') ?? '',
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        status: response.status,
        buffer: Buffer.from(arrayBuffer),
        contentType: response.headers.get('content-type') ?? '',
      };
    } catch (error) {
      clearTimeout(timer);

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  Error downloading bbbs=${bbbs}: ${msg}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to download bbbs=${bbbs} after ${maxRetries} retries`);
}

/**
 * Fetch an NPC law page (legacy — for npc.gov.cn HTML pages)
 */
export async function fetchNpcLaw(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}

/**
 * Fetch an NPC English translation page (legacy)
 */
export async function fetchNpcEnglish(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}

/**
 * Fetch a State Council regulation page (legacy)
 */
export async function fetchGovCn(url: string): Promise<FetchResult> {
  return fetchWithRateLimit(url);
}
