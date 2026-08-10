import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { holdingWhere } from "@/lib/portfolio";
import { getQuote, getHoldingTechnicals } from "@/lib/market";
import type { HoldingTechnicals } from "@/lib/market";
import type { Exchange } from "@/lib/india";

// ── Schema ────────────────────────────────────────────────────────────────────

const TechSchema = z.object({
  dailyTrend:     z.enum(["Bullish", "Bearish", "Neutral"]),
  weeklyTrend:    z.enum(["Bullish", "Bearish", "Neutral"]),
  monthlyTrend:   z.enum(["Bullish", "Bearish", "Neutral"]),
  rsi:            z.number().min(0).max(100),
  macd:           z.enum(["Positive", "Negative", "Neutral"]),
  stochastic:     z.enum(["Strong", "Weak", "Neutral"]),
  aboveSma50:     z.boolean(),
  aboveSma200:    z.boolean(),
  volume:         z.enum(["Strong", "Weak", "Average"]),
  momentum:       z.enum(["Strong", "Weak", "Neutral"]),
  support:        z.number().optional(),
  resistance:     z.number().optional(),
});

const DecisionSchema = z.object({
  date: z.string(),
  portfolioHealthScore: z.number().min(0).max(100),
  marketContext: z.string(),
  marketSentiment: z.enum(["BULLISH", "NEUTRAL", "BEARISH"]),
  marketReasons: z.array(z.string()).max(4),

  attentionRequired: z.array(z.object({
    symbol: z.string(),
    action: z.enum(["SELL", "REDUCE_POSITION", "BOOK_PARTIAL_PROFITS"]),
    urgency: z.enum(["URGENT", "HIGH"]),
    reasons: z.array(z.string()).min(3).max(5),
    confidence: z.number().min(0).max(100),
  })).max(5),

  topOpportunity: z.object({
    symbol: z.string(),
    action: z.enum(["BUY", "ACCUMULATE"]),
    reasons: z.array(z.string()).min(3).max(5),
    confidence: z.number().min(0).max(100),
  }).nullable(),

  biggestRisk: z.object({
    symbol: z.string(),
    reasons: z.array(z.string()).min(2).max(4),
    confidence: z.number().min(0).max(100),
  }).nullable(),

  todayDecisions: z.array(z.object({
    symbol: z.string(),
    action: z.enum(["BUY", "ACCUMULATE", "HOLD", "BOOK_PARTIAL_PROFITS", "REDUCE_POSITION", "SELL", "AVOID", "WAIT_AND_WATCH"]),
    confidence: z.number().min(0).max(100),
    urgency: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]),
    reasons: z.array(z.string()).min(4).max(6),
    risks: z.array(z.string()).min(2).max(3),
    watchFor: z.array(z.string()).min(2).max(3),
    technical: TechSchema,
    finalVerdict: z.string(),
  })),
});

export type DecisionData = z.infer<typeof DecisionSchema>;
export type TechSnapshot = z.infer<typeof TechSchema>;

// ── Cache ─────────────────────────────────────────────────────────────────────

const _cache = new Map<string, { data: DecisionData; ts: number }>();
const TTL_MS = 5 * 60_000;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rawId       = req.nextUrl.searchParams.get("portfolioId");
  const portfolioId = rawId ?? "default";
  const apiKey      = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const quick       = req.nextUrl.searchParams.get("quick") === "1";
  const force       = req.nextUrl.searchParams.get("force") === "1";

  const where    = await holdingWhere(rawId);
  const holdings = await prisma.holding.findMany({ where });
  if (holdings.length === 0)
    return NextResponse.json({ error: "No holdings found." }, { status: 400 });

  // Fetch live quotes + technical snapshots in parallel
  const [quoteResults, techResults] = await Promise.all([
    Promise.allSettled(holdings.map(h => getQuote(h.symbol, (h.exchange as Exchange) ?? "NSE"))),
    Promise.allSettled(holdings.map(h => getHoldingTechnicals(h.symbol, (h.exchange as Exchange) ?? "NSE"))),
  ]);

  // Build enriched holdings
  const totalValue = holdings.reduce((s, h, i) => {
    const q = quoteResults[i].status === "fulfilled"
      ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value : null;
    return s + (q?.price ?? h.avgCost) * h.shares;
  }, 0);

  type Enriched = {
    symbol: string; name: string; sector: string | null; shares: number; avgCost: number;
    currentPrice: number; changePercent: number; weight: number;
    tech: HoldingTechnicals | null;
  };

  const enriched: Enriched[] = holdings.map((h, i) => {
    const q = quoteResults[i].status === "fulfilled"
      ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value : null;
    const t = techResults[i].status === "fulfilled"
      ? (techResults[i] as PromiseFulfilledResult<HoldingTechnicals | null>).value : null;
    const price = q?.price ?? h.avgCost;
    return {
      symbol: h.symbol, name: h.name, sector: h.sector, shares: h.shares, avgCost: h.avgCost,
      currentPrice: price,
      changePercent: q?.changePercent ?? 0,
      weight: totalValue > 0 ? (price * h.shares / totalValue) * 100 : 0,
      tech: t,
    };
  });

  const dayChange = enriched.reduce((s, h) => s + h.changePercent * h.currentPrice * h.shares, 0) / (totalValue || 1);

  if (quick || !apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json({ ...buildRuleBased(enriched, dayChange), source: "rule-based" });
  }

  const cached = _cache.get(portfolioId);
  if (!force && cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json({ ...cached.data, source: "ai-cached" });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const today  = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const holdingsBlock = enriched.map(h => {
    const t = h.tech;
    const techLine = t
      ? `Daily:${t.dailyTrend} | Weekly:${t.weeklyTrend} | Monthly:${t.monthlyTrend} | RSI:${t.rsi} | MACD:${t.macdLabel} | Stoch:${t.stochasticLabel} | Vol:${t.volumeLabel} | Momentum:${t.momentumLabel} | SMA50:${t.aboveSma50 ? "Above" : "Below"} | SMA200:${t.aboveSma200 ? "Above" : "Below"} | Support:₹${t.support} | Resistance:₹${t.resistance}`
      : "Technical data unavailable — use market knowledge";
    return `${h.symbol} (${h.sector ?? "Diversified"})
  Price: ₹${h.currentPrice.toFixed(0)} (${h.changePercent >= 0 ? "+" : ""}${h.changePercent.toFixed(2)}% today) | Weight: ${h.weight.toFixed(1)}%
  ${techLine}`;
  }).join("\n\n");

  const prompt = `You are RAIOS — a seasoned Indian equity Investment Manager with 25 years of experience managing institutional portfolios.

Today: ${today}
Portfolio: ₹${totalValue.toFixed(0)} total | ${enriched.length} stocks | Today: ${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)}%

CORE PHILOSOPHY — READ BEFORE EVERY DECISION:
1. Make decisions based on each stock's TECHNICAL MERIT — trend, momentum, RSI, MACD, volume.
2. NEVER base a decision on the user's purchase price or unrealised P&L.
3. A stock in a clear uptrend should be HOLD or ACCUMULATE regardless of whether the user is up or down.
4. A stock breaking down technically should be REDUCE or SELL regardless of the user's profit/loss.
5. Think and speak like a fund manager — give insight, not just data.
6. NEVER mention share quantities, capital amounts, or portfolio percentages in finalVerdict or reasons.

PORTFOLIO HOLDINGS WITH LIVE TECHNICAL DATA:
${holdingsBlock}

═══════════════════════════════════════════════
REQUIRED OUTPUT
═══════════════════════════════════════════════

FOR EACH HOLDING provide todayDecisions entry with:

ACTION: BUY / ACCUMULATE / HOLD / BOOK_PARTIAL_PROFITS / REDUCE_POSITION / SELL / AVOID / WAIT_AND_WATCH

CONFIDENCE: 0–100%

URGENCY: URGENT (act today) / HIGH (act this week) / MEDIUM (monitor) / LOW (no rush)

REASONS (4–6 bullets) — Write investment insights, not data recitation:
  ✓ "Both daily and weekly trends point firmly bullish — institutional accumulation is visible"
  ✓ "RSI at 58 shows healthy momentum with room to run — not yet overbought"
  ✓ "Stock holding above its 50-day moving average despite sector headwinds — showing relative strength"
  ✗ NEVER: "RSI is 58 and MACD is positive and price is above SMA50" — that's data, not insight

RISKS (2–3 bullets) — what could invalidate this view?

WATCH FOR (2–3 bullets) — specific signals to monitor

TECHNICAL — confirm or refine the pre-computed values

FINAL VERDICT (2–3 sentences) — Fund manager language:
  - What is this stock doing right now?
  - What should the investor do and why?
  - NO quantities, NO cost prices, NO portfolio %

ALSO PROVIDE:
- portfolioHealthScore (0–100) based on the technical strength across all holdings
- marketSentiment: BULLISH/NEUTRAL/BEARISH based on current Indian market conditions
- marketContext: 2-sentence summary of the market environment today
- marketReasons: 3–4 key drivers of current market direction
- attentionRequired: ONLY holdings needing URGENT or HIGH action (SELL/REDUCE/BOOK PROFITS)
- topOpportunity: the single best BUY/ACCUMULATE candidate in the portfolio today (null if none)
- biggestRisk: the holding most at risk of further decline technically (null if all healthy)`;

  try {
    const { object } = await generateObject({ model: google("gemini-2.5-flash"), schema: DecisionSchema, prompt });
    _cache.set(portfolioId, { data: object, ts: Date.now() });
    return NextResponse.json({ ...object, source: "ai" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/decision] Gemini error:", msg);
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const isAuth  = msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("UNAUTHENTICATED");
    const label   = isQuota ? "Gemini quota exceeded. Showing technical rule-based decisions — resets at midnight Pacific."
                  : isAuth  ? `Gemini API key rejected: ${msg}`
                  : `Gemini error: ${msg}`;
    return NextResponse.json({
      ...buildRuleBased(enriched, dayChange),
      source: "rule-based",
      aiError: label,
    }, { status: 200 });
  }
}

// ── Rule-based fallback (technical signals, no cost basis) ────────────────────

function techToSnapshot(t: HoldingTechnicals | null): TechSnapshot {
  if (!t) return {
    dailyTrend: "Neutral", weeklyTrend: "Neutral", monthlyTrend: "Neutral",
    rsi: 50, macd: "Neutral", stochastic: "Neutral",
    aboveSma50: true, aboveSma200: true, volume: "Average", momentum: "Neutral",
  };
  return {
    dailyTrend: t.dailyTrend, weeklyTrend: t.weeklyTrend, monthlyTrend: t.monthlyTrend,
    rsi: t.rsi, macd: t.macdLabel, stochastic: t.stochasticLabel,
    aboveSma50: t.aboveSma50, aboveSma200: t.aboveSma200,
    volume: t.volumeLabel, momentum: t.momentumLabel,
    support: t.support, resistance: t.resistance,
  };
}

type Enriched = {
  symbol: string; name: string; sector: string | null; shares: number; avgCost: number;
  currentPrice: number; changePercent: number; weight: number;
  tech: HoldingTechnicals | null;
};

function buildRuleBased(holdings: Enriched[], dayChange: number): DecisionData {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const todayDecisions = holdings.map(h => {
    const t = h.tech;

    // Score technical strength (0-10)
    let techScore = 5;
    if (t) {
      if (t.dailyTrend === "Bullish")   techScore += 1; else if (t.dailyTrend === "Bearish")   techScore -= 1;
      if (t.weeklyTrend === "Bullish")  techScore += 1; else if (t.weeklyTrend === "Bearish")  techScore -= 1;
      if (t.monthlyTrend === "Bullish") techScore += 1; else if (t.monthlyTrend === "Bearish") techScore -= 1;
      if (t.aboveSma50)                 techScore += 1; else                                    techScore -= 1;
      if (t.aboveSma200)                techScore += 1; else                                    techScore -= 1;
      if (t.rsi > 55)                   techScore += 0.5; else if (t.rsi < 40)                 techScore -= 1;
      if (t.macdLabel === "Positive")   techScore += 0.5; else if (t.macdLabel === "Negative") techScore -= 0.5;
      if (t.momentumLabel === "Strong") techScore += 0.5; else if (t.momentumLabel === "Weak") techScore -= 0.5;
    }

    type Action = DecisionData["todayDecisions"][0]["action"];
    type Urgency = DecisionData["todayDecisions"][0]["urgency"];
    let action: Action, urgency: Urgency, confidence: number;
    let reasons: string[], risks: string[], watchFor: string[], finalVerdict: string;

    if (t && t.dailyTrend === "Bearish" && t.weeklyTrend === "Bearish" && !t.aboveSma50) {
      // Technically broken down — SELL
      action = "SELL"; urgency = "HIGH"; confidence = 78;
      reasons = [
        "Daily and weekly trends both bearish — sellers in control across timeframes",
        `Price trading below its 50-day moving average — trend has turned negative`,
        t.rsi < 45 ? `RSI at ${t.rsi} is declining — momentum is not yet finding a floor` : `Momentum indicators weakening with no sign of reversal`,
        t.macdLabel === "Negative" ? "MACD showing negative crossover — distribution phase underway" : "Technical picture does not support holding this position",
        t.monthlyTrend === "Bearish" ? "Monthly trend is also bearish — this is not a short-term dip" : "Risk of further downside outweighs potential recovery",
      ];
      risks = [
        "Could be at the start of a deeper correction if support breaks",
        "Sector weakness may amplify the decline",
      ];
      watchFor = [
        `RSI recovering above 45 with volume — would signal possible reversal`,
        "Price closing back above 50-day SMA — re-evaluate hold thesis",
      ];
      finalVerdict = `The stock is in a confirmed downtrend across daily and weekly timeframes. Technical evidence suggests further downside is more likely than recovery at current levels. Consider reducing or exiting this position.`;

    } else if (t && t.dailyTrend === "Bullish" && t.weeklyTrend === "Bullish" && t.aboveSma50 && t.rsi > 60) {
      // Strong uptrend — HOLD with view to accumulate on dips
      action = "HOLD"; urgency = "LOW"; confidence = 75;
      if (t.rsi > 72) {
        // Overbought — BOOK_PARTIAL_PROFITS
        action = "BOOK_PARTIAL_PROFITS"; urgency = "HIGH"; confidence = 70;
        reasons = [
          `RSI at ${t.rsi} — entering overbought territory where risk of a pullback increases`,
          "Both daily and weekly trends remain bullish — but the move may be extended near-term",
          t.stochasticLabel === "Strong" ? "Stochastic also in overbought zone — momentum stretched" : "Momentum at elevated levels",
          "Prudent to lock in some gains while the uptrend remains intact",
          "Can re-enter or add on the next dip near the 50-day SMA",
        ];
        risks = ["Short-term correction could erase recent gains if held fully", "Broader market weakness could accelerate a pullback"];
        watchFor = ["RSI pulling back towards 55-60 — better re-entry zone", "Price testing 50-day SMA — accumulation opportunity"];
        finalVerdict = `This stock is in a strong uptrend but RSI signals the move is stretched in the short term. Booking partial profits here is prudent risk management — the core position can be held through any pullback.`;
      } else {
        reasons = [
          "Daily and weekly trends both firmly bullish — momentum clearly in the stock's favour",
          `RSI at ${t.rsi} — healthy zone with room to extend further without being overbought`,
          t.aboveSma200 ? "Holding above both 50-day and 200-day moving averages — long-term trend intact" : "50-day SMA acting as a solid support base",
          t.volumeLabel === "Strong" ? "Volume confirming the upward move — institutional participation evident" : "Price action constructive with no distribution signs",
          "No technical reason to exit — trend and momentum support holding",
        ];
        risks = ["A broader market correction could pull this down despite strong individual technicals", "Watch for any sector-specific headwinds"];
        watchFor = [`RSI falling below 50 — would signal momentum shift`, "Price breaking below 50-day SMA — would trigger review"];
        finalVerdict = `This stock is in a healthy uptrend with strong technical support. The current setup favours holding and potentially adding on any dips near the 50-day moving average.`;
      }

    } else if (t && t.dailyTrend === "Bullish" && !t.aboveSma200 && t.rsi < 55) {
      // Recovering from lows — ACCUMULATE opportunity
      action = "ACCUMULATE"; urgency = "MEDIUM"; confidence = 68;
      reasons = [
        "Daily trend turning bullish — early signs of recovery underway",
        `RSI at ${t.rsi} recovering from lower levels — buying interest returning`,
        t.weeklyTrend === "Bullish" ? "Weekly trend also turning positive — recovery has follow-through potential" : "Recovery needs weekly confirmation to sustain",
        t.volumeLabel === "Strong" ? "Volume picking up on the recovery — a positive sign of accumulation" : "Watching for volume confirmation to validate the move",
        "Risk-reward favours building a position at current levels while the stock shows strength",
      ];
      risks = [
        t.aboveSma200 ? "Still below key long-term average — needs sustained strength" : "Recovery could fail if broader market weakens",
        "Weekly trend not yet fully confirmed — early stage recovery",
      ];
      watchFor = ["Weekly trend turning bullish — would increase conviction significantly", `RSI sustaining above 55 — confirms momentum is back`];
      finalVerdict = `The stock is showing early signs of technical recovery with the daily trend turning positive. This is a potential accumulation opportunity — build a position gradually as the recovery confirms across multiple timeframes.`;

    } else if (!t || techScore >= 4) {
      // Default HOLD
      action = "HOLD"; urgency = "LOW"; confidence = 60;
      reasons = [
        t ? `Technical picture is balanced — ${t.dailyTrend.toLowerCase()} daily trend with RSI at ${t.rsi}` : "No clear technical signal to act on today",
        t?.aboveSma50 ? "Holding above 50-day moving average — short-term trend intact" : "Price below 50-day SMA — watch for recovery",
        t?.aboveSma200 ? "Above 200-day SMA — long-term trend remains positive" : "Below long-term moving average — caution warranted",
        "No immediate catalyst to act — maintain current position and monitor",
      ];
      risks = ["Broader market weakness could affect even neutral positions", "Watch for any deterioration in sector momentum"];
      watchFor = [t ? `RSI breaking decisively above 60 or below 40 — would signal a directional move` : "Any significant price move on high volume", "Sector rotation or news catalyst"];
      finalVerdict = `The stock shows a neutral technical picture with no clear signal to buy or sell at this stage. Hold current position and wait for a clearer directional setup before adding or reducing.`;
    } else {
      // Technically weak — WAIT_AND_WATCH
      action = "WAIT_AND_WATCH"; urgency = "MEDIUM"; confidence = 62;
      reasons = [
        t?.dailyTrend === "Bearish" ? "Daily trend turned bearish — caution warranted" : "Mixed technical signals — not a clean setup",
        t?.aboveSma50 === false ? "Price below 50-day moving average — short-term trend negative" : "Technical momentum losing steam",
        t ? `RSI at ${t.rsi} — ${t.rsi < 45 ? "momentum weakening" : "not yet oversold"}` : "Insufficient technical data",
        "Avoid adding to this position until technical clarity improves",
      ];
      risks = ["Could deteriorate further if market weakens", "No clear support level visible from current data"];
      watchFor = ["Daily trend recovering to neutral or bullish", `Price reclaiming 50-day SMA — first sign of recovery`];
      finalVerdict = `The technical picture is mixed with some warning signs. Avoid new positions until the trend clarifies. Existing holders should watch key support levels and be prepared to reduce if conditions worsen.`;
    }

    return {
      symbol: h.symbol,
      action, confidence, urgency,
      reasons, risks, watchFor,
      technical: techToSnapshot(h.tech),
      finalVerdict,
    };
  });

  // Derive summary items
  const sellItems = todayDecisions.filter(d => d.action === "SELL");
  const profitItems = todayDecisions.filter(d => d.action === "BOOK_PARTIAL_PROFITS");

  const attentionRequired: DecisionData["attentionRequired"] = [
    ...sellItems.map(d => ({
      symbol: d.symbol, action: "SELL" as const,
      urgency: d.urgency as "URGENT" | "HIGH",
      reasons: d.reasons.slice(0, 3), confidence: d.confidence,
    })),
    ...profitItems.map(d => ({
      symbol: d.symbol, action: "BOOK_PARTIAL_PROFITS" as const,
      urgency: d.urgency as "URGENT" | "HIGH",
      reasons: d.reasons.slice(0, 3), confidence: d.confidence,
    })),
  ].slice(0, 5).filter(a => a.urgency === "URGENT" || a.urgency === "HIGH");

  const accItems = todayDecisions.filter(d => d.action === "ACCUMULATE");
  const topOpp = accItems.sort((a, b) => b.confidence - a.confidence)[0];
  const topOpportunity: DecisionData["topOpportunity"] = topOpp
    ? { symbol: topOpp.symbol, action: topOpp.action as "BUY" | "ACCUMULATE", reasons: topOpp.reasons.slice(0, 3), confidence: topOpp.confidence }
    : null;

  const riskItems = todayDecisions.filter(d => d.action === "SELL" || d.action === "WAIT_AND_WATCH");
  const topRisk = riskItems.sort((a, b) => b.confidence - a.confidence)[0];
  const biggestRisk: DecisionData["biggestRisk"] = topRisk
    ? { symbol: topRisk.symbol, reasons: topRisk.risks, confidence: topRisk.confidence }
    : null;

  // Health score from technical strengths
  const avgTech = holdings.reduce((s, h) => {
    const t = h.tech;
    if (!t) return s + 50;
    let score = 50;
    if (t.aboveSma50)  score += 10; else score -= 10;
    if (t.aboveSma200) score += 10; else score -= 10;
    if (t.dailyTrend === "Bullish") score += 8; else if (t.dailyTrend === "Bearish") score -= 8;
    if (t.weeklyTrend === "Bullish") score += 8; else if (t.weeklyTrend === "Bearish") score -= 8;
    if (t.rsi > 50 && t.rsi < 70) score += 5;
    if (t.rsi < 35 || t.rsi > 75) score -= 5;
    return s + score;
  }, 0) / holdings.length;

  const portfolioHealthScore = Math.min(100, Math.max(0, Math.round(avgTech)));

  const bullCount  = holdings.filter(h => h.tech?.dailyTrend === "Bullish").length;
  const bearCount  = holdings.filter(h => h.tech?.dailyTrend === "Bearish").length;
  const sentiment: DecisionData["marketSentiment"] =
    bullCount > bearCount * 1.5 ? "BULLISH" :
    bearCount > bullCount * 1.5 ? "BEARISH" : "NEUTRAL";

  return {
    date: today,
    portfolioHealthScore,
    marketContext: `Your portfolio is ${dayChange >= 0 ? "up" : "down"} ${Math.abs(dayChange).toFixed(2)}% today. ${bullCount} of ${holdings.length} holdings showing bullish daily momentum.`,
    marketSentiment: sentiment,
    marketReasons: [
      `${bullCount}/${holdings.length} holdings in bullish daily trend`,
      bearCount > 0 ? `${bearCount} holding${bearCount > 1 ? "s" : ""} showing bearish signals — monitor closely` : "No bearish signals in your portfolio today",
      dayChange > 0.5 ? "Positive session — momentum broadly supportive" : dayChange < -0.5 ? "Weak session — defensive positioning advisable" : "Mixed day — wait for directional clarity",
    ],
    attentionRequired,
    topOpportunity,
    biggestRisk,
    todayDecisions,
  };
}
