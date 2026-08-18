// RAIOS Phase 1 — Higher High / Higher Low trend analysis

export interface TrendResult {
  trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  evidence: string;
  higherHighs: boolean;
  higherLows: boolean;
}

export interface MultiTimeframeTrend {
  oneMonth: TrendResult;
  threeMonths: TrendResult;
  sixMonths: TrendResult;
  oneYear: TrendResult;
  primary: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function findSwings(
  candles: Candle[],
  lookback = 5
): { highs: { i: number; price: number }[]; lows: { i: number; price: number }[] } {
  const highs: { i: number; price: number }[] = [];
  const lows: { i: number; price: number }[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const windowH = candles.slice(i - lookback, i + lookback + 1).map((c) => c.high);
    const windowL = candles.slice(i - lookback, i + lookback + 1).map((c) => c.low);
    if (candles[i].high === Math.max(...windowH)) highs.push({ i, price: candles[i].high });
    if (candles[i].low === Math.min(...windowL)) lows.push({ i, price: candles[i].low });
  }

  return { highs, lows };
}

function analyzePeriod(candles: Candle[]): TrendResult {
  if (candles.length < 20) {
    return { trend: "SIDEWAYS", evidence: "Insufficient data", higherHighs: false, higherLows: false };
  }

  const { highs, lows } = findSwings(candles, Math.min(5, Math.floor(candles.length / 6)));

  if (highs.length < 2 || lows.length < 2) {
    // Fallback: compare first half vs second half of the period
    const mid = Math.floor(candles.length / 2);
    const fH = Math.max(...candles.slice(0, mid).map((c) => c.high));
    const sH = Math.max(...candles.slice(mid).map((c) => c.high));
    const fL = Math.min(...candles.slice(0, mid).map((c) => c.low));
    const sL = Math.min(...candles.slice(mid).map((c) => c.low));
    const hh = sH > fH;
    const hl = sL > fL;
    const trend = hh && hl ? "UPTREND" : !hh && !hl ? "DOWNTREND" : "SIDEWAYS";
    return {
      trend,
      evidence: `H: ₹${sH.toFixed(0)} vs ₹${fH.toFixed(0)}, L: ₹${sL.toFixed(0)} vs ₹${fL.toFixed(0)}`,
      higherHighs: hh,
      higherLows: hl,
    };
  }

  const [h1, h2] = highs.slice(-2);
  const [l1, l2] = lows.slice(-2);
  const hh = h2.price > h1.price;
  const hl = l2.price > l1.price;
  const lh = !hh;
  const ll = !hl;

  let trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  let evidence: string;

  if (hh && hl) {
    trend = "UPTREND";
    evidence = `HH ₹${h2.price.toFixed(0)} > ₹${h1.price.toFixed(0)}, HL ₹${l2.price.toFixed(0)} > ₹${l1.price.toFixed(0)}`;
  } else if (lh && ll) {
    trend = "DOWNTREND";
    evidence = `LH ₹${h2.price.toFixed(0)} < ₹${h1.price.toFixed(0)}, LL ₹${l2.price.toFixed(0)} < ₹${l1.price.toFixed(0)}`;
  } else {
    trend = "SIDEWAYS";
    evidence = `Mixed: H ${hh ? "↑" : "↓"} ₹${h2.price.toFixed(0)} vs ₹${h1.price.toFixed(0)}, L ${hl ? "↑" : "↓"} ₹${l2.price.toFixed(0)} vs ₹${l1.price.toFixed(0)}`;
  }

  return { trend, evidence, higherHighs: hh, higherLows: hl };
}

export function analyzeMultiTimeframeTrend(allCandles: Candle[]): MultiTimeframeTrend {
  const n = allCandles.length;
  // Approximate trading days per period
  const oneMonth = analyzePeriod(allCandles.slice(Math.max(0, n - 22)));
  const threeMonths = analyzePeriod(allCandles.slice(Math.max(0, n - 66)));
  const sixMonths = analyzePeriod(allCandles.slice(Math.max(0, n - 130)));
  const oneYear = analyzePeriod(allCandles);

  // Weighted vote: longer timeframes matter more
  const score: Record<string, number> = { UPTREND: 0, DOWNTREND: 0, SIDEWAYS: 0 };
  score[oneYear.trend] += 4;
  score[sixMonths.trend] += 3;
  score[threeMonths.trend] += 2;
  score[oneMonth.trend] += 1;

  const primary = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0] as
    | "UPTREND"
    | "DOWNTREND"
    | "SIDEWAYS";

  return { oneMonth, threeMonths, sixMonths, oneYear, primary };
}

export function classifyBusinessHealth(fund: {
  revenueGrowth?: number;
  netMargin?: number;
  roe?: number;
  debtToEquity?: number;
  freeCashFlow?: number;
} | null): { health: "STRONG" | "STABLE" | "WEAK"; summary: string } {
  if (!fund) return { health: "STABLE", summary: "Fundamentals unavailable" };

  let score = 0;
  const points: string[] = [];

  if (fund.revenueGrowth !== undefined) {
    points.push(`Rev ${fund.revenueGrowth >= 0 ? "+" : ""}${(fund.revenueGrowth * 100).toFixed(1)}%`);
    if (fund.revenueGrowth > 0.15) score += 2;
    else if (fund.revenueGrowth > 0.05) score += 1;
    else if (fund.revenueGrowth < 0) score -= 1;
  }

  if (fund.netMargin !== undefined) {
    points.push(`Margin ${(fund.netMargin * 100).toFixed(1)}%`);
    if (fund.netMargin > 0.15) score += 2;
    else if (fund.netMargin > 0.08) score += 1;
    else if (fund.netMargin < 0.03) score -= 1;
  }

  if (fund.roe !== undefined) {
    points.push(`ROE ${(fund.roe * 100).toFixed(1)}%`);
    if (fund.roe > 0.18) score += 2;
    else if (fund.roe > 0.12) score += 1;
    else if (fund.roe < 0.08) score -= 1;
  }

  if (fund.debtToEquity !== undefined) {
    if (fund.debtToEquity < 0.5) score += 1;
    else if (fund.debtToEquity > 3) score -= 1;
  }

  if (fund.freeCashFlow !== undefined) {
    if (fund.freeCashFlow > 0) score += 1;
    else if (fund.freeCashFlow < 0) score -= 1;
  }

  const health: "STRONG" | "STABLE" | "WEAK" =
    score >= 4 ? "STRONG" : score >= 1 ? "STABLE" : "WEAK";

  return { health, summary: points.length > 0 ? points.join(" · ") : "Limited data" };
}

export function classifyPriceAttractiveness(
  price: number,
  w52High: number,
  w52Low: number,
  analystTarget?: number | null
): { attractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE"; summary: string } {
  const points: string[] = [];
  let score = 0;

  if (w52High > 0) {
    const fromHigh = ((price - w52High) / w52High) * 100;
    points.push(`${fromHigh.toFixed(1)}% from 52W high`);
    if (fromHigh < -20) score += 2;
    else if (fromHigh < -10) score += 1;
    else if (fromHigh > -5) score -= 1;
  }

  if (analystTarget && analystTarget > 0) {
    const upside = ((analystTarget - price) / price) * 100;
    points.push(`+${upside.toFixed(0)}% to analyst avg ₹${analystTarget.toFixed(0)}`);
    if (upside > 20) score += 2;
    else if (upside > 10) score += 1;
    else if (upside < 0) score -= 2;
  }

  const attractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE" =
    score >= 2 ? "ATTRACTIVE" : score <= -1 ? "EXPENSIVE" : "FAIRLY_VALUED";

  return { attractiveness, summary: points.join(" · ") || "Insufficient data" };
}

export function computeEntryZone(
  price: number,
  support: number,
): { low: number; high: number; confirmationLevel: number } {
  // Entry zone anchored to actual support level, not to current price.
  // "Preferred entry zone" = where you would want to buy on a pullback.
  // - High: up to 4% above support (where momentum buyers step in near support)
  // - Low: at the support level itself
  // - Capped so the zone never overlaps the current price (min 3% below)
  const supportBasedHigh = support * 1.04;
  const maxAllowed = price * 0.97;           // zone must be at least 3% below price
  const entryHigh = Math.round(Math.min(supportBasedHigh, maxAllowed) * 10) / 10;
  const entryLow  = Math.round(support * 10) / 10;
  const confirmationLevel = Math.round(price * 1.02 * 10) / 10;

  return { low: entryLow, high: entryHigh, confirmationLevel };
}

export function computeClusteredSupportResistance(
  candles: Candle[]
): { support: number; resistance: number } {
  const recent = candles.slice(-60);
  const price = candles[candles.length - 1].close;

  const step = price > 500 ? 10 : price > 100 ? 5 : 1;
  const allLevels = [...recent.map((c) => c.high), ...recent.map((c) => c.low)].map(
    (p) => Math.round(p / step) * step
  );
  const freq: Record<number, number> = {};
  allLevels.forEach((p) => { freq[p] = (freq[p] || 0) + 1; });

  const sorted = Object.entries(freq)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 20)
    .map((e) => Number(e[0]));

  // Prefer levels at least 3% away from current price so S/R are actionable,
  // not just the nearest candle wick when the stock is in a tight range.
  const minDist = price * 0.03;
  const suppCandidates  = sorted.filter(p => p < price - minDist).sort((a, b) => b - a);
  const resCandidates   = sorted.filter(p => p > price + minDist).sort((a, b) => a - b);

  // Fallback: any level below/above if no candidate meets the 3% floor
  const anyBelow = sorted.filter(p => p < price).sort((a, b) => b - a);
  const anyAbove = sorted.filter(p => p > price).sort((a, b) => a - b);

  const support    = suppCandidates[0]  ?? anyBelow[0]  ?? Math.round(price * 0.95 / step) * step;
  const resistance = resCandidates[0]   ?? anyAbove[0]  ?? Math.round(price * 1.05 / step) * step;

  return { support, resistance };
}
