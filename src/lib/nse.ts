/**
 * NSE India real-time data client.
 *
 * NSE requires browser-like cookies obtained from the homepage before
 * any API call will succeed. This module manages that session cookie,
 * refreshes it every 6 minutes, and deduplicates concurrent requests.
 *
 * All functions throw on failure so callers can fall back to Yahoo Finance.
 */

const NSE_BASE = "https://www.nseindia.com";
const COOKIE_TTL_MS = 6 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.nseindia.com/",
};

let _cookies = "";
let _cookiesTs = 0;
let _cookieFetch: Promise<void> | null = null;

async function refreshCookies(): Promise<void> {
  try {
    const res = await fetch(`${NSE_BASE}/`, {
      headers: BASE_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // Node 18.14+ exposes getSetCookie() for multiple Set-Cookie headers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCookies: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (res.headers as any).getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];

    const joined = rawCookies
      .flatMap((c) => c.split(/,(?=[^ ])/))
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    if (joined) {
      _cookies = joined;
      _cookiesTs = Date.now();
    }
  } finally {
    _cookieFetch = null;
  }
}

async function ensureCookies(): Promise<void> {
  if (_cookies && Date.now() - _cookiesTs < COOKIE_TTL_MS) return;
  if (_cookieFetch) return _cookieFetch;
  _cookieFetch = refreshCookies();
  return _cookieFetch;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nseGet<T = any>(path: string): Promise<T> {
  await ensureCookies();
  const res = await fetch(`${NSE_BASE}${path}`, {
    headers: { ...BASE_HEADERS, Cookie: _cookies },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NSE ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NSEQuote {
  symbol: string;
  companyName: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  totalTradedVolume: number;
  weekHigh52: number;
  weekLow52: number;
  vwap: number;
}

export interface NSEIndex {
  name: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
}

// ── Equity Quote ──────────────────────────────────────────────────────────────

const _quoteCache = new Map<string, { data: NSEQuote; ts: number }>();
const QUOTE_TTL = 60_000;

export async function getNSEQuote(symbol: string): Promise<NSEQuote> {
  const cached = _quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_TTL) return cached.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await nseGet(`/api/quote-equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`);

  const info = raw?.info ?? {};
  const price = raw?.priceInfo ?? {};
  const intra = price?.intraDayHighLow ?? {};
  const week = price?.weekHighLow ?? {};
  const dp = raw?.securityWiseDP ?? {};

  const quote: NSEQuote = {
    symbol: info.symbol ?? symbol,
    companyName: info.companyName ?? symbol,
    lastPrice: price.lastPrice ?? 0,
    change: price.change ?? 0,
    pChange: price.pChange ?? 0,
    open: price.open ?? 0,
    dayHigh: intra.max ?? price.dayHigh ?? 0,
    dayLow: intra.min ?? price.dayLow ?? 0,
    previousClose: price.previousClose ?? price.close ?? 0,
    totalTradedVolume: dp.quantityTraded ?? 0,
    weekHigh52: week.max ?? 0,
    weekLow52: week.min ?? 0,
    vwap: price.vwap ?? 0,
  };

  _quoteCache.set(symbol, { data: quote, ts: Date.now() });
  return quote;
}

// ── Indices ───────────────────────────────────────────────────────────────────

let _indicesCache: { data: NSEIndex[]; ts: number } | null = null;
const INDICES_TTL = 60_000;

const WATCH_INDICES = new Set(["NIFTY 50"]);

export async function getNSEIndices(): Promise<NSEIndex[]> {
  if (_indicesCache && Date.now() - _indicesCache.ts < INDICES_TTL) {
    return _indicesCache.data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await nseGet("/api/allIndices");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = raw?.data ?? [];

  const indices: NSEIndex[] = all
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((i: any) => WATCH_INDICES.has(i.indexSymbol))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => ({
      name: i.indexSymbol as string,
      lastPrice: i.last ?? i.current ?? 0,
      change: i.variation ?? i.change ?? 0,
      pChange: i.percentChange ?? 0,
      open: i.open ?? 0,
      high: i.high ?? 0,
      low: i.low ?? 0,
      previousClose: i.previousClose ?? 0,
    }));

  if (indices.length > 0) {
    _indicesCache = { data: indices, ts: Date.now() };
  }

  return indices;
}
