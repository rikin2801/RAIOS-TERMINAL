import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { getQuote, getHistoricalData } from "@/lib/market";
import { calculateAllIndicators } from "@/lib/technical";
import type { Exchange } from "@/lib/india";

const ForecastSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  currentPrice: z.number(),
  generatedAt: z.string(),
  technicalBias: z.enum(["STRONGLY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONGLY_BEARISH"]),
  forecasts: z.array(z.object({
    timeframe: z.enum(["1M", "3M", "6M", "1Y"]),
    bull: z.object({ price: z.number(), changePercent: z.number(), probability: z.number(), rationale: z.string() }),
    base: z.object({ price: z.number(), changePercent: z.number(), probability: z.number(), rationale: z.string() }),
    bear: z.object({ price: z.number(), changePercent: z.number(), probability: z.number(), rationale: z.string() }),
    keyLevel: z.string(),
    catalyst: z.string(),
  })),
  technicalSummary: z.object({
    rsi: z.number(),
    trend: z.string(),
    macdSignal: z.string(),
    support: z.number(),
    resistance: z.number(),
    stochastic: z.number(),
    aboveSMA50: z.boolean(),
    aboveSMA200: z.boolean(),
  }),
  keyRisks: z.array(z.string()),
  disclaimer: z.string(),
});

export type ForecastData = z.infer<typeof ForecastSchema>;

type TechInd = ReturnType<typeof calculateAllIndicators>;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "RELIANCE").toUpperCase();
  const exchange = (searchParams.get("exchange") ?? "NSE") as Exchange;

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  const [quote, candles] = await Promise.all([
    getQuote(symbol, exchange).catch(() => null),
    getHistoricalData(symbol, "1y", exchange).catch(() => []),
  ]);

  const price = quote?.price ?? 0;
  const indicators: TechInd | null = candles.length >= 30 ? calculateAllIndicators(candles) : null;

  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json(getMockForecast(symbol, quote?.name ?? symbol, price, indicators));
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const technicalCtx = indicators
    ? `RSI(14): ${indicators.rsi.toFixed(1)} (${indicators.rsi > 70 ? "Overbought" : indicators.rsi < 30 ? "Oversold" : "Neutral"})
MACD: ${indicators.macd.toFixed(2)} | Signal: ${indicators.macdSignal.toFixed(2)} | Histogram: ${indicators.macdHistogram > 0 ? "Positive (Bullish)" : "Negative (Bearish)"}
Stochastic K: ${indicators.stochastic.toFixed(1)}, D: ${indicators.stochasticSignal.toFixed(1)}
SMA50: ₹${indicators.sma50.toFixed(0)} — price ${price > indicators.sma50 ? "ABOVE (bullish)" : "BELOW (bearish)"}
SMA200: ₹${indicators.sma200.toFixed(0)} — price ${price > indicators.sma200 ? "ABOVE (bullish)" : "BELOW (bearish)"}
Trend: ${indicators.trend}
Support: ₹${indicators.support.toFixed(0)} | Resistance: ₹${indicators.resistance.toFixed(0)}`
    : "Technical data unavailable (insufficient historical data)";

  const prompt = `You are RAIOS, a quantitative equity analyst specializing in Indian markets (NSE/BSE).

Analyze ${symbol} (${exchange}) at ₹${price.toFixed(2)} and generate a professional multi-timeframe price forecast.

TECHNICAL ANALYSIS:
${technicalCtx}

${quote ? `MARKET DATA:
Name: ${quote.name}
52W High: ₹${quote.fiftyTwoWeekHigh?.toFixed(0) ?? "N/A"} | 52W Low: ₹${quote.fiftyTwoWeekLow?.toFixed(0) ?? "N/A"}
Today: ₹${quote.low?.toFixed(0) ?? "N/A"} – ₹${quote.high?.toFixed(0) ?? "N/A"}
Volume: ${quote.volume?.toLocaleString("en-IN") ?? "N/A"}` : ""}

Generate forecasts for 1M, 3M, 6M, 1Y timeframes.
For each:
- BULL / BASE / BEAR scenarios with target price, % change from current ₹${price.toFixed(2)}, probability (must sum to ~100%), and 1-sentence rationale
- Key price level (support or resistance) to watch
- Primary catalyst driving the scenario

Also:
- Overall technical bias (STRONGLY_BULLISH/BULLISH/NEUTRAL/BEARISH/STRONGLY_BEARISH)
- technicalSummary (rsi, trend string, macdSignal string, support/resistance numbers, stochastic, aboveSMA50 bool, aboveSMA200 bool)
- 3 specific key risks`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: ForecastSchema,
      prompt,
    });
    return NextResponse.json(object);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/forecast] Gemini error:", msg);
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const isAuth  = msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("UNAUTHENTICATED");
    const label   = isQuota ? "Gemini free-tier quota exceeded (20 req/day). Showing technical estimates — quota resets at midnight Pacific time."
                  : isAuth  ? `Gemini API key rejected: ${msg}`
                  :           `Gemini error: ${msg}`;
    return NextResponse.json(
      { ...getMockForecast(symbol, quote?.name ?? symbol, price, indicators), aiError: label },
      { status: 200 }
    );
  }
}

function getMockForecast(symbol: string, name: string, price: number, ind: TechInd | null): ForecastData {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const p = price || 100;

  const makeTF = (
    timeframe: "1M" | "3M" | "6M" | "1Y",
    bullPct: number, basePct: number, bearPct: number,
    catalyst: string, keyLevel: string,
  ) => ({
    timeframe,
    bull: {
      price: parseFloat((p * (1 + bullPct / 100)).toFixed(2)),
      changePercent: bullPct,
      probability: 30,
      rationale: `Strong momentum continuation with volume expansion and positive sector rotation.`,
    },
    base: {
      price: parseFloat((p * (1 + basePct / 100)).toFixed(2)),
      changePercent: basePct,
      probability: 50,
      rationale: `Steady growth aligned with sector earnings trajectory and market conditions.`,
    },
    bear: {
      price: parseFloat((p * (1 + bearPct / 100)).toFixed(2)),
      changePercent: bearPct,
      probability: 20,
      rationale: `Market correction or sector-specific headwind triggers a retracement.`,
    },
    keyLevel,
    catalyst,
  });

  const rsi = ind?.rsi ?? 50;
  const bias = rsi > 65 ? "BULLISH" : rsi > 55 ? "BULLISH" : rsi < 35 ? "BEARISH" : rsi < 45 ? "BEARISH" : "NEUTRAL";

  return {
    symbol,
    name: name || symbol,
    currentPrice: p,
    generatedAt: today,
    technicalBias: bias as ForecastData["technicalBias"],
    forecasts: [
      makeTF("1M", 8, 3, -5, "Near-term momentum and price action", `₹${(p * 0.95).toFixed(0)} support`),
      makeTF("3M", 16, 8, -10, "Quarterly earnings and sector rotation signals", `₹${(p * 0.92).toFixed(0)} key support`),
      makeTF("6M", 28, 14, -15, "H2 earnings cycle, FII inflows, policy catalysts", `₹${(p * 0.88).toFixed(0)} major support`),
      makeTF("1Y", 45, 22, -20, "Annual earnings re-rating and valuation expansion", `₹${(p * 0.85).toFixed(0)} long-term support`),
    ],
    technicalSummary: {
      rsi: rsi,
      trend: ind?.trend ?? "SIDEWAYS",
      macdSignal: ind ? (ind.macdHistogram > 0 ? "BULLISH CROSSOVER" : "BEARISH CROSSOVER") : "NEUTRAL",
      support: ind?.support ?? p * 0.92,
      resistance: ind?.resistance ?? p * 1.1,
      stochastic: ind?.stochastic ?? 50,
      aboveSMA50: ind ? p > ind.sma50 : true,
      aboveSMA200: ind ? p > ind.sma200 : false,
    },
    keyRisks: [
      "Global risk-off event — FII outflows from emerging markets including India",
      "RBI rate hike or liquidity tightening affecting sector/company valuations",
      "Earnings miss in next quarterly results below street consensus",
    ],
    disclaimer: "Connect Gemini API for real AI forecasts. These are illustrative projections using basic technical assumptions — not financial advice.",
  };
}
