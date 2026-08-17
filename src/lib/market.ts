import YahooFinance from "yahoo-finance2";
import type { MarketQuote } from "@/types";
import { toYahooSymbol, fromYahooSymbol, POPULAR_INDIAN_STOCKS, type Exchange } from "./india";
import { getNSEQuote } from "./nse";
import {
  calculateRSI, calculateMACD, calculateStochastic,
  calculateSMA, findSupportResistance,
} from "./technical";

const yf = new YahooFinance();

const _quoteCache = new Map<string, { data: MarketQuote; ts: number }>();
const QUOTE_TTL_MS = 60_000;
const _inFlight = new Map<string, Promise<MarketQuote>>();

export async function getQuote(symbol: string, exchange: Exchange = "NSE"): Promise<MarketQuote> {
  const key = `${symbol}:${exchange}`;

  const cached = _quoteCache.get(key);
  if (cached && Date.now() - cached.ts < QUOTE_TTL_MS) return cached.data;

  const existing = _inFlight.get(key);
  if (existing) return existing;

  const req = (async () => {
    // ── Try NSE first for real-time prices (NSE stocks only) ──────────────
    if (exchange === "NSE") {
      try {
        const nse = await getNSEQuote(symbol);
        if (nse.lastPrice > 0) {
          const result: MarketQuote = {
            symbol: nse.symbol,
            name: nse.companyName,
            price: nse.lastPrice,
            open: nse.open,
            high: nse.dayHigh,
            low: nse.dayLow,
            previousClose: nse.previousClose,
            volume: nse.totalTradedVolume,
            change: nse.change,
            changePercent: nse.pChange,
            fiftyTwoWeekHigh: nse.weekHigh52,
            fiftyTwoWeekLow: nse.weekLow52,
            // fundamentals remain from Yahoo Finance via getFundamentals()
          };
          _quoteCache.set(key, { data: result, ts: Date.now() });
          _inFlight.delete(key);
          return result;
        }
      } catch {
        // NSE blocked or unavailable — fall through to Yahoo Finance
      }
    }

    // ── Yahoo Finance fallback ─────────────────────────────────────────────
    const yahooSymbol = toYahooSymbol(symbol, exchange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quote: any = await yf.quote(yahooSymbol, {}, { validateResult: false });
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`No market data found for ${yahooSymbol}`);
    }
    // Yahoo Finance misclassifies Indian InvITs/REITs (e.g. PGINVIT.NS) as MUTUALFUND,
    // serving a stale daily NAV instead of the live market price.
    // Retry with the BSE suffix (.BO) — Yahoo has correct EQUITY data there.
    if (quote.quoteType === "MUTUALFUND" && yahooSymbol.endsWith(".NS")) {
      const bsoSymbol = `${symbol}.BO`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bsoQuote: any = await yf.quote(bsoSymbol, {}, { validateResult: false }).catch(() => null);
      if (bsoQuote?.regularMarketPrice && bsoQuote.quoteType !== "MUTUALFUND") {
        quote = bsoQuote;
      }
      // If BSE also fails or is also MUTUALFUND, fall through with whatever we have
    }
    const { symbol: cleanSymbol } = fromYahooSymbol(quote.symbol ?? yahooSymbol);
    // Yahoo returns corrupted shortName for InvITs/ETFs (e.g. "PGINVIT.NS,0P0001MGQ9,...")
    // Fall back to the known name from india.ts, then to the raw symbol.
    const rawName = quote.longName ?? quote.shortName ?? "";
    const knownName = POPULAR_INDIAN_STOCKS.find((s) => s.symbol === cleanSymbol)?.name;
    const name = knownName ?? (rawName && !rawName.includes(",") ? rawName : cleanSymbol);
    const result: MarketQuote = {
      symbol: cleanSymbol,
      name,
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
  const chartOpts = {
    period1: getStartDate(effectivePeriod),
    period2: new Date(),
    interval: timeframeToInterval(timeframe),
  };

  // Check if Yahoo classifies this as MUTUALFUND (affects InvITs like PGINVIT.NS)
  // and fall back to the BSE ticker which Yahoo correctly treats as EQUITY.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = await yf.chart(yahooSymbol, chartOpts, { validateResult: false });
  if (yahooSymbol.endsWith(".NS")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = result?.meta;
    if (meta?.instrumentType === "MUTUALFUND" || meta?.quoteType === "MUTUALFUND") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bsoResult: any = await yf.chart(`${symbol}.BO`, chartOpts, { validateResult: false }).catch(() => null);
      if (bsoResult?.quotes?.length) result = bsoResult;
    }
  }

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
export type ChartInterval = "1m" | "30m" | "1h" | "1d" | "1wk";

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

// ── Holding Technicals (for AI decision engine) ───────────────────────────────

export interface HoldingTechnicals {
  rsi: number;
  macdHistogram: number;
  stochasticK: number;
  sma50: number;
  sma200: number;
  currentPrice: number;
  support: number;
  resistance: number;
  // Derived labels
  dailyTrend: "Bullish" | "Bearish" | "Neutral";
  weeklyTrend: "Bullish" | "Bearish" | "Neutral";
  monthlyTrend: "Bullish" | "Bearish" | "Neutral";
  macdLabel: "Positive" | "Negative" | "Neutral";
  stochasticLabel: "Strong" | "Weak" | "Neutral";
  volumeLabel: "Strong" | "Weak" | "Average";
  momentumLabel: "Strong" | "Weak" | "Neutral";
  aboveSma50: boolean;
  aboveSma200: boolean;
}

const _techCache = new Map<string, { data: HoldingTechnicals; ts: number }>();
const TECH_TTL_MS = 15 * 60_000;

export async function getHoldingTechnicals(
  symbol: string,
  exchange: Exchange = "NSE",
): Promise<HoldingTechnicals | null> {
  const key = `tech:${symbol}:${exchange}`;
  const cached = _techCache.get(key);
  if (cached && Date.now() - cached.ts < TECH_TTL_MS) return cached.data;

  try {
    const candles = await getHistoricalData(symbol, "1y", exchange, "DAILY");
    if (candles.length < 50) return null;

    const closes  = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    const price   = closes[closes.length - 1];
    const vol     = volumes[volumes.length - 1];

    const rsi = calculateRSI(closes);
    const { histogram: macdH } = calculateMACD(closes);
    const { k: stochK } = calculateStochastic(highs, lows, closes);
    const sma10  = calculateSMA(closes, 10);
    const sma20  = calculateSMA(closes, 20);
    const sma30  = calculateSMA(closes, 30);
    const sma50  = calculateSMA(closes, 50);
    const sma150 = calculateSMA(closes, 150);
    const sma200 = calculateSMA(closes, 200);
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const { support, resistance } = findSupportResistance(highs, lows, closes);

    // Daily: RSI + MACD direction + price vs SMA20
    const dailyTrend: HoldingTechnicals["dailyTrend"] =
      rsi > 52 && macdH > 0 && price > sma20 ? "Bullish" :
      rsi < 48 && macdH < 0 && price < sma20 ? "Bearish" : "Neutral";

    // Weekly proxy: SMA10 vs SMA30
    const weeklyTrend: HoldingTechnicals["weeklyTrend"] =
      price > sma10 && sma10 > sma30 ? "Bullish" :
      price < sma10 && sma10 < sma30 ? "Bearish" : "Neutral";

    // Monthly proxy: SMA50 vs SMA150
    const monthlyTrend: HoldingTechnicals["monthlyTrend"] =
      price > sma50 && sma50 > sma150 ? "Bullish" :
      price < sma50 && sma50 < sma150 ? "Bearish" : "Neutral";

    const macdLabel: HoldingTechnicals["macdLabel"] =
      macdH > 0.5 ? "Positive" : macdH < -0.5 ? "Negative" : "Neutral";

    const stochasticLabel: HoldingTechnicals["stochasticLabel"] =
      stochK > 60 ? "Strong" : stochK < 40 ? "Weak" : "Neutral";

    const volRatio = avgVol > 0 ? vol / avgVol : 1;
    const volumeLabel: HoldingTechnicals["volumeLabel"] =
      volRatio > 1.4 ? "Strong" : volRatio < 0.7 ? "Weak" : "Average";

    const momentumLabel: HoldingTechnicals["momentumLabel"] =
      rsi > 60 && macdH > 0 && price > sma50 ? "Strong" :
      rsi < 40 || (macdH < 0 && price < sma50) ? "Weak" : "Neutral";

    const data: HoldingTechnicals = {
      rsi: Math.round(rsi),
      macdHistogram: parseFloat(macdH.toFixed(4)),
      stochasticK: Math.round(stochK),
      sma50: Math.round(sma50),
      sma200: Math.round(sma200),
      currentPrice: price,
      support: Math.round(support),
      resistance: Math.round(resistance),
      dailyTrend,
      weeklyTrend,
      monthlyTrend,
      macdLabel,
      stochasticLabel,
      volumeLabel,
      momentumLabel,
      aboveSma50: price > sma50,
      aboveSma200: price > sma200,
    };

    _techCache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
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
    // Analyst consensus
    analystTarget: fd?.targetMeanPrice ?? undefined,
    analystCount: fd?.numberOfAnalystOpinions ?? undefined,
    analystConsensus: fd?.recommendationKey ?? undefined,
  };
}

export async function getHourlyCandles(symbol: string, exchange: Exchange = "NSE") {
  const yahooSymbol = toYahooSymbol(symbol, exchange);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yf.chart(yahooSymbol, {
      period1: new Date(Date.now() - 90 * 24 * 3600_000),
      period2: new Date(),
      interval: "60m",
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
  } catch {
    return [];
  }
}
