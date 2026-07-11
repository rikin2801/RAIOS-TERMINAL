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
    const k = high === low ? 50 : ((closes[i] - low) / (high - low)) * 100;
    kValues.push(k);
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
