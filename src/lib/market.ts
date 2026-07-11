import YahooFinance from "yahoo-finance2";
import type { MarketQuote } from "@/types";
import { toYahooSymbol, fromYahooSymbol, type Exchange } from "./india";

const yf = new YahooFinance();

// 60-second in-process cache — prevents Yahoo Finance rate-limiting when
// multiple AI routes (brief, decision, portfolio-manager) call getQuote
// for the same holdings within the same page load.
const _quoteCache = new Map<string, { data: MarketQuote; ts: number }>();
const QUOTE_TTL_MS = 60_000;

// Deduplicate in-flight requests for the same symbol so concurrent callers
// share a single Yahoo Finance fetch rather than each making their own.
const _inFlight = new Map<string, Promise<MarketQuote>>();

export async function getQuote(symbol: string, exchange: Exchange = "NSE"): Promise<MarketQuote> {
  const key = `${symbol}:${exchange}`;

  const cached = _quoteCache.get(key);
  if (cached && Date.now() - cached.ts < QUOTE_TTL_MS) return cached.data;

  const existing = _inFlight.get(key);
  if (existing) return existing;

  const req = (async () => {
    const yahooSymbol = toYahooSymbol(symbol, exchange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yf.quote(yahooSymbol, {}, { validateResult: false });
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`No market data found for ${yahooSymbol}`);
    }
    const { symbol: cleanSymbol } = fromYahooSymbol(quote.symbol ?? yahooSymbol);
    const result: MarketQuote = {
      symbol: cleanSymbol,
      name: quote.longName ?? quote.shortName ?? symbol,
      price: quote.regularMarketPrice ?? 0,
      open: quote.regularMarketOpen ?? 0,
      high: quote.regularMarketDayHigh ?? 0,
      low: quote.regularMarketDayLow ?? 0,
      previousClose: quote.regularMarketPreviousClose ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? 0,
      avgVolume: quote.averageDailyVolume3Month,
      pe: quote.trailingPE,
      eps: quote.epsTrailingTwelveMonths,
      dividend: quote.trailingAnnualDividendRate,
      dividendYield: quote.trailingAnnualDividendYield,
      beta: quote.beta,
      shortName: quote.shortName,
    };
    _quoteCache.set(key, { data: result, ts: Date.now() });
    _inFlight.delete(key);
    return result;
  })();

  _inFlight.set(key, req);
  return req;
}

export type AnalysisTimeframe = "DAILY" | "WEEKLY" | "MONTHLY";

function timeframeToInterval(tf: AnalysisTimeframe): "1d" | "1wk" | "1mo" {
  return tf === "WEEKLY" ? "1wk" : tf === "MONTHLY" ? "1mo" : "1d";
}

function timeframeToPeriod(tf: AnalysisTimeframe): "1y" | "2y" | "5y" {
  return tf === "MONTHLY" ? "5y" : tf === "WEEKLY" ? "2y" : "1y";
}

export async function getHistoricalData(
  symbol: string,
  period: "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" = "1y",
  exchange: Exchange = "NSE",
  timeframe: AnalysisTimeframe = "DAILY"
) {
  const yahooSymbol = toYahooSymbol(symbol, exchange);
  const effectivePeriod = period === "1y" ? timeframeToPeriod(timeframe) : period;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yf.chart(yahooSymbol, {
    period1: getStartDate(effectivePeriod),
    period2: new Date(),
    interval: timeframeToInterval(timeframe),
  }, { validateResult: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((result?.quotes ?? []) as any[]).map((q: any) => ({
    time: Math.floor(new Date(q.date).getTime() / 1000),
    open: q.open ?? 0,
    high: q.high ?? 0,
    low: q.low ?? 0,
    close: q.close ?? 0,
    volume: q.volume ?? 0,
  }));
}

function getStartDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "1mo": return new Date(new Date().setMonth(now.getMonth() - 1));
    case "3mo": return new Date(new Date().setMonth(now.getMonth() - 3));
    case "6mo": return new Date(new Date().setMonth(now.getMonth() - 6));
    case "1y": return new Date(new Date().setFullYear(now.getFullYear() - 1));
    case "2y": return new Date(new Date().setFullYear(now.getFullYear() - 2));
    case "5y": return new Date(new Date().setFullYear(now.getFullYear() - 5));
    default: return new Date(new Date().setFullYear(now.getFullYear() - 1));
  }
}

export type ChartPeriod = "1D" | "5D" | "1W" | "1M" | "3M" | "1Y" | "5Y";
export type ChartInterval = "1m" | "30m" | "1h" | "1d";

// For intraday intervals with short periods, extend lookback so RSI/MACD/Stoch have
// enough bars to compute (RSI needs 15+, MACD needs 35+, Stoch needs 16+).
function periodToStartDate(period: ChartPeriod, interval: ChartInterval = "1d"): Date {
  const now = new Date();
  const d = new Date(now);

  if (period === "1D") {
    if (interval === "1m")  return new Date(now.getTime() - 5  * 24 * 3600_000); // 5D × 13 bars/day = 65 bars
    if (interval === "30m") return new Date(now.getTime() - 7  * 24 * 3600_000); // 7D × 13 = 91 bars
    if (interval === "1h")  return new Date(now.getTime() - 30 * 24 * 3600_000); // 30D × 6 = 180 bars
    // "1d" interval for "1D" period is now disabled in the UI, but handle defensively:
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  }
  if (period === "5D" && interval === "1h") {
    return new Date(now.getTime() - 30 * 24 * 3600_000); // extend to 30D so MACD works
  }

  switch (period) {
    case "5D": return new Date(now.getTime() - 5 * 24 * 3600_000);
    case "1W": return new Date(now.getTime() - 7 * 24 * 3600_000);
    case "1M": { d.setMonth(d.getMonth() - 1); return d; }
    case "3M": { d.setMonth(d.getMonth() - 3); return d; }
    case "1Y": { d.setFullYear(d.getFullYear() - 1); return d; }
    case "5Y": { d.setFullYear(d.getFullYear() - 5); return d; }
    default: return d;
  }
}

export async function getChartData(
  symbol: string,
  period: ChartPeriod,
  interval: ChartInterval,
  exchange: Exchange = "NSE"
) {
  const yahooSymbol = toYahooSymbol(symbol, exchange);
  const yahooInterval = interval === "1h" ? "60m" : interval;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yf.chart(yahooSymbol, {
    period1: periodToStartDate(period, interval),
    period2: new Date(),
    interval: yahooInterval,
  }, { validateResult: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((result?.quotes ?? []) as any[])
    .filter((q: any) => q.open != null && q.close != null)
    .map((q: any) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: q.open ?? 0,
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
      volume: q.volume ?? 0,
    }));
}

export async function getMultipleQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const quotes = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  return quotes
    .filter((r): r is PromiseFulfilledResult<MarketQuote> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function getFundamentals(symbol: string, exchange: Exchange = "NSE") {
  const yahooSymbol = toYahooSymbol(symbol, exchange);
  const [quoteSummary] = await Promise.allSettled([
    yf.quoteSummary(yahooSymbol, {
      modules: ["financialData", "defaultKeyStatistics"],
    }, { validateResult: false }),
  ]);

  if (quoteSummary.status !== "fulfilled") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = quoteSummary.value;
  const fd = data?.financialData;
  const ks = data?.defaultKeyStatistics;

  return {
    pe: ks?.trailingEps && fd?.currentPrice ? fd.currentPrice / ks.trailingEps : undefined,
    eps: ks?.trailingEps,
    revenue: fd?.totalRevenue,
    revenueGrowth: fd?.revenueGrowth,
    netIncome: fd?.netIncomeToCommon,
    netMargin: fd?.profitMargins,
    roe: fd?.returnOnEquity,
    debtToEquity: fd?.debtToEquity,
    currentRatio: fd?.currentRatio,
    freeCashFlow: fd?.freeCashflow,
    dividendYield: fd?.dividendYield,
    bookValue: ks?.bookValue,
    priceToBook: ks?.priceToBook,
  };
}
