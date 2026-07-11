import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

let cache: { data: IndexQuote[]; ts: number } | null = null;
const TTL = 60_000; // 60s

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

const INDICES = [
  { symbol: "^NSEI",    name: "Nifty 50" },
  { symbol: "^BSESN",  name: "Sensex" },
  { symbol: "^NSEBANK", name: "BankNifty" },
  { symbol: "^CNXIT",  name: "Nifty IT" },
];

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  const results = await Promise.allSettled(
    INDICES.map(async ({ symbol, name }) => {
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

  const data = results
    .filter((r): r is PromiseFulfilledResult<IndexQuote> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((q) => q.price > 0);

  if (data.length > 0) {
    cache = { data, ts: Date.now() };
  }

  return NextResponse.json(data);
}
