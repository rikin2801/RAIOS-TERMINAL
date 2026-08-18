import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { AIAnalysisResult, TechnicalIndicators, FundamentalData, MarketQuote, EntryScreenStep1, EntryScreenStep2, EntryScreenStep3 } from "@/types";
import type { NewsItem } from "@/lib/news";
import { formatNewsForPrompt } from "@/lib/news";
import type { MultiTimeframeTrend } from "@/lib/trend-engine";

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
  fundamentals: FundamentalData | null,
  news?: NewsItem[]
): Promise<AIAnalysisResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return getMockAnalysis(quote, technicals, fundamentals);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const prompt = buildPrompt(quote, technicals, fundamentals, news);

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
  fund: FundamentalData | null,
  news?: NewsItem[]
): string {
  const fmt = (v: number) => `₹${v.toFixed(2)}`;
  const hasNews = news && news.length > 0;
  const newsSection = hasNews
    ? `
RECENT NEWS (last 7 days) — ${news!.length} headlines:
${formatNewsForPrompt(news!)}

NEWS IMPACT ANALYSIS — YOU MUST DO THIS BEFORE GIVING ANY RECOMMENDATION:
For each headline above, determine:
1. IMPACT: Is this POSITIVE, NEGATIVE, or NEUTRAL for ${quote.symbol}?
2. FUNDAMENTAL CHAIN: News → Business Effect → Financial Effect → Stock Price Effect
   Example: "Govt raises import duty" → Higher input costs → Margin compression → Lower EPS forecast → Bearish
   Example: "Company wins ₹500 Cr order" → Higher revenue → Better earnings visibility → Price re-rating → Bullish
3. CATALYST: Does this create a near-term event risk? (earnings, policy change, regulatory action, election, rate decision)
4. URGENCY: Does this news make acting NOW important vs. waiting?

Then factor news into your analysis:
- Cite specific headlines in bullishFactors or bearishFactors
- Add news-driven risks to the risks list (upcoming results, regulatory uncertainty, macro events)
- In whyNow: explain if a news catalyst makes this time-sensitive
- Confidence: INCREASE if news CONFIRMS the technical signal. DECREASE if news CONTRADICTS it or creates major uncertainty
- whatCouldInvalidate: include any news-driven scenarios that would flip the thesis
`
    : "\nRECENT NEWS: No news data available — analysis based on technicals and fundamentals only.\n";

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
${newsSection}
Indian market context: SEBI regulations, FII/DII activity, RBI monetary policy, NSE/BSE listed.

Provide a COMPLETE EXPLAINABLE analysis with:
1. signal: BUY/ACCUMULATE/HOLD/REDUCE/SELL
2. confidence 0-100 (adjust based on whether news confirms or contradicts technicals)
3. investmentScore 0-10
4. 3-4 specific risks (India-market aware; include news-driven risks if applicable)
5. 2-4 bullish factors (cite specific news headlines if they support the bull case)
6. 2-4 bearish factors (cite specific news headlines if they support the bear case)
7. entryZone (₹ price range)
8. stopLoss (₹ price)
9. targetPrice (12-month, ₹)
10. summary (2-3 sentences; mention key news catalyst if any)
11. recommendation (full sentence: "I recommend BUY because...")
12. reasoning (WHY this recommendation — explain the full logic chain: technicals + fundamentals + news combined)
13. whyNow (WHY this is actionable NOW — is there a news catalyst creating urgency or a time window?)
14. whatCouldInvalidate (what scenario would reverse this; include news-driven scenarios)
15. holdingPeriod (specific: "3-6 months", "12-18 months", etc.)
16. expectedReward (upside scenario with ₹ targets)
17. expectedRisk (downside scenario with ₹ targets)
18. technicalSnapshot: For EACH indicator (rsi, macd, stochastic, sma50, sma200, trend, support, resistance, momentum), provide:
    - value (the actual number formatted nicely)
    - interpretation (1 sentence: what this value means FOR THIS SPECIFIC STOCK right now)
    - signal (BULLISH/BEARISH/NEUTRAL)
19. fundamentalSnapshot: For each available fundamental, same format

Make the reasoning TRANSPARENT and EDUCATIONAL so the investor understands exactly why you reached this conclusion.
All prices in ₹. Be specific and data-driven. When news is present, your analysis MUST reference the most impactful headlines by name.`;
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

// ── Phase 1 Decision Engine ───────────────────────────────────────────────────

const Phase1GeminiSchema = z.object({
  decision: z.enum(["BUY", "WAIT", "HOLD", "BOOK_PROFITS", "SELL"]),
  whatChanged: z.string(),
  whyDecision: z.array(z.string()).max(5),
  whatWouldChange: z.array(z.string()).max(3),
  targets: z.object({
    oneMonth: z.object({ low: z.number(), high: z.number() }),
    threeMonths: z.object({ low: z.number(), high: z.number() }),
    sixMonths: z.object({ low: z.number(), high: z.number() }),
    oneYear: z.object({ low: z.number(), high: z.number() }),
  }),
});

export type Phase1GeminiOutput = z.infer<typeof Phase1GeminiSchema>;

function buildPhase1Prompt(params: {
  quote: MarketQuote;
  trend: MultiTimeframeTrend;
  businessHealth: "STRONG" | "STABLE" | "WEAK";
  businessSummary: string;
  priceAttractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE";
  priceSummary: string;
  analystTarget: number | null;
  analystCount: number | null;
  analystConsensus: string | null;
  news: NewsItem[];
  dailyRSI?: number;
  dailyStochK?: number;
}): string {
  const {
    quote, trend, businessHealth, businessSummary,
    priceAttractiveness, priceSummary,
    analystTarget, analystCount, analystConsensus, news,
    dailyRSI, dailyStochK,
  } = params;

  const fmt = (n: number) => `₹${n.toFixed(0)}`;
  const trendLabel = (t: { trend: string; evidence: string }) =>
    `${t.trend} — ${t.evidence}`;

  const analystSection = analystTarget
    ? `Analyst consensus: ${analystCount ?? "?"} analysts, avg target ${fmt(analystTarget)}` +
      (analystConsensus ? `, recommendation: ${analystConsensus.replace("_", " ").toUpperCase()}` : "")
    : "Analyst data: unavailable";

  const newsSection = news.length > 0
    ? `Recent news (${news.length} headlines):\n` +
      news.slice(0, 8).map((n, i) => `${i + 1}. "${n.title}" [${n.source}]`).join("\n")
    : "Recent news: No headlines available";

  return `You are RAIOS, an expert Indian stock market analyst using the RAIOS Phase 1 Decision Framework.

STOCK: ${quote.symbol} (${quote.name})
EXCHANGE: NSE/BSE · PRICE: ${fmt(quote.price)} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)
52-WEEK RANGE: ${fmt(quote.fiftyTwoWeekLow)} – ${fmt(quote.fiftyTwoWeekHigh)}

═══ Q1. TREND (HH/HL Analysis) ═══
· 1Y: ${trendLabel(trend.oneYear)}
· 6M: ${trendLabel(trend.sixMonths)}
· 3M: ${trendLabel(trend.threeMonths)}
· 1M: ${trendLabel(trend.oneMonth)}
· Primary trend: ${trend.primary}

═══ Q2. BUSINESS HEALTH ═══
Status: ${businessHealth}
${businessSummary}

═══ Q3. PRICE ATTRACTIVENESS ═══
Status: ${priceAttractiveness}
${priceSummary}
${analystSection}

═══ Q4. WHAT HAS CHANGED? ═══
${newsSection}

═══ Q5. TECHNICAL MOMENTUM (context only — not a primary decision driver) ═══
· Daily RSI (14): ${dailyRSI !== undefined ? dailyRSI.toFixed(1) : "N/A"}${dailyRSI !== undefined && dailyRSI > 70 ? " — OVERBOUGHT" : dailyRSI !== undefined && dailyRSI < 30 ? " — OVERSOLD" : ""}
· Daily Stochastic %K: ${dailyStochK !== undefined ? dailyStochK.toFixed(1) : "N/A"}${dailyStochK !== undefined && dailyStochK > 80 ? " — OVERBOUGHT" : dailyStochK !== undefined && dailyStochK < 20 ? " — OVERSOLD" : ""}

═══ YOUR TASK ═══
Using the 4-question framework above, provide:

1. DECISION: BUY / WAIT / HOLD / BOOK_PROFITS / SELL
   · BUY = trend intact, business healthy, price attractive — enter now
   · WAIT = setup forming but entry not ideal — be specific what to wait for
   · HOLD = already invested — maintain, no new buying needed
   · BOOK_PROFITS = price has run significantly — take partial or full profits
   · SELL = fundamental deterioration or trend broken — exit position

   OVERRIDE RULE — if Daily RSI > 70 AND Daily Stochastic > 80 simultaneously:
   · Do NOT choose BUY — the stock is in an overbought short-term state
   · Use WAIT (if not yet invested) or HOLD (if already invested) instead
   · You may still note that the long-term thesis is intact, but immediate buying is not recommended

2. WHAT CHANGED (1-2 sentences): What is the single most important development since 3 months ago?

3. WHY THIS DECISION (max 5 bullet points): Cite trend structure, business momentum, valuation, and news catalysts.
   DO NOT cite RSI, MACD, or Stochastic as reasons — those are supporting context only.

4. WHAT WOULD CHANGE THIS (max 3 conditions): Specific price levels or business events that would flip the recommendation.

5. PRICE TARGET RANGES (not point estimates — always a range):
   · 1 Month, 3 Months, 6 Months, 1 Year
   · Base on: trend extension, analyst consensus target, business trajectory
   · DO NOT use fixed % formulas. Use actual price levels.
   · All prices in ₹ (no decimals needed)

RULES:
- No avgCost, no stopLoss — those are not part of Phase 1
- No single-number targets — always a low/high range
- All prices in ₹`;
}

function getPhase1Fallback(params: {
  price: number;
  trend: MultiTimeframeTrend;
  businessHealth: "STRONG" | "STABLE" | "WEAK";
  priceAttractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE";
  analystTarget: number | null;
  dailyRSI?: number;
  dailyStochK?: number;
}): Phase1GeminiOutput {
  const { price, trend, businessHealth, priceAttractiveness, analystTarget, dailyRSI, dailyStochK } = params;
  const isOverbought = (dailyRSI ?? 0) > 70 && (dailyStochK ?? 0) > 80;

  let decision: Phase1GeminiOutput["decision"];
  if (trend.primary === "UPTREND" && businessHealth !== "WEAK" && priceAttractiveness !== "EXPENSIVE" && !isOverbought) {
    decision = "BUY";
  } else if (trend.primary === "UPTREND" && (priceAttractiveness === "EXPENSIVE" || isOverbought)) {
    decision = "WAIT";
  } else if (trend.primary === "DOWNTREND" && businessHealth === "WEAK") {
    decision = "SELL";
  } else if (trend.primary === "DOWNTREND") {
    decision = "WAIT";
  } else {
    decision = "HOLD";
  }

  const base = analystTarget ?? price * 1.10;
  const r = (n: number) => Math.round(n);
  return {
    decision,
    whatChanged: "Analysis computed from price structure (AI unavailable)",
    whyDecision: [
      `${trend.primary} — primary trend based on HH/HL analysis across 1Y/3M timeframes`,
      `Business health: ${businessHealth}`,
      `Price attractiveness: ${priceAttractiveness}`,
    ],
    whatWouldChange: [
      `Primary trend structure breaks — ${trend.primary === "UPTREND" ? "lower low below recent support" : "recovery above recent resistance"}`,
      `Material change in business fundamentals`,
    ],
    targets: {
      oneMonth: { low: r(price * 0.97), high: r(Math.min(base, price * 1.05)) },
      threeMonths: { low: r(price * 0.95), high: r(Math.min(base, price * 1.12)) },
      sixMonths: { low: r(price * 0.92), high: r(Math.min(base, price * 1.20)) },
      oneYear: { low: r(price * 0.88), high: r(base * 1.05) },
    },
  };
}

export async function runPhase1Analysis(params: {
  quote: MarketQuote;
  trend: MultiTimeframeTrend;
  businessHealth: "STRONG" | "STABLE" | "WEAK";
  businessSummary: string;
  priceAttractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE";
  priceSummary: string;
  analystTarget: number | null;
  analystCount: number | null;
  analystConsensus: string | null;
  news: NewsItem[];
  dailyRSI?: number;
  dailyStochK?: number;
}): Promise<Phase1GeminiOutput> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return getPhase1Fallback({ price: params.quote.price, trend: params.trend, businessHealth: params.businessHealth, priceAttractiveness: params.priceAttractiveness, analystTarget: params.analystTarget, dailyRSI: params.dailyRSI, dailyStochK: params.dailyStochK });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const prompt = buildPhase1Prompt(params);

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: Phase1GeminiSchema,
      prompt,
    });
    // Safety net: if RSI and Stoch are both overbought, downgrade BUY → WAIT
    if (object.decision === "BUY" && (params.dailyRSI ?? 0) > 70 && (params.dailyStochK ?? 0) > 80) {
      return {
        ...object,
        decision: "WAIT",
        whyDecision: [
          ...object.whyDecision,
          `Daily RSI at ${params.dailyRSI?.toFixed(1)} and Stochastic at ${params.dailyStochK?.toFixed(1)} are both overbought — wait for indicators to cool before entering`,
        ],
      };
    }
    return object;
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? "");
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    console.warn(`[phase1] Gemini error${isQuota ? " (quota)" : ""}, using fallback`);
    return getPhase1Fallback({ price: params.quote.price, trend: params.trend, businessHealth: params.businessHealth, priceAttractiveness: params.priceAttractiveness, analystTarget: params.analystTarget, dailyRSI: params.dailyRSI, dailyStochK: params.dailyStochK });
  }
}

// ── Entry Screen Analysis ─────────────────────────────────────────────────────

const EntryScreenGeminiSchema = z.object({
  assessment:      z.enum(["ENTRY_CONFIRMED", "DEVELOPING", "NO_ENTRY"]),
  entryPrice:      z.number().nullable(),
  entryRangeHigh:  z.number().nullable(),
  entryBasis:      z.string(),
  stopLoss:        z.number().nullable(),
  stopBasis:       z.string(),
  target:          z.number().nullable(),
  targetBasis:     z.string(),
  bbSummary:       z.string(),
  rsiSummary:      z.string(),
  stochSummary:    z.string(),
  emaSummary:      z.string(),
  priceActionSummary: z.string(),
  why:             z.array(z.string()).min(1).max(5),
});

function buildEntryScreenPrompt(params: {
  symbol: string; name: string; price: number;
  step1: EntryScreenStep1; step2: EntryScreenStep2; step3: EntryScreenStep3;
}): string {
  const { symbol, name, price, step1, step2, step3 } = params;
  const s2 = step2;
  const hourly = s2.hourly;

  const trendLabel = step1.weeklyTrend === "UP" ? "UP / BULLISH" : step1.weeklyTrend === "DOWN" ? "DOWN / BEARISH" : "SIDEWAYS / UNCLEAR";
  const bbLine = s2.bb
    ? `Upper ₹${s2.bb.upper.toFixed(0)} | Middle ₹${s2.bb.middle.toFixed(0)} | Lower ₹${s2.bb.lower.toFixed(0)} | Bands turning: ${s2.bb.direction}`
    : "DATA NOT AVAILABLE";
  const hourlyLine = hourly
    ? `RSI: ${hourly.rsi.toFixed(1)} | Stoch crossover: ${hourly.stochCrossover} | Stoch zone: ${hourly.stochZone} | MACD crossover: ${hourly.macdCrossover} | Aligns with daily: ${hourly.aligns ? "YES" : "NO"} | ${hourly.note}`
    : "Hourly data: not available";

  return `You are RAIOS Entry Point Analyzer. Analyze ${symbol} (${name}) for a technical entry point.

CRITICAL RULES — READ BEFORE ANSWERING:
1. All numbers below are server-computed from real price data. Do NOT invent or change any price, RSI, MACD, EMA, or Stochastic value.
2. Entry, stop-loss, and target MUST be derived from the support/resistance/EMA levels provided — NOT from fixed percentage formulas.
3. If the setup is inconclusive, say DEVELOPING or NO_ENTRY. Do NOT force an entry.
4. Write summaries in plain English — no jargon, as if talking to an experienced retail investor.

CURRENT PRICE: ₹${price.toFixed(0)}

━━━ STEP 1 — WEEKLY CHART ━━━
Weekly trend:   ${trendLabel}
Evidence:       ${step1.weeklyTrendEvidence}
Weekly MACD:    ${step1.macdCrossover} | Histogram: ${step1.macdHist >= 0 ? "+" : ""}${step1.macdHist.toFixed(3)} | Zone: ${step1.macdZone}
Weekly Support: ₹${step1.support.toFixed(0)}
Weekly Resistance: ₹${step1.resistance.toFixed(0)}

━━━ STEP 2 — DAILY (LOWER TIMEFRAME) ━━━
Bollinger Bands: ${bbLine}
RSI (daily):     ${s2.rsi.currentRSI.toFixed(1)} | Key level: ${s2.rsi.nearestLevel} | Behavior: ${s2.rsi.action} | Reversal direction: ${s2.rsi.reversalDir}
Stochastic:      K=${s2.stochastic.k.toFixed(1)}, D=${s2.stochastic.d.toFixed(1)} | Crossover: ${s2.stochastic.crossover} | Zone: ${s2.stochastic.zone}
EMA Support:     EMA50=₹${s2.ema.ema50.toFixed(0)}, EMA100=₹${s2.ema.ema100.toFixed(0)}, EMA200=₹${s2.ema.ema200.toFixed(0)} | Status: ${s2.ema.status}
EMA description: ${s2.ema.description}

HOURLY CONFIRMATION: ${hourlyLine}

━━━ STEP 3 — PRICE ACTION (DAILY CANDLES) ━━━
Last candle pattern: ${step3.pattern}
Direction:           ${step3.direction}
Description:         ${step3.description}

━━━ YOUR OUTPUT ━━━
1. ASSESSMENT: ENTRY_CONFIRMED / DEVELOPING / NO_ENTRY
   · ENTRY_CONFIRMED = weekly trend, daily indicators, AND price action all point the same direction with no major contradiction
   · DEVELOPING = most signals align but at least one key confirmation is missing — be specific what needs to happen
   · NO_ENTRY = signals are clearly conflicting or the setup is unfavorable

2. ENTRY RANGE: This is a LIMIT ORDER zone — a range where a trader would place buy orders in advance.
   - entryPrice (low) = meaningful support level (weekly support, key EMA, or BB lower band)
   - entryRangeHigh (high) = 2–4% ABOVE entryPrice, and ALWAYS at least 1% BELOW current price
   - Minimum width: entryRangeHigh must be at least 1% higher than entryPrice
   - Never set entryRangeHigh equal to the current price or above it
   - Return null for both if NO_ENTRY

3. STOP-LOSS: The technical level where this setup is invalidated (e.g. break below weekly support, break below EMA200). Use the actual level from above. Must be BELOW entryPrice. Return null if NO_ENTRY.

4. TARGET: The nearest meaningful resistance or technical target from the levels above. Must be at least 5% above entryRangeHigh for a worthwhile risk-reward. Return null if NO_ENTRY.

5. SUMMARIES: One clear sentence each for BB, RSI, Stochastic, EMA, and price action — explain what each is showing specifically for this stock right now.

6. WHY: Maximum 5 lines. Answer: "Is this a good technical entry NOW?" Use specific levels from above, not generic statements.`;
}

function getEntryScreenFallback(params: {
  price: number; step1: EntryScreenStep1; step2: EntryScreenStep2; step3: EntryScreenStep3;
}): z.infer<typeof EntryScreenGeminiSchema> {
  const { price, step1, step2, step3 } = params;
  const s2 = step2;

  let bullScore = 0;
  let bearScore = 0;

  if (step1.weeklyTrend === "UP") bullScore += 2;
  else if (step1.weeklyTrend === "DOWN") bearScore += 2;

  if (step1.macdCrossover === "PCO") bullScore += 1;
  else if (step1.macdCrossover === "NCO") bearScore += 1;

  if (s2.rsi.reversalDir === "UP" || s2.rsi.action === "SUPPORT") bullScore += 1;
  else if (s2.rsi.reversalDir === "DOWN" || s2.rsi.action === "RESISTANCE") bearScore += 1;

  if (s2.stochastic.crossover === "PCO") bullScore += 1;
  else if (s2.stochastic.crossover === "NCO") bearScore += 1;

  if (s2.ema.status === "ABOVE_ALL" || s2.ema.status === "HOLDING_50") bullScore += 1;
  else if (s2.ema.status === "BELOW_ALL") bearScore += 1;

  if (step3.direction === "BULLISH") bullScore += 1;
  else if (step3.direction === "BEARISH") bearScore += 1;

  const net = bullScore - bearScore;
  let assessment: "ENTRY_CONFIRMED" | "DEVELOPING" | "NO_ENTRY";
  if (net >= 4) assessment = "ENTRY_CONFIRMED";
  else if (net >= 2) assessment = "DEVELOPING";
  else assessment = "NO_ENTRY";

  const hasEntry = assessment !== "NO_ENTRY";
  const ema50 = s2.ema.ema50;
  const support = step1.support;
  const resistance = step1.resistance;

  // Entry zone: limit-order area at or near the support level.
  // Low = support; High = whichever is lower of (EMA50 if it's between support and price, else support + 2%).
  // Always cap below current price so the zone represents a buy-on-pullback range.
  let entryLow: number | null = null;
  let entryHigh: number | null = null;
  if (hasEntry) {
    entryLow = Math.round(support);
    const ema50Candidate = ema50 > 0 && ema50 > support && ema50 < price * 0.99 ? ema50 : support * 1.02;
    entryHigh = Math.round(Math.min(ema50Candidate, price * 0.99));
    // Ensure the zone has at least a small spread (step ≈ 1%)
    if (entryHigh <= entryLow) entryHigh = Math.round(entryLow * 1.01);
  }

  return {
    assessment,
    entryPrice: entryLow,
    entryRangeHigh: entryHigh,
    entryBasis: hasEntry ? `Near key support ₹${support.toFixed(0)} / EMA zone` : "Setup not confirmed",
    stopLoss: hasEntry ? Math.round(support * 0.985) : null,
    stopBasis: hasEntry ? `Below weekly support ₹${support.toFixed(0)} — invalidates the setup` : "—",
    target: hasEntry ? Math.round(resistance) : null,
    targetBasis: hasEntry ? `Immediate weekly resistance ₹${resistance.toFixed(0)}` : "—",
    bbSummary: s2.bb ? `Bollinger Bands are turning ${s2.bb.direction.toLowerCase()} — price is ${price > s2.bb.upper ? "above upper band (extended)" : price < s2.bb.lower ? "below lower band (potential reversal)" : "within the bands"}` : "Bollinger Band data not available",
    rsiSummary: s2.rsi.description,
    stochSummary: `Stochastic K=${s2.stochastic.k.toFixed(1)}, D=${s2.stochastic.d.toFixed(1)} — ${s2.stochastic.crossover !== "NONE" ? s2.stochastic.crossover + " in " + s2.stochastic.zone.toLowerCase() + " zone" : "no crossover — " + s2.stochastic.zone.toLowerCase() + " zone"}`,
    emaSummary: s2.ema.description,
    priceActionSummary: step3.description,
    why: [
      `Weekly trend is ${step1.weeklyTrend} — ${step1.weeklyTrendEvidence}`,
      `Daily RSI at ${s2.rsi.currentRSI.toFixed(1)}: ${s2.rsi.description}`,
      `Stochastic ${s2.stochastic.crossover !== "NONE" ? s2.stochastic.crossover : "no crossover"} from ${s2.stochastic.zone.toLowerCase()} zone`,
      `Price ${s2.ema.status.toLowerCase().replace("_", " ")} — ${s2.ema.description}`,
      `Price action: ${step3.pattern} (${step3.direction.toLowerCase()})`,
    ].slice(0, 5),
  };
}

export async function runEntryScreenAnalysis(params: {
  symbol: string; name: string; price: number;
  step1: EntryScreenStep1; step2: EntryScreenStep2; step3: EntryScreenStep3;
}): Promise<z.infer<typeof EntryScreenGeminiSchema>> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return getEntryScreenFallback(params);
  }
  const google = createGoogleGenerativeAI({ apiKey });
  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: EntryScreenGeminiSchema,
      prompt: buildEntryScreenPrompt(params),
    });
    return object;
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message ?? "");
    console.warn(`[entry-screen] Gemini error${msg.includes("429") ? " (quota)" : ""}, using fallback`);
    return getEntryScreenFallback(params);
  }
}

// ── Profit Booking Analysis ───────────────────────────────────────────────────

const ProfitBookingSchema = z.object({
  reasoning: z.array(z.string()).length(4),
  suggestedAction: z.string(),
});

function buildProfitBookingPrompt(params: {
  symbol: string;
  name: string;
  status: string;
  price: number;
  rsi: number;
  stochastic: number;
  macdHistogram: number;
  sma50: number;
  sma200: number;
  rangePosition: number;
  fiftyTwoWeekHigh: number;
}): string {
  const { symbol, name, status, price, rsi, stochastic, macdHistogram, sma50, sma200, rangePosition, fiftyTwoWeekHigh } = params;
  const aboveSMA50 = price > sma50;
  const aboveSMA200 = price > sma200;
  const isBooking = status !== "LET_PROFITS_RUN";

  return `You are helping an Indian retail investor decide whether to book profits on ${symbol} (${name}).

Current market data:
- Price: ₹${price.toFixed(2)} (52W High: ₹${fiftyTwoWeekHigh.toFixed(0)}, at ${rangePosition.toFixed(0)}% of yearly range)
- RSI 14-day: ${rsi.toFixed(1)} (>70 = extended, >80 = overbought)
- Stochastic %K: ${stochastic.toFixed(1)} (>80 = overbought)
- MACD Histogram: ${macdHistogram >= 0 ? "+" : ""}${macdHistogram.toFixed(3)} (positive = bullish momentum)
- SMA 50: ₹${sma50.toFixed(0)} — price is ${aboveSMA50 ? "ABOVE (bullish)" : "BELOW (bearish)"}
- SMA 200: ₹${sma200.toFixed(0)} — price is ${aboveSMA200 ? "ABOVE (bullish)" : "BELOW (bearish)"}
- Status determined: ${status}

Write exactly 4 points explaining ${isBooking ? "why the investor should consider booking profits" : "why they should continue holding and let profits run"}.
Rules:
- Plain English only — no technical jargon, no RSI/MACD abbreviations without explanation
- Each point is 1–2 sentences max
- Be specific to these exact numbers, not generic advice
- Conversational tone, like a knowledgeable friend talking to someone who wears glasses and wants clear readable text
- Do NOT give personalized investment advice — frame as "the data suggests" or "historically when..."

Also write one suggestedAction sentence (specific, e.g. "Consider booking 25–30% of your position to lock in gains while keeping exposure").`;
}

function getProfitBookingFallback(params: {
  status: string;
  rsi: number;
  stochastic: number;
  macdHistogram: number;
  rangePosition: number;
  price: number;
  sma50: number;
}): { reasoning: string[]; suggestedAction: string } {
  const { status, rsi, stochastic, macdHistogram, rangePosition, price, sma50 } = params;

  if (status === "LET_PROFITS_RUN") {
    return {
      reasoning: [
        `RSI at ${rsi.toFixed(1)} is in a healthy range — the stock has not yet entered the extended momentum zone where reversals become more likely.`,
        `Stochastic at ${stochastic.toFixed(1)} shows the stock is not yet overbought. There is room for the trend to continue before short-term traders start taking profits.`,
        macdHistogram > 0
          ? "MACD momentum is positive, confirming buyers are still in control and the upward move is supported by momentum."
          : "MACD momentum is neutral. There is no strong signal of a reversal yet.",
        `At ${rangePosition.toFixed(0)}% of its yearly range, the stock has not approached its 52-week high zone where heavy selling pressure typically appears.`,
      ],
      suggestedAction: "Continue holding your full position — no profit booking signal is active right now.",
    };
  }

  if (status === "WATCH") {
    return {
      reasoning: [
        `RSI at ${rsi.toFixed(1)} is entering the extended zone. The stock has rallied well and buyers are showing early signs of fatigue.`,
        `Stochastic at ${stochastic.toFixed(1)} is elevated, meaning the stock has been trading near the top of its recent price range for several days.`,
        macdHistogram > 0
          ? "MACD is still positive which is why this is a Watch and not an Alert — the underlying momentum is intact for now."
          : "MACD momentum is weakening, which adds to the case for monitoring this position closely.",
        `At ${rangePosition.toFixed(0)}% of its yearly range, the stock is approaching territory where more investors look to exit near yearly highs.`,
      ],
      suggestedAction: "Start monitoring closely — if RSI crosses 70 or Stochastic crosses 80, consider booking 20–25% of your position.",
    };
  }

  if (status === "ALERT") {
    return {
      reasoning: [
        `RSI at ${rsi.toFixed(1)} signals the stock is in overbought territory. Historically when RSI is this high, stocks tend to take a breather or pull back before the next leg up.`,
        `Stochastic at ${stochastic.toFixed(1)} — above 80 — means the stock is trading near the very top of its short-term price range. Short-term traders typically start selling here.`,
        `At ${rangePosition.toFixed(0)}% of its 52-week range, the stock is very close to its yearly high. This is a zone of heavy historical selling pressure.`,
        macdHistogram > 0
          ? "MACD momentum is still positive which means the trend has not fully broken — this is why partial booking (not full exit) is suggested."
          : "MACD momentum is weakening, adding further weight to the profit booking signal.",
      ],
      suggestedAction: "Consider booking 25–30% of your position to lock in gains. Keep the rest — if price holds above the SMA50, the trend may still have legs.",
    };
  }

  // EXIT
  return {
    reasoning: [
      `RSI at ${rsi.toFixed(1)} and Stochastic at ${stochastic.toFixed(1)} together signal an extremely overbought condition — both indicators are flashing caution at the same time.`,
      price < sma50
        ? "The stock has dropped below its 50-day average, which is a key warning signal that the short-term trend may have reversed."
        : `At ${rangePosition.toFixed(0)}% of its 52-week range, the stock is extremely close to its yearly high — a zone where the risk-reward for holding is unfavourable.`,
      macdHistogram < 0
        ? "MACD momentum has turned negative — sellers are now in control on a short-term basis."
        : "Even with positive MACD, the other signals are strong enough to warrant protecting your gains.",
      "When multiple indicators align like this, the data suggests it is prudent to protect a significant portion of your profits rather than risking giving them back.",
    ],
    suggestedAction: "Consider booking 40–50% of your position to significantly protect your gains, and review the remaining position if the price continues to weaken.",
  };
}

export async function runProfitBookingAnalysis(params: {
  symbol: string;
  name: string;
  status: string;
  price: number;
  rsi: number;
  stochastic: number;
  macdHistogram: number;
  sma50: number;
  sma200: number;
  rangePosition: number;
  fiftyTwoWeekHigh: number;
}): Promise<{ reasoning: string[]; suggestedAction: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return getProfitBookingFallback(params);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: ProfitBookingSchema,
      prompt: buildProfitBookingPrompt(params),
    });
    return object;
  } catch {
    console.warn("[profit-booking] Gemini error, using fallback");
    return getProfitBookingFallback(params);
  }
}
