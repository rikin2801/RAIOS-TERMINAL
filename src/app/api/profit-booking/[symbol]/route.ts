import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData } from "@/lib/market";
import { calculateRSI, calculateEMA, calculateSMA, calculateMACD, calculateStochastic } from "@/lib/technical";
import { runProfitBookingAnalysis } from "@/lib/ai-analysis";
import type { Exchange } from "@/lib/india";
import type { ProfitBookingStatus, ProfitBookingTrigger, ProfitBookingResult } from "@/types";

function determineStatus(
  rsi: number,
  stoch: number,
  rangePosition: number,
  price: number,
  sma50: number,
): ProfitBookingStatus {
  // EXIT: price below SMA50 while overbought, or at peak of yearly range
  if ((!(price > sma50) && rsi > 68) || rangePosition > 92) return "EXIT";
  // ALERT: momentum AND position both extended — needs both signals to avoid false alarms
  if ((rsi > 70 && stoch > 78) || rsi > 75 || (rangePosition > 85 && rsi > 60)) return "ALERT";
  // WATCH: elevated momentum OR high range position (single signal — softer warning)
  if (rsi > 65 || stoch > 70 || rangePosition > 80) return "WATCH";
  return "LET_PROFITS_RUN";
}

function buildTriggers(
  rsi: number,
  stoch: number,
  macdHistogram: number,
  rangePosition: number,
  price: number,
  sma50: number,
  sma200: number,
  fiftyTwoWeekHigh: number,
): ProfitBookingTrigger[] {
  const triggers: ProfitBookingTrigger[] = [];

  // RSI
  if (rsi > 75) {
    triggers.push({ name: "RSI (14 day)", value: rsi.toFixed(1), tag: "Overbought", severity: "red" });
  } else if (rsi > 65) {
    triggers.push({ name: "RSI (14 day)", value: rsi.toFixed(1), tag: "Extended", severity: "orange" });
  } else {
    triggers.push({ name: "RSI (14 day)", value: rsi.toFixed(1), tag: "Normal", severity: "green" });
  }

  // Stochastic
  if (stoch > 80) {
    triggers.push({ name: "Stochastic %K", value: stoch.toFixed(1), tag: "Overbought", severity: "red" });
  } else if (stoch > 70) {
    triggers.push({ name: "Stochastic %K", value: stoch.toFixed(1), tag: "Elevated", severity: "orange" });
  } else {
    triggers.push({ name: "Stochastic %K", value: stoch.toFixed(1), tag: "Normal", severity: "green" });
  }

  // 52W range position
  if (rangePosition > 85) {
    triggers.push({ name: "52W Range Position", value: `${rangePosition.toFixed(0)}%`, tag: "Near top", severity: "orange" });
  } else if (rangePosition > 75) {
    triggers.push({ name: "52W Range Position", value: `${rangePosition.toFixed(0)}%`, tag: "Upper zone", severity: "amber" });
  } else {
    triggers.push({ name: "52W Range Position", value: `${rangePosition.toFixed(0)}%`, tag: "Mid range", severity: "green" });
  }

  // MACD
  triggers.push({
    name: "MACD Momentum",
    value: `${macdHistogram >= 0 ? "+" : ""}${macdHistogram.toFixed(2)}`,
    tag: macdHistogram > 0 ? "Still positive" : "Turning negative",
    severity: macdHistogram > 0 ? "green" : "orange",
  });

  // SMA50 position
  if (price < sma50) {
    triggers.push({ name: "vs SMA 50", value: `₹${sma50.toFixed(0)}`, tag: "Below — warning", severity: "red" });
  } else {
    triggers.push({ name: "vs SMA 50", value: `₹${sma50.toFixed(0)}`, tag: `+₹${(price - sma50).toFixed(0)} above`, severity: "green" });
  }

  // Upside to 52W high
  const upsidePct = ((fiftyTwoWeekHigh - price) / price) * 100;
  triggers.push({
    name: "Upside to 52W High",
    value: `₹${fiftyTwoWeekHigh.toFixed(0)}`,
    tag: upsidePct < 5 ? `Only ${upsidePct.toFixed(1)}% left` : `${upsidePct.toFixed(1)}% upside`,
    severity: upsidePct < 5 ? "red" : upsidePct < 12 ? "amber" : "green",
  });

  return triggers;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const exchange = (new URL(req.url).searchParams.get("exchange") ?? "NSE") as Exchange;

  try {
    const [quote, historical] = await Promise.all([
      getQuote(symbol, exchange),
      getHistoricalData(symbol, "1y", exchange, "DAILY"),
    ]);

    if (historical.length < 50) {
      return NextResponse.json({ error: "Insufficient historical data" }, { status: 400 });
    }

    const closes = historical.map((c) => c.close);
    const highs   = historical.map((c) => c.high);
    const lows    = historical.map((c) => c.low);

    const rsi          = calculateRSI(closes);
    const sma50        = calculateSMA(closes, 50);
    const sma200       = closes.length >= 200 ? calculateSMA(closes, 200) : calculateSMA(closes, closes.length);
    const { histogram: macdHistogram } = calculateMACD(closes);
    const { k: stochastic }            = calculateStochastic(highs, lows, closes);
    const ema20        = calculateEMA(closes, 20).at(-1) ?? closes.at(-1)!;

    const { fiftyTwoWeekHigh, fiftyTwoWeekLow } = quote;
    const rangeSpan     = fiftyTwoWeekHigh - fiftyTwoWeekLow || 1;
    const rangePosition = Math.round(((quote.price - fiftyTwoWeekLow) / rangeSpan) * 100);

    const status = determineStatus(rsi, stochastic, rangePosition, quote.price, sma50);

    const triggers = buildTriggers(rsi, stochastic, macdHistogram, rangePosition, quote.price, sma50, sma200, fiftyTwoWeekHigh);

    const { reasoning, suggestedAction } = await runProfitBookingAnalysis({
      symbol,
      name: quote.name,
      status,
      price: quote.price,
      rsi,
      stochastic,
      macdHistogram,
      sma50,
      sma200,
      rangePosition,
      fiftyTwoWeekHigh,
    });

    const result: ProfitBookingResult = {
      symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      rangePosition,
      status,
      indicators: {
        rsi: Math.round(rsi * 10) / 10,
        stochastic: Math.round(stochastic * 10) / 10,
        macdHistogram: Math.round(macdHistogram * 100) / 100,
        sma50: Math.round(sma50 * 100) / 100,
        sma200: Math.round(sma200 * 100) / 100,
      },
      triggers,
      reasoning,
      suggestedAction,
    };

    // suppress unused var warning
    void ema20;

    return NextResponse.json(result);
  } catch (error) {
    console.error(`Profit booking error for ${symbol}:`, error);
    return NextResponse.json({ error: `Failed to analyse ${symbol}` }, { status: 500 });
  }
}
