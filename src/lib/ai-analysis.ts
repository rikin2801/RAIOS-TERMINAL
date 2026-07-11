import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { AIAnalysisResult, TechnicalIndicators, FundamentalData, MarketQuote } from "@/types";

const IndicatorDetailSchema = z.object({
  value: z.string(),
  interpretation: z.string(),
  signal: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
});

const AnalysisSchema = z.object({
  signal: z.enum(["BUY", "HOLD", "SELL", "ACCUMULATE", "REDUCE"]),
  confidence: z.number().min(0).max(100),
  investmentScore: z.number().min(0).max(10),
  risks: z.array(z.string()),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  entryZone: z.string(),
  stopLoss: z.number(),
  targetPrice: z.number(),
  summary: z.string(),
  recommendation: z.string(),
  reasoning: z.string(),
  whyNow: z.string(),
  whatCouldInvalidate: z.string(),
  holdingPeriod: z.string(),
  expectedReward: z.string(),
  expectedRisk: z.string(),
  technicalSnapshot: z.object({
    rsi: IndicatorDetailSchema,
    macd: IndicatorDetailSchema,
    stochastic: IndicatorDetailSchema,
    sma50: IndicatorDetailSchema,
    sma200: IndicatorDetailSchema,
    trend: IndicatorDetailSchema,
    support: IndicatorDetailSchema,
    resistance: IndicatorDetailSchema,
    momentum: IndicatorDetailSchema,
  }),
  fundamentalSnapshot: z.object({
    pe: IndicatorDetailSchema.optional(),
    pb: IndicatorDetailSchema.optional(),
    roe: IndicatorDetailSchema.optional(),
    debtToEquity: IndicatorDetailSchema.optional(),
    revenueGrowth: IndicatorDetailSchema.optional(),
    netMargin: IndicatorDetailSchema.optional(),
    dividendYield: IndicatorDetailSchema.optional(),
  }),
});

export async function runAIAnalysis(
  quote: MarketQuote,
  technicals: TechnicalIndicators,
  fundamentals: FundamentalData | null
): Promise<AIAnalysisResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return getMockAnalysis(quote, technicals, fundamentals);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const prompt = buildPrompt(quote, technicals, fundamentals);

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: AnalysisSchema,
      prompt,
    });
    return object as AIAnalysisResult;
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? "");
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    console.warn(`[ai-analysis] Gemini error${isQuota ? " (quota exceeded)" : ""}, using technical mock`);
    return getMockAnalysis(quote, technicals, fundamentals);
  }
}

function buildPrompt(
  quote: MarketQuote,
  tech: TechnicalIndicators,
  fund: FundamentalData | null
): string {
  const fmt = (v: number) => `₹${v.toFixed(2)}`;
  return `You are RAIOS, an expert Indian stock market investment analyst specializing in NSE/BSE companies. Analyze the following stock and provide a comprehensive, EXPLAINABLE investment recommendation.

STOCK: ${quote.symbol} (${quote.name})
EXCHANGE: NSE/BSE (Indian Market)
CURRENT PRICE: ${fmt(quote.price)}
DAY CHANGE: ${quote.changePercent.toFixed(2)}%
52-WEEK RANGE: ${fmt(quote.fiftyTwoWeekLow)} – ${fmt(quote.fiftyTwoWeekHigh)}

TECHNICAL INDICATORS:
- RSI (14): ${tech.rsi.toFixed(2)} ${tech.rsi > 70 ? "(OVERBOUGHT)" : tech.rsi < 30 ? "(OVERSOLD)" : "(NEUTRAL)"}
- MACD: ${tech.macd.toFixed(4)} | Signal: ${tech.macdSignal.toFixed(4)} | Histogram: ${tech.macdHistogram.toFixed(4)}
- Stochastic K: ${tech.stochastic.toFixed(2)} | D: ${tech.stochasticSignal.toFixed(2)}
- SMA 50: ${fmt(tech.sma50)} | SMA 200: ${fmt(tech.sma200)}
- Trend: ${tech.trend}
- Support: ${fmt(tech.support)} | Resistance: ${fmt(tech.resistance)}

${fund ? `FUNDAMENTAL DATA:
- P/E Ratio: ${fund.pe?.toFixed(2) ?? "N/A"}
- P/B Ratio: ${fund.priceToBook?.toFixed(2) ?? "N/A"}
- EPS: ${fund.eps ? fmt(fund.eps) : "N/A"}
- ROE: ${fund.roe ? (fund.roe * 100).toFixed(1) + "%" : "N/A"}
- Debt/Equity: ${fund.debtToEquity?.toFixed(2) ?? "N/A"}
- Revenue Growth: ${fund.revenueGrowth ? (fund.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}
- Net Margin: ${fund.netMargin ? (fund.netMargin * 100).toFixed(1) + "%" : "N/A"}
- Dividend Yield: ${fund.dividendYield ? (fund.dividendYield * 100).toFixed(2) + "%" : "N/A"}
- Free Cash Flow: ${fund.freeCashFlow ? "₹" + (fund.freeCashFlow / 1e7).toFixed(2) + " Cr" : "N/A"}` : "FUNDAMENTAL DATA: Not available"}

Indian market context: SEBI regulations, FII/DII activity, RBI monetary policy, NSE/BSE listed.

Provide a COMPLETE EXPLAINABLE analysis with:
1. signal: BUY/ACCUMULATE/HOLD/REDUCE/SELL
2. confidence 0-100
3. investmentScore 0-10
4. 3-4 specific risks (India-market aware)
5. 2-4 bullish factors (specific to this stock/sector)
6. 2-4 bearish factors
7. entryZone (₹ price range)
8. stopLoss (₹ price)
9. targetPrice (12-month, ₹)
10. summary (2-3 sentences, professional)
11. recommendation (full sentence: "I recommend BUY because...")
12. reasoning (WHY this recommendation — explain the logic chain)
13. whyNow (WHY this is actionable at the current price and technical setup)
14. whatCouldInvalidate (what scenario would reverse this recommendation)
15. holdingPeriod (specific: "3-6 months", "12-18 months", etc.)
16. expectedReward (upside scenario with ₹ targets)
17. expectedRisk (downside scenario with ₹ targets)
18. technicalSnapshot: For EACH indicator (rsi, macd, stochastic, sma50, sma200, trend, support, resistance, momentum), provide:
    - value (the actual number formatted nicely)
    - interpretation (1 sentence: what this value means FOR THIS SPECIFIC STOCK right now)
    - signal (BULLISH/BEARISH/NEUTRAL)
19. fundamentalSnapshot: For each available fundamental, same format

Make the reasoning TRANSPARENT and EDUCATIONAL so the investor understands exactly why you reached this conclusion.
All prices in ₹. Be specific and data-driven.`;
}

function getMockAnalysis(
  quote: MarketQuote,
  tech: TechnicalIndicators,
  fund: FundamentalData | null
): AIAnalysisResult {
  const rsi = tech.rsi;
  const isBullish = tech.trend === "UPTREND" && rsi < 70 && tech.macd > tech.macdSignal;
  const isBearish = tech.trend === "DOWNTREND" || rsi > 75;

  const signal = isBullish ? "BUY" : isBearish ? "SELL" : "HOLD";
  const confidence = isBullish ? 72 : isBearish ? 68 : 55;
  const investmentScore = isBullish ? 7.2 : isBearish ? 3.8 : 5.5;

  const targetPrice = signal === "BUY"
    ? quote.price * 1.15
    : signal === "SELL"
    ? quote.price * 0.9
    : quote.price * 1.05;

  const stopLoss = signal === "BUY"
    ? Math.max(tech.support, quote.price * 0.92)
    : quote.price * 0.95;

  const fmt = (n: number) => `₹${n.toFixed(2)}`;

  const rsiSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = rsi < 40 ? "BULLISH" : rsi > 65 ? "BEARISH" : "NEUTRAL";
  const macdSignalVal: "BULLISH" | "BEARISH" | "NEUTRAL" = tech.macd > tech.macdSignal ? "BULLISH" : tech.macd < tech.macdSignal ? "BEARISH" : "NEUTRAL";
  const trendSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = tech.trend === "UPTREND" ? "BULLISH" : tech.trend === "DOWNTREND" ? "BEARISH" : "NEUTRAL";
  const sma50Signal: "BULLISH" | "BEARISH" | "NEUTRAL" = quote.price > tech.sma50 ? "BULLISH" : "BEARISH";
  const sma200Signal: "BULLISH" | "BEARISH" | "NEUTRAL" = quote.price > tech.sma200 ? "BULLISH" : "BEARISH";
  const stochSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = tech.stochastic < 30 ? "BULLISH" : tech.stochastic > 70 ? "BEARISH" : "NEUTRAL";

  return {
    signal,
    confidence,
    investmentScore,
    risks: [
      "Market volatility and global macroeconomic uncertainty",
      "Interest rate sensitivity affecting sector valuations",
      "Sector rotation risk — institutional money may exit",
    ],
    bullishFactors: tech.trend === "UPTREND"
      ? ["Price above SMA 50 and SMA 200 — strong long-term trend", "Positive MACD momentum", "Strong trend structure with higher highs"]
      : ["Technical oversold bounce potential", "Support level nearby providing floor"],
    bearishFactors: rsi > 60
      ? ["RSI approaching overbought territory — momentum may slow", "Resistance overhead limiting upside"]
      : ["Weak momentum — below key moving averages", "Trend not yet established"],
    entryZone: `${fmt(quote.price * 0.98)} – ${fmt(quote.price * 1.02)}`,
    stopLoss,
    targetPrice,
    summary: `${quote.symbol} is showing ${tech.trend.toLowerCase()} characteristics with RSI at ${rsi.toFixed(1)}. ${signal === "BUY" ? "Technical setup suggests potential upside." : signal === "SELL" ? "Current technicals indicate caution is warranted." : "Waiting for a clearer directional signal."} Add your Gemini API key in Settings for full AI-powered analysis.`,
    recommendation: `I recommend ${signal} ${quote.symbol} based on the current technical setup and momentum indicators.`,
    reasoning: `The ${tech.trend.toLowerCase()} trend combined with RSI at ${rsi.toFixed(1)} ${rsi < 50 ? "shows room for upside" : "suggests the stock needs to consolidate"}. MACD ${tech.macd > tech.macdSignal ? "bullish crossover confirms" : "bearish crossover warns of"} the current momentum direction.`,
    whyNow: `Current price of ${fmt(quote.price)} is ${quote.price > tech.sma50 ? "above SMA 50, maintaining the uptrend" : "below SMA 50, which needs to be reclaimed for a trend reversal"}.`,
    whatCouldInvalidate: `A close below ${fmt(tech.support)} on volume would invalidate this recommendation. Also watch for RBI rate changes and FII outflows.`,
    holdingPeriod: signal === "BUY" ? "3-6 months" : signal === "SELL" ? "Exit within 2-4 weeks" : "Review in 4-6 weeks",
    expectedReward: `Target: ${fmt(targetPrice)} (+${(((targetPrice / quote.price) - 1) * 100).toFixed(1)}%)`,
    expectedRisk: `Stop Loss: ${fmt(stopLoss)} (${(((stopLoss / quote.price) - 1) * 100).toFixed(1)}%)`,
    technicalSnapshot: {
      rsi: {
        name: "RSI (14)",
        value: `${rsi.toFixed(1)}`,
        interpretation: `RSI at ${rsi.toFixed(1)} indicates ${rsi > 70 ? "overbought conditions — potential for pullback" : rsi < 30 ? "oversold conditions — potential for bounce" : "neutral momentum with room to move either direction"}.`,
        signal: rsiSignal,
      },
      macd: {
        name: "MACD",
        value: `${tech.macd.toFixed(3)} (Hist: ${tech.macdHistogram.toFixed(3)})`,
        interpretation: `MACD ${tech.macd > tech.macdSignal ? "above signal line — bullish momentum active" : "below signal line — bearish pressure present"}.`,
        signal: macdSignalVal,
      },
      stochastic: {
        name: "Stochastic",
        value: `K: ${tech.stochastic.toFixed(1)}, D: ${tech.stochasticSignal.toFixed(1)}`,
        interpretation: `Stochastic at ${tech.stochastic.toFixed(1)} ${tech.stochastic < 30 ? "— deeply oversold, watch for reversal" : tech.stochastic > 70 ? "— overbought, momentum may slow" : "— in neutral zone"}.`,
        signal: stochSignal,
      },
      sma50: {
        name: "SMA 50",
        value: `${fmt(tech.sma50)}`,
        interpretation: `Price is ${quote.price > tech.sma50 ? "above" : "below"} SMA 50 at ${fmt(tech.sma50)} — ${quote.price > tech.sma50 ? "short-term bullish" : "short-term bearish"}.`,
        signal: sma50Signal,
      },
      sma200: {
        name: "SMA 200",
        value: `${fmt(tech.sma200)}`,
        interpretation: `Price is ${quote.price > tech.sma200 ? "above" : "below"} SMA 200 at ${fmt(tech.sma200)} — ${quote.price > tech.sma200 ? "long-term bullish trend intact" : "long-term downtrend requires caution"}.`,
        signal: sma200Signal,
      },
      trend: {
        name: "Trend",
        value: tech.trend,
        interpretation: `${tech.trend === "UPTREND" ? "Golden cross pattern — SMA 50 above SMA 200, confirming long-term bullish structure" : tech.trend === "DOWNTREND" ? "Death cross pattern — SMA 50 below SMA 200, confirming long-term bearish structure" : "Moving averages converging — no clear directional trend, watch for breakout"}.`,
        signal: trendSignal,
      },
      support: {
        name: "Support",
        value: fmt(tech.support),
        interpretation: `Key support at ${fmt(tech.support)} — this is the recent 20-bar low. A break below this level increases downside risk significantly.`,
        signal: (quote.price > tech.support * 1.05 ? "BULLISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      },
      resistance: {
        name: "Resistance",
        value: fmt(tech.resistance),
        interpretation: `Key resistance at ${fmt(tech.resistance)} — this is the recent 20-bar high. A sustained break above this level would confirm the next leg up.`,
        signal: (quote.price > tech.resistance * 0.97 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      },
      momentum: {
        name: "Day Momentum",
        value: `${quote.changePercent.toFixed(2)}% today`,
        interpretation: `Day momentum at ${quote.changePercent.toFixed(2)}% ${quote.changePercent > 1 ? "shows strong buying interest" : quote.changePercent < -1 ? "shows distribution pressure" : "is relatively flat with no directional conviction"}.`,
        signal: (quote.changePercent > 0.5 ? "BULLISH" : quote.changePercent < -0.5 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      },
    },
    fundamentalSnapshot: fund ? {
      pe: fund.pe !== undefined ? {
        name: "P/E Ratio",
        value: fund.pe.toFixed(2) + "x",
        interpretation: `P/E of ${fund.pe.toFixed(1)}x ${fund.pe < 20 ? "is attractive relative to market — value zone" : fund.pe > 50 ? "is expensive — already pricing in high growth" : "is in fair value range for Indian mid/large caps"}.`,
        signal: (fund.pe < 20 ? "BULLISH" : fund.pe > 50 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      pb: fund.priceToBook !== undefined ? {
        name: "P/B Ratio",
        value: fund.priceToBook.toFixed(2) + "x",
        interpretation: `P/B of ${fund.priceToBook.toFixed(2)}x ${fund.priceToBook < 2 ? "suggests the stock trades near book value — downside limited" : fund.priceToBook > 8 ? "suggests premium valuation backed by strong ROE expectations" : "is in the normal range for quality Indian companies"}.`,
        signal: (fund.priceToBook < 2 ? "BULLISH" : fund.priceToBook > 10 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      roe: fund.roe !== undefined ? {
        name: "ROE",
        value: (fund.roe * 100).toFixed(1) + "%",
        interpretation: `ROE of ${(fund.roe * 100).toFixed(1)}% ${fund.roe > 0.2 ? "is excellent — company creates strong shareholder value" : fund.roe > 0.12 ? "is acceptable for Indian market standards" : "is below-average — capital efficiency needs improvement"}.`,
        signal: (fund.roe > 0.18 ? "BULLISH" : fund.roe < 0.10 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      debtToEquity: fund.debtToEquity !== undefined ? {
        name: "Debt/Equity",
        value: fund.debtToEquity.toFixed(2) + "x",
        interpretation: `Debt/Equity of ${fund.debtToEquity.toFixed(2)}x ${fund.debtToEquity < 0.5 ? "— very low leverage, strong balance sheet" : fund.debtToEquity > 2 ? "— high leverage, watch for interest coverage" : "— moderate leverage, manageable for the sector"}.`,
        signal: (fund.debtToEquity < 0.5 ? "BULLISH" : fund.debtToEquity > 2 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      revenueGrowth: fund.revenueGrowth !== undefined ? {
        name: "Revenue Growth",
        value: (fund.revenueGrowth * 100).toFixed(1) + "% YoY",
        interpretation: `Revenue growth of ${(fund.revenueGrowth * 100).toFixed(1)}% ${fund.revenueGrowth > 0.20 ? "is exceptional — strong business momentum" : fund.revenueGrowth > 0.10 ? "is healthy for a mature Indian company" : fund.revenueGrowth > 0 ? "is slow but positive" : "is negative — business facing headwinds"}.`,
        signal: (fund.revenueGrowth > 0.15 ? "BULLISH" : fund.revenueGrowth < 0 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      netMargin: fund.netMargin !== undefined ? {
        name: "Net Margin",
        value: (fund.netMargin * 100).toFixed(1) + "%",
        interpretation: `Net margin of ${(fund.netMargin * 100).toFixed(1)}% ${fund.netMargin > 0.15 ? "— excellent profitability, pricing power evident" : fund.netMargin > 0.08 ? "— decent margins for Indian market" : "— thin margins, vulnerable to cost pressures"}.`,
        signal: (fund.netMargin > 0.15 ? "BULLISH" : fund.netMargin < 0.05 ? "BEARISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
      dividendYield: fund.dividendYield !== undefined && fund.dividendYield > 0 ? {
        name: "Dividend Yield",
        value: (fund.dividendYield * 100).toFixed(2) + "%",
        interpretation: `Dividend yield of ${(fund.dividendYield * 100).toFixed(2)}% ${fund.dividendYield > 0.03 ? "provides a solid income floor, reducing downside risk" : "is low — primarily a capital appreciation story"}.`,
        signal: (fund.dividendYield > 0.025 ? "BULLISH" : "NEUTRAL") as "BULLISH" | "BEARISH" | "NEUTRAL",
      } : undefined,
    } : {},
  };
}
