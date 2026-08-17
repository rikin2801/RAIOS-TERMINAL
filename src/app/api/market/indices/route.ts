import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getNSEIndices } from "@/lib/nse";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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

let cache: { data: IndexQuote[]; ts: number } | null = null;
const TTL = 60_000;

async function getNifty50FromNSE(): Promise<IndexQuote | null> {
  try {
    const indices = await getNSEIndices(); // only NIFTY 50 after nse.ts change
    const nifty = indices.find((i) => i.name === "NIFTY 50");
    if (!nifty || nifty.lastPrice <= 0) return null;
    return {
      symbol: "^NSEI",
      name: "Nifty 50",
      price: nifty.lastPrice,
      change: nifty.change,
      changePercent: nifty.pChange,
      open: nifty.open,
      high: nifty.high,
      low: nifty.low,
    };
  } catch {
    return null;
  }
}

async function getFromYahoo(yahooSymbol: string, name: string): Promise<IndexQuote | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote(yahooSymbol, {}, { validateResult: false });
    if (!q?.regularMarketPrice) return null;
    return {
      symbol: yahooSymbol,
      name,
      price: q.regularMarketPrice,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      open: q.regularMarketOpen ?? 0,
      high: q.regularMarketDayHigh ?? 0,
      low: q.regularMarketDayLow ?? 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  // Fetch Nifty 50 (NSE real-time preferred, Yahoo fallback)
  // Fetch Sensex (BSE index — always from Yahoo since NSE API doesn't carry it)
  const [niftyNSE, niftyYahoo, sensex] = await Promise.all([
    getNifty50FromNSE(),
    getFromYahoo("^NSEI", "Nifty 50"),
    getFromYahoo("^BSESN", "Sensex"),
  ]);

  const nifty50 = niftyNSE ?? niftyYahoo;

  const data: IndexQuote[] = [nifty50, sensex].filter((x): x is IndexQuote => x !== null);

  if (data.length > 0) {
    cache = { data, ts: Date.now() };
  } else if (cache) {
    return NextResponse.json(cache.data);
  }

  return NextResponse.json(data);
}
