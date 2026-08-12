import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getNSEIndices } from "@/lib/nse";

const yf = new YahooFinance();

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
}

// Yahoo Finance fallback symbols for when NSE is unavailable
const YF_INDICES = [
  { symbol: "^NSEI",    name: "Nifty 50" },
  { symbol: "^BSESN",  name: "Sensex" },
  { symbol: "^NSEBANK", name: "Bank Nifty" },
  { symbol: "^CNXIT",  name: "Nifty IT" },
];

// NSE index symbol → display name mapping
const NSE_NAME_MAP: Record<string, string> = {
  "NIFTY 50":   "Nifty 50",
  "NIFTY BANK": "Bank Nifty",
  "NIFTY IT":   "Nifty IT",
};

let cache: { data: IndexQuote[]; ts: number } | null = null;
const TTL = 60_000;

async function fromNSE(): Promise<IndexQuote[]> {
  const indices = await getNSEIndices();
  return indices.map((i) => ({
    symbol: i.name,
    name: NSE_NAME_MAP[i.name] ?? i.name,
    price: i.lastPrice,
    change: i.change,
    changePercent: i.pChange,
    open: i.open,
    high: i.high,
    low: i.low,
  }));
}

async function fromYahoo(): Promise<IndexQuote[]> {
  const results = await Promise.allSettled(
    YF_INDICES.map(async ({ symbol, name }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = await yf.quote(symbol, {}, { validateResult: false });
      return {
        symbol,
        name,
        price: q?.regularMarketPrice ?? 0,
        change: q?.regularMarketChange ?? 0,
        changePercent: q?.regularMarketChangePercent ?? 0,
        open: q?.regularMarketOpen ?? 0,
        high: q?.regularMarketDayHigh ?? 0,
        low: q?.regularMarketDayLow ?? 0,
      } satisfies IndexQuote;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<IndexQuote> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((q) => q.price > 0);
}

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  // Try NSE first (real-time), fall back to Yahoo Finance (15-min delayed)
  let data: IndexQuote[] = [];
  try {
    data = await fromNSE();
  } catch {
    try {
      data = await fromYahoo();
    } catch {
      // both failed — return stale cache if available
      if (cache) return NextResponse.json(cache.data);
      return NextResponse.json([]);
    }
  }

  if (data.length > 0) {
    cache = { data, ts: Date.now() };
  }

  return NextResponse.json(data);
}
