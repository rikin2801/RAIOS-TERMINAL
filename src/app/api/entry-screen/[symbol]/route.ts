import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData, getHourlyCandles } from "@/lib/market";
import {
  calculateMACD,
  calculateRSI,
  detectMACDCrossover,
  detectStochasticCrossover,
  calculateBollingerBandsValue,
  analyzeRSILevel,
  classifyEMASupport,
  detectCandlestickPattern,
} from "@/lib/technical";
import { computeClusteredSupportResistance } from "@/lib/trend-engine";
import { runEntryScreenAnalysis } from "@/lib/ai-analysis";
import type { Exchange } from "@/lib/india";
import type { EntryScreenStep1, EntryScreenStep2, EntryScreenStep3, EntryScreenResult } from "@/types";

// In-memory cache — 30-minute TTL
const _cache = new Map<string, { data: EntryScreenResult; ts: number }>();
const TTL_MS = 30 * 60_000;

function weeklyTrendLabel(candles: { open: number; high: number; low: number; close: number }[]): {
  trend: "UP" | "SIDEWAYS" | "DOWN"; evidence: string;
} {
  if (candles.length < 10) return { trend: "SIDEWAYS", evidence: "Insufficient weekly data" };
  const n = candles.length;
  const recent = candles.slice(Math.max(0, n - 12));
  const highs = recent.map(c => c.high);
  const lows  = recent.map(c => c.low);
  const mid   = Math.floor(recent.length / 2);
  const fH = Math.max(...highs.slice(0, mid));
  const sH = Math.max(...highs.slice(mid));
  const fL = Math.min(...lows.slice(0, mid));
  const sL = Math.min(...lows.slice(mid));
  const hh = sH > fH;
  const hl = sL > fL;
  if (hh && hl)   return { trend: "UP",       evidence: `Higher high ₹${sH.toFixed(0)} > ₹${fH.toFixed(0)}, higher low ₹${sL.toFixed(0)} > ₹${fL.toFixed(0)}` };
  if (!hh && !hl) return { trend: "DOWN",      evidence: `Lower high ₹${sH.toFixed(0)} < ₹${fH.toFixed(0)}, lower low ₹${sL.toFixed(0)} < ₹${fL.toFixed(0)}` };
  return { trend: "SIDEWAYS", evidence: `Mixed — high ${hh ? "↑" : "↓"} ₹${sH.toFixed(0)}, low ${hl ? "↑" : "↓"} ₹${sL.toFixed(0)}` };
}

function macdZone(hist: number, closes: number[]): "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" {
  const rsi = calculateRSI(closes);
  if (rsi > 70) return "OVERBOUGHT";
  if (rsi < 30) return "OVERSOLD";
  return "NEUTRAL";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const exchange = (searchParams.get("exchange") ?? "NSE") as Exchange;
  const force    = searchParams.get("force") === "true";
  const key      = `${symbol}:${exchange}`;

  if (!force) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return NextResponse.json({ ...cached.data, cached: true });
    }
  }

  try {
    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [quote, weeklyCandles, dailyCandles, hourlyCandles] = await Promise.all([
      getQuote(symbol, exchange),
      getHistoricalData(symbol, "2y", exchange, "WEEKLY"),
      getHistoricalData(symbol, "1y", exchange, "DAILY"),
      getHourlyCandles(symbol, exchange),
    ]);

    if (dailyCandles.length < 20) {
      return NextResponse.json({ error: "Insufficient price data for this symbol" }, { status: 400 });
    }

    const price = quote.price;
    const dCloses = dailyCandles.map(c => c.close);
    const dHighs  = dailyCandles.map(c => c.high);
    const dLows   = dailyCandles.map(c => c.low);
    const wCloses = weeklyCandles.map(c => c.close);
    const wHighs  = weeklyCandles.map(c => c.high);
    const wLows   = weeklyCandles.map(c => c.low);

    // ── STEP 1 — Weekly ─────────────────────────────────────────────────────
    const { trend: weeklyTrend, evidence: weeklyEvidence } = weeklyTrendLabel(weeklyCandles);
    const wMACDCrossover = weeklyCandles.length >= 28 ? detectMACDCrossover(wCloses) : "NONE";
    const { histogram: wMACDHist } = wCloses.length >= 26 ? calculateMACD(wCloses) : { histogram: 0 };
    const wMACDZone = macdZone(wMACDHist, wCloses.length >= 14 ? wCloses : dCloses);
    const weeklyDailySR = computeClusteredSupportResistance(weeklyCandles.length >= 10 ? weeklyCandles : dailyCandles);

    const step1: EntryScreenStep1 = {
      weeklyTrend,
      weeklyTrendEvidence: weeklyEvidence,
      macdCrossover: wMACDCrossover,
      macdZone: wMACDZone,
      macdHist: wMACDHist,
      support: weeklyDailySR.support,
      resistance: weeklyDailySR.resistance,
    };

    // ── STEP 2 — Daily (lower timeframe) ────────────────────────────────────
    const bbDaily    = calculateBollingerBandsValue(dCloses);
    const rsiDaily   = analyzeRSILevel(dCloses);
    const stochDaily = detectStochasticCrossover(dHighs, dLows, dCloses);
    const emaDaily   = classifyEMASupport(price, dCloses);

    // Hourly confirmation
    let hourlyConf: EntryScreenStep2["hourly"] = null;
    if (hourlyCandles.length >= 50) {
      const hCloses = hourlyCandles.map(c => c.close);
      const hHighs  = hourlyCandles.map(c => c.high);
      const hLows   = hourlyCandles.map(c => c.low);
      const hRSI    = calculateRSI(hCloses);
      const hStoch  = detectStochasticCrossover(hHighs, hLows, hCloses);
      const hMACD   = detectMACDCrossover(hCloses);

      // "Aligns" = hourly and daily are pointing the same direction
      const dailyBull = (stochDaily.crossover === "PCO" || rsiDaily.reversalDir === "UP" || emaDaily.status === "ABOVE_ALL");
      const hourlyBull = (hStoch.crossover === "PCO" || hRSI < 50 || hMACD === "PCO");
      const dailyBear = (stochDaily.crossover === "NCO" || rsiDaily.reversalDir === "DOWN" || emaDaily.status === "BELOW_ALL");
      const hourlyBear = (hStoch.crossover === "NCO" || hRSI > 60 || hMACD === "NCO");
      const aligns = (dailyBull && hourlyBull) || (dailyBear && hourlyBear);

      let note: string;
      if (hStoch.crossover !== "NONE") {
        note = `Hourly Stochastic ${hStoch.crossover} from ${hStoch.zone.toLowerCase()} — ${aligns ? "confirms daily" : "diverges from daily"}`;
      } else if (hMACD !== "NONE") {
        note = `Hourly MACD ${hMACD} — ${aligns ? "confirms daily direction" : "diverges from daily"}`;
      } else {
        note = `Hourly RSI ${hRSI.toFixed(1)} — ${aligns ? "aligns with daily setup" : "adds caution to daily setup"}`;
      }

      hourlyConf = {
        rsi: Math.round(hRSI * 10) / 10,
        stochCrossover: hStoch.crossover,
        stochZone: hStoch.zone,
        macdCrossover: hMACD,
        aligns,
        note,
      };
    }

    const step2: EntryScreenStep2 = {
      bb: bbDaily,
      rsi: rsiDaily,
      stochastic: { k: stochDaily.k, d: stochDaily.d, crossover: stochDaily.crossover, zone: stochDaily.zone },
      ema: { ema50: emaDaily.ema50, ema100: emaDaily.ema100, ema200: emaDaily.ema200, nearestEMA: emaDaily.nearestEMA, status: emaDaily.status, description: emaDaily.description },
      hourly: hourlyConf,
    };

    // ── STEP 3 — Price action from last 5 daily candles ─────────────────────
    const step3: EntryScreenStep3 = detectCandlestickPattern(dailyCandles.slice(-5));

    // ── Gemini / fallback assessment ─────────────────────────────────────────
    const ai = await runEntryScreenAnalysis({
      symbol, name: quote.name, price, step1, step2, step3,
    });

    const result: EntryScreenResult = {
      symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      step1,
      step2,
      step3,
      assessment:        ai.assessment,
      entryPrice:        ai.entryPrice,
      entryRangeHigh:    ai.entryRangeHigh,
      entryBasis:        ai.entryBasis,
      stopLoss:          ai.stopLoss,
      stopBasis:         ai.stopBasis,
      target:            ai.target,
      targetBasis:       ai.targetBasis,
      bbSummary:         ai.bbSummary,
      rsiSummary:        ai.rsiSummary,
      stochSummary:      ai.stochSummary,
      emaSummary:        ai.emaSummary,
      priceActionSummary: ai.priceActionSummary,
      why:               ai.why,
    };

    _cache.set(key, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[entry-screen] Error for ${symbol}:`, error);
    return NextResponse.json({ error: `Could not analyze ${symbol}. Check the symbol and try again.` }, { status: 500 });
  }
}
