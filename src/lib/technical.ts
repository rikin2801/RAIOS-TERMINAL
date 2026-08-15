import type { TechnicalIndicators } from "@/types";

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] ?? 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateMACD(closes: number[]): {
  macd: number;
  signal: number;
  histogram: number;
} {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine.slice(-9), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd, signal, histogram: macd - signal };
}

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3
): { k: number; d: number } {
  if (closes.length < kPeriod) return { k: 50, d: 50 };
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const high = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const low = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    // Clamp to [0,100]: ETF adjusted-close data can place close outside the
    // unadjusted high-low range, producing physically impossible values.
    const raw = high === low ? 50 : ((closes[i] - low) / (high - low)) * 100;
    kValues.push(Math.min(100, Math.max(0, raw)));
  }
  const k = kValues[kValues.length - 1];
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;
  return { k, d };
}

export function findSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[]
): { support: number; resistance: number } {
  const recent = closes.slice(-50);
  const recentHighs = highs.slice(-50);
  const recentLows = lows.slice(-50);

  const resistance = Math.max(...recentHighs.slice(-20));
  const support = Math.min(...recentLows.slice(-20));

  return { support, resistance };
}

export function determineTrend(
  sma50: number,
  sma200: number,
  currentPrice: number
): "UPTREND" | "DOWNTREND" | "SIDEWAYS" {
  const diff = Math.abs(sma50 - sma200) / sma200;
  if (diff < 0.02) return "SIDEWAYS";
  if (currentPrice > sma50 && sma50 > sma200) return "UPTREND";
  if (currentPrice < sma50 && sma50 < sma200) return "DOWNTREND";
  return "SIDEWAYS";
}

// ── Entry Screen Indicators ───────────────────────────────────────────────────

export function getEMAValue(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  return calculateEMA(closes, period)[closes.length - 1];
}

export function detectMACDCrossover(closes: number[]): "PCO" | "NCO" | "NONE" {
  if (closes.length < 28) return "NONE";
  const prev = calculateMACD(closes.slice(0, -1));
  const curr = calculateMACD(closes);
  if (prev.histogram < 0 && curr.histogram >= 0) return "PCO";
  if (prev.histogram > 0 && curr.histogram <= 0) return "NCO";
  return "NONE";
}

export function detectStochasticCrossover(
  highs: number[], lows: number[], closes: number[]
): { crossover: "PCO" | "NCO" | "NONE"; zone: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL"; k: number; d: number } {
  if (closes.length < 16) return { crossover: "NONE", zone: "NEUTRAL", k: 50, d: 50 };
  const prev = calculateStochastic(highs.slice(0, -1), lows.slice(0, -1), closes.slice(0, -1));
  const curr = calculateStochastic(highs, lows, closes);
  let crossover: "PCO" | "NCO" | "NONE" = "NONE";
  if (prev.k <= prev.d && curr.k > curr.d) crossover = "PCO";
  else if (prev.k >= prev.d && curr.k < curr.d) crossover = "NCO";
  const zone: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" =
    curr.k > 80 ? "OVERBOUGHT" : curr.k < 20 ? "OVERSOLD" : "NEUTRAL";
  return { crossover, zone, k: curr.k, d: curr.d };
}

export function calculateBollingerBandsValue(closes: number[], period = 20): {
  upper: number; middle: number; lower: number; direction: "UP" | "DOWN" | "FLAT";
} | null {
  if (closes.length < period + 2) return null;
  const band = (slice: number[]) => {
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std  = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
  };
  const curr = band(closes.slice(-period));
  const prev = band(closes.slice(-period - 1, -1));
  const diff = curr.upper - prev.upper;
  const direction: "UP" | "DOWN" | "FLAT" =
    Math.abs(diff) < curr.middle * 0.001 ? "FLAT" : diff > 0 ? "UP" : "DOWN";
  return { ...curr, direction };
}

export function analyzeRSILevel(closes: number[]): {
  currentRSI: number; nearestLevel: number;
  action: "SUPPORT" | "RESISTANCE" | "NONE"; reversalDir: "UP" | "DOWN" | "NONE"; description: string;
} {
  const LEVELS = [20, 40, 50, 60, 80];
  const TOLERANCE = 4;
  const currentRSI = calculateRSI(closes);
  const nearestLevel = LEVELS.reduce((p, c) => Math.abs(c - currentRSI) < Math.abs(p - currentRSI) ? c : p);
  if (closes.length < 20) {
    return { currentRSI, nearestLevel, action: "NONE", reversalDir: "NONE", description: "Insufficient data" };
  }
  const seriesLen = Math.min(7, closes.length - 15);
  const rsiSeries: number[] = [];
  for (let i = seriesLen; i >= 0; i--) rsiSeries.push(calculateRSI(closes.slice(0, closes.length - i)));
  for (const level of LEVELS) {
    for (let i = 0; i < rsiSeries.length - 1; i++) {
      if (Math.abs(rsiSeries[i] - level) <= TOLERANCE) {
        const delta = rsiSeries[rsiSeries.length - 1] - rsiSeries[i];
        if (Math.abs(delta) >= 2) {
          const reversalDir: "UP" | "DOWN" = delta > 0 ? "UP" : "DOWN";
          const action: "SUPPORT" | "RESISTANCE" = reversalDir === "UP" ? "SUPPORT" : "RESISTANCE";
          return {
            currentRSI, nearestLevel: level, action, reversalDir,
            description: `RSI bounced off the ${level} level (${action.toLowerCase()}) and is moving ${reversalDir === "UP" ? "upward" : "downward"} — now at ${currentRSI.toFixed(1)}`,
          };
        }
      }
    }
  }
  return { currentRSI, nearestLevel, action: "NONE", reversalDir: "NONE",
    description: `RSI at ${currentRSI.toFixed(1)} — nearest key level: ${nearestLevel}` };
}

export function classifyEMASupport(price: number, closes: number[]): {
  ema50: number; ema100: number; ema200: number;
  nearestEMA: 50 | 100 | 200 | null;
  status: "ABOVE_ALL" | "HOLDING_50" | "HOLDING_100" | "HOLDING_200" | "BELOW_ALL";
  description: string;
} {
  const ema50  = closes.length >= 50  ? getEMAValue(closes, 50)  : 0;
  const ema100 = closes.length >= 100 ? getEMAValue(closes, 100) : 0;
  const ema200 = closes.length >= 200 ? getEMAValue(closes, 200) : 0;
  const NEAR   = 0.025;
  type Pair = [50 | 100 | 200, number];
  const pairs: Pair[] = ([[ 50, ema50 ], [100, ema100], [200, ema200]] as Pair[]).filter(([, v]) => v > 0);
  if (pairs.every(([, v]) => price > v)) {
    return { ema50, ema100, ema200, nearestEMA: 50, status: "ABOVE_ALL",
      description: `Price ₹${price.toFixed(0)} above all major EMAs (50: ₹${ema50.toFixed(0)}, 100: ₹${ema100.toFixed(0)}, 200: ₹${ema200.toFixed(0)}) — bullish structure intact` };
  }
  if (pairs.every(([, v]) => price < v)) {
    return { ema50, ema100, ema200, nearestEMA: 200, status: "BELOW_ALL",
      description: `Price ₹${price.toFixed(0)} below all major EMAs — bearish structure` };
  }
  for (const [period, val] of pairs.sort(([a], [b]) => a - b)) {
    if (price >= val && Math.abs(price - val) / val < NEAR) {
      const key = `HOLDING_${period}` as "HOLDING_50" | "HOLDING_100" | "HOLDING_200";
      return { ema50, ema100, ema200, nearestEMA: period, status: key,
        description: `Price ₹${price.toFixed(0)} is holding near the ${period} EMA (₹${val.toFixed(0)}) — key support zone` };
    }
  }
  const above = pairs.filter(([, v]) => v < price).sort((a, b) => b[1] - a[1]);
  if (above.length > 0) {
    const [period, val] = above[0];
    const key = `HOLDING_${period}` as "HOLDING_50" | "HOLDING_100" | "HOLDING_200";
    return { ema50, ema100, ema200, nearestEMA: period, status: key,
      description: `Price ₹${price.toFixed(0)} between EMAs — above ${period} EMA (₹${val.toFixed(0)}), watching as support` };
  }
  return { ema50, ema100, ema200, nearestEMA: null, status: "BELOW_ALL",
    description: "Price below key EMAs — no EMA support overhead" };
}

export function detectCandlestickPattern(
  candles: { open: number; high: number; low: number; close: number }[]
): { pattern: string; direction: "BULLISH" | "BEARISH" | "NEUTRAL"; description: string } {
  if (candles.length < 2) return { pattern: "—", direction: "NEUTRAL", description: "Insufficient data" };
  const c = candles[candles.length - 1];
  const p = candles[candles.length - 2];
  const body   = Math.abs(c.close - c.open);
  const range  = c.high - c.low || 0.001;
  const upper  = c.high - Math.max(c.open, c.close);
  const lower  = Math.min(c.open, c.close) - c.low;
  const bull   = c.close > c.open;
  const pBull  = p.close > p.open;
  const pBody  = Math.abs(p.close - p.open);
  if (body < range * 0.08)
    return { pattern: "Doji", direction: "NEUTRAL", description: "Open and close nearly equal — market is undecided, watch for a directional break" };
  if (!pBull && bull && c.open <= p.close && c.close >= p.open && body > pBody * 0.7)
    return { pattern: "Bullish Engulfing", direction: "BULLISH", description: "Large green candle fully engulfs the previous red — buyers absorbed all selling and extended higher" };
  if (pBull && !bull && c.open >= p.close && c.close <= p.open && body > pBody * 0.7)
    return { pattern: "Bearish Engulfing", direction: "BEARISH", description: "Large red candle fully engulfs the previous green — sellers absorbed all buying and extended lower" };
  if (lower >= body * 2 && upper < body * 0.5 && body > 0)
    return { pattern: "Hammer", direction: "BULLISH", description: "Long lower wick — price sold off sharply but buyers recovered; sellers rejected at the lows" };
  if (upper >= body * 2 && lower < body * 0.5 && body > 0)
    return { pattern: "Shooting Star", direction: "BEARISH", description: "Long upper wick — price rallied sharply but sellers pushed it back; buyers rejected at the highs" };
  if (bull && body > range * 0.65)
    return { pattern: "Strong Bullish", direction: "BULLISH", description: "Large green candle with conviction — buyers dominated the entire session with little selling" };
  if (!bull && body > range * 0.65)
    return { pattern: "Strong Bearish", direction: "BEARISH", description: "Large red candle with conviction — sellers dominated the entire session with little buying" };
  return {
    pattern: bull ? "Bullish candle" : "Bearish candle",
    direction: bull ? "BULLISH" : "BEARISH",
    description: `${bull ? "Green" : "Red"} candle — moderate ${bull ? "buying" : "selling"} pressure, price closed ${bull ? "above" : "below"} open`,
  };
}

export function calculateAllIndicators(candles: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[]): TechnicalIndicators {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const rsi = calculateRSI(closes);
  const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMACD(closes);
  const { k: stochastic, d: stochasticSignal } = calculateStochastic(highs, lows, closes);
  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);
  const currentPrice = closes[closes.length - 1];
  const trend = determineTrend(sma50, sma200, currentPrice);
  const { support, resistance } = findSupportResistance(highs, lows, closes);

  return {
    rsi,
    macd,
    macdSignal,
    macdHistogram,
    stochastic,
    stochasticSignal,
    sma50,
    sma200,
    trend,
    support,
    resistance,
  };
}
