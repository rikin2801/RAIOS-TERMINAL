import { NextRequest, NextResponse } from "next/server";
import { getHistoricalData, getMultipleQuotes } from "@/lib/market";
import { calculateAllIndicators } from "@/lib/technical";
import { POPULAR_INDIAN_STOCKS } from "@/lib/india";
import type { TechnicalIndicators } from "@/types";

const QUOTE_UNIVERSE = [
  // Large Cap — Nifty 50 core
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN",
  "BHARTIARTL", "BAJFINANCE", "KOTAKBANK", "LT", "AXISBANK", "ASIANPAINT",
  "MARUTI", "SUNPHARMA", "WIPRO", "ULTRACEMCO", "ONGC", "ITC", "HCLTECH",
  "TECHM", "DRREDDY", "BAJAJFINSV", "NESTLEIND", "TITAN", "NTPC", "POWERGRID",
  "EICHERMOT", "HEROMOTOCO", "HDFCLIFE", "SBILIFE", "DIVISLAB", "COALINDIA",
  "BRITANNIA", "TATACONSUM", "TATASTEEL", "JSWSTEEL", "HINDALCO", "ADANIPORTS",
  // Mid Cap — high coverage
  "ASHOKLEY", "ABCAPITAL", "MUTHOOTFIN", "CHOLAFIN", "SHRIRAMFIN",
  "LTIM", "PERSISTENT", "COFORGE", "ZOMATO", "CIPLA", "LUPIN", "APOLLOHOSP",
  "SIEMENS", "HAVELLS", "DLF", "VOLTAS", "FRACTAL", "BANKBARODA",
  "ADANIENT", "MARICO", "COLPAL", "PIIND", "DIVI",
  // Emerging / thematic
  "POLYCAB", "LAURUSLABS", "GLENMARK", "TORNTPHARM", "MPHASIS",
  "LTTS", "KPITTECH", "TRENT", "NAUKRI", "DMART",
  "BAJAJ-AUTO", "M&M", "GRASIM", "JSWENERGY", "TATAPOWER",
  "IRCTC", "LICI", "NHPC", "SAIL", "VEDL",
  "TATACOMM", "INDHOTEL", "JUBLFOOD", "BERGEPAINT", "PIDILITIND",
];

// All stocks get technical indicators (previously only first 30)
const TECH_UNIVERSE = QUOTE_UNIVERSE;

interface ScanStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  pe: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volumeRatio: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  sma50?: number;
  sma200?: number;
  trend?: string;
  support?: number;
  resistance?: number;
}

let quoteCache: { data: ScanStock[]; ts: number } | null = null;
let techCache: { data: Map<string, TechnicalIndicators>; ts: number } | null = null;
const QUOTE_TTL = 3 * 60 * 1000;
const TECH_TTL = 25 * 60 * 1000;

const SECTOR_MAP = new Map(POPULAR_INDIAN_STOCKS.map((s) => [s.symbol, s.sector]));
const NAME_MAP = new Map(POPULAR_INDIAN_STOCKS.map((s) => [s.symbol, s.name]));

async function refreshQuoteCache() {
  const quotes = await getMultipleQuotes(QUOTE_UNIVERSE);
  quoteCache = {
    data: quotes.map((q) => ({
      symbol: q.symbol,
      name: NAME_MAP.get(q.symbol) ?? q.name,
      sector: SECTOR_MAP.get(q.symbol) ?? "Other",
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      volume: q.volume,
      avgVolume: q.avgVolume ?? 0,
      marketCap: q.marketCap ?? 0,
      pe: q.pe ?? null,
      dividendYield: q.dividendYield ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      volumeRatio: q.avgVolume && q.avgVolume > 0 ? +(q.volume / q.avgVolume).toFixed(2) : null,
      pctFrom52wHigh: q.fiftyTwoWeekHigh > 0 ? +((q.price / q.fiftyTwoWeekHigh - 1) * 100).toFixed(1) : null,
      pctFrom52wLow: q.fiftyTwoWeekLow > 0 ? +((q.price / q.fiftyTwoWeekLow - 1) * 100).toFixed(1) : null,
    })),
    ts: Date.now(),
  };
}

async function refreshTechCache() {
  const results = await Promise.allSettled(
    TECH_UNIVERSE.map((s) => getHistoricalData(s, "1y", "NSE"))
  );
  const map = new Map<string, TechnicalIndicators>();
  TECH_UNIVERSE.forEach((sym, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.length > 50) {
      try {
        map.set(sym, calculateAllIndicators(r.value));
      } catch {
        // skip if calculation fails
      }
    }
  });
  techCache = { data: map, ts: Date.now() };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "gainers";
  const limit = parseInt(searchParams.get("limit") ?? "25");
  const sector = searchParams.get("sector") ?? "";

  const now = Date.now();
  const needsTech = [
    "rsi-oversold", "rsi-overbought", "golden-cross", "death-cross",
    "momentum", "macd-bullish", "stochastic-reversal",
  ].includes(type);

  await Promise.all([
    !quoteCache || (now - quoteCache.ts) > QUOTE_TTL ? refreshQuoteCache() : Promise.resolve(),
    needsTech && (!techCache || (now - techCache.ts) > TECH_TTL) ? refreshTechCache() : Promise.resolve(),
  ]);

  let results: ScanStock[] = [...(quoteCache?.data ?? [])];

  if (sector) results = results.filter((q) => q.sector === sector);

  // Enrich with tech data
  const techData = techCache?.data;
  if (techData) {
    results = results.map((q) => {
      const t = techData.get(q.symbol);
      if (!t) return q;
      return { ...q, rsi: t.rsi, macd: t.macd, macdSignal: t.macdSignal, macdHistogram: t.macdHistogram, sma50: t.sma50, sma200: t.sma200, trend: t.trend, support: t.support, resistance: t.resistance };
    });
  }

  switch (type) {
    case "gainers":
      results = results.filter((q) => q.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
      break;
    case "losers":
      results = results.filter((q) => q.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
      break;
    case "volume-breakout":
      results = results
        .filter((q) => q.volumeRatio !== null && q.volumeRatio >= 1.5)
        .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0));
      break;
    case "52w-high":
      results = results
        .filter((q) => q.pctFrom52wHigh !== null && q.pctFrom52wHigh >= -5)
        .sort((a, b) => (b.pctFrom52wHigh ?? -100) - (a.pctFrom52wHigh ?? -100));
      break;
    case "52w-low":
      results = results
        .filter((q) => q.pctFrom52wLow !== null && q.pctFrom52wLow <= 12)
        .sort((a, b) => (a.pctFrom52wLow ?? 100) - (b.pctFrom52wLow ?? 100));
      break;
    case "rsi-oversold":
      results = results
        .filter((q) => q.rsi !== undefined && q.rsi < 40)
        .sort((a, b) => (a.rsi ?? 50) - (b.rsi ?? 50));
      break;
    case "rsi-overbought":
      results = results
        .filter((q) => q.rsi !== undefined && q.rsi > 62)
        .sort((a, b) => (b.rsi ?? 50) - (a.rsi ?? 50));
      break;
    case "golden-cross":
      results = results
        .filter((q) => q.sma50 !== undefined && q.sma200 !== undefined && q.sma50 > q.sma200)
        .sort((a, b) => b.changePercent - a.changePercent);
      break;
    case "death-cross":
      results = results
        .filter((q) => q.sma50 !== undefined && q.sma200 !== undefined && q.sma50 < q.sma200)
        .sort((a, b) => a.changePercent - b.changePercent);
      break;
    case "momentum":
      results = results
        .filter((q) => q.rsi !== undefined && q.rsi > 50 && q.rsi < 72 && q.macdHistogram !== undefined && q.macdHistogram > 0 && q.trend === "UPTREND")
        .sort((a, b) => b.changePercent - a.changePercent);
      break;
    case "macd-bullish":
      results = results
        .filter((q) => q.macdHistogram !== undefined && q.macdHistogram > 0)
        .sort((a, b) => (b.macdHistogram ?? 0) - (a.macdHistogram ?? 0));
      break;
    case "stochastic-reversal":
      results = results
        .filter((q) => q.rsi !== undefined && q.rsi < 45 && q.macdHistogram !== undefined && q.macdHistogram > 0)
        .sort((a, b) => b.changePercent - a.changePercent);
      break;
    default:
      results = results.sort((a, b) => b.changePercent - a.changePercent);
  }

  return NextResponse.json({
    type,
    results: results.slice(0, limit),
    total: results.length,
    cacheAge: {
      quotes: quoteCache ? Math.round((now - quoteCache.ts) / 1000) : null,
      tech: techCache ? Math.round((now - techCache.ts) / 1000) : null,
    },
  });
}
