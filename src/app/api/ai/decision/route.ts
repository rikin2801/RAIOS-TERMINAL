import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";
import { getQuote } from "@/lib/market";
import type { Exchange } from "@/lib/india";

const DecisionSchema = z.object({
  date: z.string(),
  marketContext: z.string(),
  todayDecisions: z.array(z.object({
    symbol: z.string(),
    action: z.enum(["BUY", "ACCUMULATE", "HOLD", "REDUCE", "BOOK_PARTIAL_PROFIT", "SELL", "WAIT", "WATCH"]),
    reason: z.string(),
    urgency: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]),
    priceLevel: z.string(),
    confidence: z.number().min(0).max(100),
    holdingPeriod: z.string(),
    technicalSignal: z.string(),
    portfolioContext: z.string(),
    whyNow: z.string(),
    whatCouldInvalidate: z.string(),
    analysisTimeframe: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    expectedReward: z.string(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
    finalVerdict: z.string(),
  })),
  highConviction: z.array(z.object({
    symbol: z.string(),
    direction: z.enum(["LONG", "EXIT"]),
    why: z.string(),
    confidence: z.number().min(0).max(100),
    timeframe: z.string(),
    catalyst: z.string(),
  })),
  alerts: z.object({
    nearStopLoss: z.array(z.object({
      symbol: z.string(),
      currentPrice: z.number(),
      stopLoss: z.number(),
      distancePct: z.number(),
      action: z.string(),
    })),
    nearTarget: z.array(z.object({
      symbol: z.string(),
      currentPrice: z.number(),
      target: z.number(),
      distancePct: z.number(),
      action: z.string(),
    })),
  }),
  portfolioStrengths: z.array(z.string()),
  portfolioWeaknesses: z.array(z.string()),
  weeklyPlan: z.string(),
  topOpportunity: z.object({ symbol: z.string(), why: z.string(), confidence: z.number() }),
  highestRisk: z.object({ symbol: z.string(), why: z.string() }),
  highestConviction: z.object({ symbol: z.string(), action: z.string(), why: z.string(), confidence: z.number() }),
  disclaimer: z.string(),
});

export type DecisionData = z.infer<typeof DecisionSchema>;

type EnrichedE = {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  sector: string | null;
  currentPrice: number;
  stopLoss: number;
  target: number;
  gl: number;
  distFromSL: number;
  distFromTarget: number;
  changePercent: number;
  weight: number;
};


// Server-side cache for AI-generated decisions — avoids repeated Gemini calls
// when the user re-opens the tab or refreshes within the same market session.
const _aiDecisionCache = new Map<string, { data: DecisionData; ts: number }>();
const AI_DECISION_TTL_MS = 5 * 60_000; // 5 minutes

export async function GET(req: NextRequest) {
  const portfolioId = await resolvePortfolioId(req.nextUrl.searchParams.get("portfolioId"));
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  // quick=1 → return rule-based decisions immediately (no Gemini). Used on initial
  // page load so the tab renders fast; the Refresh button omits this param for full AI.
  const quick = req.nextUrl.searchParams.get("quick") === "1";
  const holdings = await prisma.holding.findMany({ where: { portfolioId } });

  if (holdings.length === 0) {
    return NextResponse.json({ error: "No holdings found." }, { status: 400 });
  }

  const quoteResults = await Promise.allSettled(
    holdings.map((h) => getQuote(h.symbol, (h.exchange as Exchange) ?? "NSE"))
  );

  const totalCurrentValue = holdings.reduce((s, h, i) => {
    const q = quoteResults[i].status === "fulfilled" ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value : null;
    const price = q?.price ?? h.avgCost;
    return s + price * h.shares;
  }, 0);

  const enriched: EnrichedE[] = holdings.map((h, i) => {
    const q = quoteResults[i].status === "fulfilled"
      ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value
      : null;
    const price = q?.price ?? h.avgCost;
    const stopLoss = h.avgCost * 0.88;
    const target = h.avgCost * 1.25;
    const gl = ((price - h.avgCost) / h.avgCost) * 100;
    const distFromSL = ((price - stopLoss) / price) * 100;
    const distFromTarget = ((target - price) / price) * 100;
    const weight = totalCurrentValue > 0 ? (price * h.shares / totalCurrentValue) * 100 : 0;
    return {
      symbol: h.symbol, name: h.name, shares: h.shares, avgCost: h.avgCost, sector: h.sector,
      currentPrice: price, stopLoss, target, gl, distFromSL, distFromTarget,
      changePercent: q?.changePercent ?? 0, weight,
    };
  });

  const totalCost = enriched.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const totalValue = enriched.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  const portfolioGL = ((totalValue - totalCost) / totalCost) * 100;
  const dayChange = enriched.reduce((s, h) => s + h.changePercent * h.currentPrice * h.shares, 0) / (totalValue || 1);

  // Quick mode or no API key → instant rule-based decisions
  if (quick || !apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json({ ...getMockDecisions(enriched, portfolioGL, dayChange), source: "rule-based" });
  }

  // Return cached AI response if still fresh (user clicked Refresh within 5 min)
  const cached = _aiDecisionCache.get(portfolioId);
  if (cached && Date.now() - cached.ts < AI_DECISION_TTL_MS) {
    return NextResponse.json({ ...cached.data, source: "ai-cached" });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const holdingsBlock = enriched.map(h =>
    `${h.symbol} (${h.sector ?? "Diversified"}) | ₹${h.currentPrice.toFixed(0)} (${h.changePercent > 0 ? "+" : ""}${h.changePercent.toFixed(2)}% today) | Avg ₹${h.avgCost.toFixed(0)} | G/L: ${h.gl > 0 ? "+" : ""}${h.gl.toFixed(1)}% | Weight: ${h.weight.toFixed(1)}% | SL ₹${h.stopLoss.toFixed(0)} | Target ₹${h.target.toFixed(0)}`
  ).join("\n");

  const prompt = `You are RAIOS, an expert Indian equity trader and AI investment decision engine. Today is ${today}.

MISSION: Generate ONE clear, actionable decision per holding. The investor wants to know WHAT ACTION TO TAKE and WHY — not just data.

PORTFOLIO SUMMARY: ₹${totalValue.toFixed(0)} total | ${portfolioGL.toFixed(2)}% G/L | Today: ${dayChange.toFixed(2)}%

HOLDINGS WITH LIVE PRICES:
${holdingsBlock}

For EACH holding, generate:
- action: ONE of BUY/ACCUMULATE/HOLD/REDUCE/BOOK_PARTIAL_PROFIT/SELL/WAIT
- reason: 1-2 sentence decision-first reasoning (explain the action, not just the data)
- urgency: URGENT/HIGH/MEDIUM/LOW
- priceLevel: current price string
- confidence: 0-100 (how confident you are in this action)
- holdingPeriod: suggested holding duration (e.g. "3-6 months", "Short-term 2-4 weeks")
- technicalSignal: decision-first summary of key signals (e.g. "Momentum healthy — G/L +12%, 18% upside to target; Today +0.8% bullish")
- portfolioContext: brief context (e.g. "Avg ₹2100, up 16.7%, weight 18.2% of portfolio — largest holding")
- whyNow: specific reason this action makes sense TODAY
- whatCouldInvalidate: specific condition that would change the recommendation
- analysisTimeframe: DAILY (days-weeks), WEEKLY (weeks-months), or MONTHLY (months-years)
- expectedReward: realistic reward range (e.g. "8-15% in 3-6 months")
- riskLevel: LOW/MEDIUM/HIGH
- finalVerdict: 1-2 sentence precise action (e.g. "Hold existing position. Add 20% more if price dips 3-5%.")

Also generate:
- portfolioStrengths: 3-4 strengths
- portfolioWeaknesses: 3-4 weaknesses
- highConviction: top 2-3 plays with high confidence
- alerts: stocks near stop-loss (within 8% above -12% from avg) or near target (within 10% of +25% from avg)
- topOpportunity: single best buy opportunity with why and confidence
- highestRisk: single most dangerous holding with why
- highestConviction: single best conviction play with action and why
- weeklyPlan: 3-4 sentence tactical plan for this week`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: DecisionSchema,
      prompt,
    });
    _aiDecisionCache.set(portfolioId, { data: object, ts: Date.now() });
    return NextResponse.json({ ...object, source: "ai" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/decision] Gemini error:", msg);
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const isAuth  = msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("UNAUTHENTICATED");
    const label   = isQuota ? "Gemini free-tier quota exceeded (20 req/day). Showing rule-based decisions — quota resets at midnight Pacific time."
                  : isAuth  ? `Gemini API key rejected: ${msg}`
                  :           `Gemini error: ${msg}`;
    return NextResponse.json(
      { ...getMockDecisions(enriched, portfolioGL, dayChange), source: "rule-based", aiError: label },
      { status: 200 }
    );
  }
}

function getMockDecisions(holdings: EnrichedE[], portfolioGL: number, dayChange: number): DecisionData {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const nearSL = holdings.filter(h => h.distFromSL < 8 && h.gl < 0);
  const nearTarget = holdings.filter(h => h.distFromTarget < 10 && h.gl > 0);
  const topGainer = [...holdings].sort((a, b) => b.gl - a.gl)[0];
  const topLoser = [...holdings].sort((a, b) => a.gl - b.gl)[0];
  // Conviction = profitable but not extended, meaningful upside remaining
  const topConviction = [...holdings].sort((a, b) => {
    const aScore = (a.gl > 0 && a.gl < 25 && a.distFromTarget > 8) ? 1 : 0;
    const bScore = (b.gl > 0 && b.gl < 25 && b.distFromTarget > 8) ? 1 : 0;
    return bScore - aScore || b.distFromTarget - a.distFromTarget;
  })[0];
  const sectorSet = new Set(holdings.map(h => h.sector ?? "Other"));

  const todayDecisions = holdings.map(h => {
    // Portfolio-metric signals (no historical data needed — open chart for RSI/MACD/Stoch)
    let buySignals = 0, sellSignals = 0;
    if (h.gl < -5 && h.distFromSL > 15) buySignals++;       // dip with SL buffer
    if (h.distFromTarget > 15) buySignals++;                   // meaningful upside
    if (h.changePercent < -2) buySignals++;                    // today's weakness = entry
    if (h.weight < 5) buySignals++;                            // underweight position
    if (h.gl > 25) sellSignals++;                              // large gain — partial exit
    if (h.distFromSL < 12) sellSignals++;                      // close to stop-loss
    if (h.distFromTarget < 5 && h.gl > 0) sellSignals++;      // very close to target
    if (h.changePercent > 4) sellSignals++;                    // large single-day surge
    if (h.weight > 25) sellSignals++;                          // overconcentrated

    let action: "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "BOOK_PARTIAL_PROFIT" | "SELL" | "WAIT" | "WATCH" = "HOLD";
    let urgency: "URGENT" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let reason = "";
    let confidence = 60;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";

    if (nearSL.some(s => s.symbol === h.symbol)) {
      action = "SELL";
      urgency = "URGENT";
      reason = `Only ${h.distFromSL.toFixed(1)}% above stop-loss ₹${h.stopLoss.toFixed(0)}. Protect capital — exit or place strict stop order immediately.`;
      confidence = 85;
      riskLevel = "HIGH";
    } else if (h.gl > 30 && sellSignals >= 2) {
      action = "BOOK_PARTIAL_PROFIT";
      urgency = "HIGH";
      reason = `Up ${h.gl.toFixed(0)}% from avg cost with ${h.distFromTarget.toFixed(0)}% remaining to target — book 25-30% to lock gains, trail the rest.`;
      confidence = 78;
      riskLevel = "MEDIUM";
    } else if (buySignals >= 3 && h.gl < 10) {
      action = "ACCUMULATE";
      urgency = "MEDIUM";
      reason = `${buySignals} portfolio buy signals: ${h.changePercent < 0 ? `today's ${Math.abs(h.changePercent).toFixed(1)}% dip, ` : ""}${h.distFromTarget.toFixed(0)}% upside to target with ${h.distFromSL.toFixed(0)}% buffer from stop-loss.`;
      confidence = 72;
      riskLevel = "LOW";
    } else if (sellSignals >= 3) {
      action = "REDUCE";
      urgency = "HIGH";
      reason = `Multiple risk signals: ${h.gl > 20 ? `+${h.gl.toFixed(0)}% gain ` : ""}${h.weight > 20 ? `${h.weight.toFixed(0)}% portfolio weight ` : ""}${h.distFromSL < 12 ? "near stop-loss" : ""}. Reduce 20-30% to manage risk.`;
      confidence = 70;
      riskLevel = "HIGH";
    } else if (h.changePercent < -2.5 && buySignals >= 2) {
      action = "ACCUMULATE";
      urgency = "MEDIUM";
      reason = `${Math.abs(h.changePercent).toFixed(1)}% dip today with ${h.distFromTarget.toFixed(0)}% upside remaining and safe distance from stop-loss. Good accumulation entry.`;
      confidence = 65;
      riskLevel = "MEDIUM";
    } else if (h.gl < -20) {
      action = "WAIT";
      urgency = "HIGH";
      reason = `Down ${Math.abs(h.gl).toFixed(0)}% from avg cost ₹${h.avgCost.toFixed(0)}. Wait for price stabilisation above ₹${(h.avgCost * 0.92).toFixed(0)} before averaging down.`;
      confidence = 68;
      riskLevel = "HIGH";
    } else {
      action = "HOLD";
      urgency = "LOW";
      reason = `Position within normal range — ${h.gl > 0 ? `+${h.gl.toFixed(1)}% gain, ` : ""}${h.distFromTarget.toFixed(0)}% upside to target ₹${h.target.toFixed(0)}. No urgent action needed.`;
      confidence = 60;
      riskLevel = h.gl > 0 ? "LOW" : "MEDIUM";
    }

    // Cast to string to avoid TS narrowing from if/else chain above
    const act = action as string;

    const technicalSignal = `Portfolio: G/L ${h.gl > 0 ? "+" : ""}${h.gl.toFixed(1)}% | ${h.distFromSL.toFixed(1)}% from SL | ${h.distFromTarget.toFixed(1)}% to target | Today: ${h.changePercent > 0 ? "+" : ""}${h.changePercent.toFixed(2)}% — Open chart for live RSI/MACD/Stoch`;

    const holdingPeriod = act === "SELL" || act === "REDUCE" ? "Exit within 1-2 sessions"
      : act === "ACCUMULATE" || act === "BUY" ? "Hold 3-6 months minimum"
      : act === "BOOK_PARTIAL_PROFIT" ? "Book partial now, trail remaining 6+ months"
      : "Review in 4-8 weeks";

    const expectedReward = act === "SELL" || act === "REDUCE" ? "Capital preservation priority"
      : act === "ACCUMULATE" || act === "BUY" ? `Target ₹${h.target.toFixed(0)} (+${h.distFromTarget.toFixed(0)}% upside)`
      : act === "BOOK_PARTIAL_PROFIT" ? `Already up ${h.gl.toFixed(0)}% — trail remaining for ₹${h.target.toFixed(0)}`
      : `Hold target ₹${h.target.toFixed(0)} (+${h.distFromTarget.toFixed(0)}%)`;

    const whyNow = act === "SELL"
      ? `Stop-loss proximity at ₹${h.stopLoss.toFixed(0)} makes delay risky — downside risk outweighs any recovery potential`
      : act === "ACCUMULATE"
        ? `${h.changePercent < 0 ? "Today's dip creates a better entry opportunity" : "Portfolio metrics support accumulation"} — ${buySignals} signals aligned`
        : act === "BOOK_PARTIAL_PROFIT"
          ? `${h.gl.toFixed(0)}% gain achieved — risk/reward less favourable at current level, secure partial gains`
          : act === "WAIT"
            ? `Recovery needs price to stabilise above ₹${(h.avgCost * 0.92).toFixed(0)} before adding more capital`
            : `No immediate catalyst requiring action — maintain current position and monitor`;

    const whatCouldInvalidate = act === "HOLD" || act === "ACCUMULATE"
      ? `Break below ₹${(h.currentPrice * 0.92).toFixed(0)} (8% correction from current level) or close to stop-loss ₹${h.stopLoss.toFixed(0)} would trigger exit review`
      : act === "SELL" || act === "REDUCE"
        ? `Recovery above ₹${(h.avgCost * 0.98).toFixed(0)} (near avg cost) with improving fundamentals would cancel the exit thesis`
        : `Significant trend reversal or earnings miss would invalidate this stance — monitor next earnings closely`;

    const finalVerdict = act === "HOLD"
      ? `Hold existing ${h.shares} shares. Set price alert at ₹${(h.currentPrice * 0.95).toFixed(0)} (5% below current) for stop-loss review.`
      : act === "ACCUMULATE"
        ? `Add ${Math.max(1, Math.floor(h.shares * 0.2))} shares near ₹${h.currentPrice.toFixed(0)}. Target ₹${h.target.toFixed(0)}.`
        : act === "BOOK_PARTIAL_PROFIT"
          ? `Sell ${Math.max(1, Math.floor(h.shares * 0.3))} shares (30%) at ₹${h.currentPrice.toFixed(0)}. Keep remaining position for further upside.`
          : act === "SELL"
            ? `Exit full ${h.shares} shares to protect capital. Hard stop at ₹${h.stopLoss.toFixed(0)}.`
            : act === "REDUCE"
              ? `Sell ${Math.max(1, Math.floor(h.shares * 0.25))} shares (25%) to reduce risk exposure. Keep remaining if thesis holds.`
              : act === "WAIT"
                ? `No new buying. Re-evaluate if price recovers above ₹${(h.avgCost * 0.95).toFixed(0)} with improving momentum.`
                : `Hold position — no action today.`;

    return {
      symbol: h.symbol,
      action,
      reason,
      urgency,
      priceLevel: `₹${h.currentPrice.toFixed(0)}`,
      confidence,
      holdingPeriod,
      technicalSignal,
      portfolioContext: `Avg cost ₹${h.avgCost.toFixed(0)} | G/L: ${h.gl > 0 ? "+" : ""}${h.gl.toFixed(1)}% | ${h.shares} shares | Weight: ${h.weight.toFixed(1)}% of portfolio`,
      whyNow,
      whatCouldInvalidate,
      analysisTimeframe: "DAILY" as const,
      expectedReward,
      riskLevel,
      finalVerdict,
    };
  });

  const topOpportunity = (() => {
    const best = holdings
      .filter(h => h.gl < 15 && h.distFromTarget > 10 && h.distFromSL > 12)
      .sort((a, b) => b.distFromTarget - a.distFromTarget)[0] ?? holdings[0];
    const d = todayDecisions.find(dec => dec.symbol === best.symbol);
    const act = (d?.action ?? "HOLD") as string;
    const actionLine = act === "BUY" || act === "ACCUMULATE"
      ? `Add on dips — risk/reward favours adding here.`
      : act === "HOLD"
      ? `Hold current position — let price move toward target before adding.`
      : `Monitor closely — reassess if stop-loss tightens further.`;
    return {
      symbol: best.symbol,
      why: `${best.distFromTarget.toFixed(0)}% upside to target ₹${best.target.toFixed(0)} with ${best.distFromSL.toFixed(0)}% buffer above stop-loss. ${actionLine}`,
      confidence: d?.confidence ?? 74,
    };
  })();

  const highestRisk = (() => {
    const worst = [...holdings].sort((a, b) => a.gl - b.gl)[0];
    return {
      symbol: worst.symbol,
      why: `Down ${Math.abs(worst.gl).toFixed(1)}% from avg cost ₹${worst.avgCost.toFixed(0)}. ${worst.distFromSL < 10 ? "Near stop-loss — urgent review needed." : "Review investment thesis before averaging down."}`,
    };
  })();

  const highestConviction = (() => {
    const best = topConviction ?? topGainer;
    const d = todayDecisions.find(dec => dec.symbol === best?.symbol);
    const act = (d?.action ?? "HOLD") as string;
    const why = act === "BUY" || act === "ACCUMULATE"
      ? `${act} — ${d?.reason ?? "best entry setup in the portfolio right now."}`
      : act === "HOLD"
      ? `Best-positioned holding at ${best ? `${best.gl > 0 ? "+" : ""}${best.gl.toFixed(1)}% with ${best.distFromTarget.toFixed(0)}% upside remaining` : "current levels"}. Hold — let the position run to target.`
      : `${act} — ${d?.reason ?? "portfolio metrics support this action."}`;
    return {
      symbol: best?.symbol ?? holdings[0].symbol,
      action: act,
      why,
      confidence: d?.confidence ?? 70,
    };
  })();

  return {
    date: today,
    marketContext: `Portfolio ${dayChange > 0 ? "up" : "down"} ${Math.abs(dayChange).toFixed(2)}% today (₹${totalCurrentValue(holdings).toFixed(0)} total value). ${dayChange > 1 ? "Strong session — monitor for end-of-day profit booking." : dayChange < -1 ? "Weak day — support levels critical. Watch for bounce." : "Mixed session — wait for directional clarity."}`,
    todayDecisions,
    highConviction: [
      ...(topGainer && topGainer.gl > 5 ? [{
        symbol: topGainer.symbol,
        direction: "LONG" as const,
        why: `Best performer at +${topGainer.gl.toFixed(1)}% — portfolio strength leader with ${topGainer.distFromTarget.toFixed(0)}% upside remaining.`,
        confidence: 72,
        timeframe: "3-6 months",
        catalyst: "Earnings momentum and sector leadership",
      }] : []),
      ...(topLoser && topLoser.gl < -10 ? [{
        symbol: topLoser.symbol,
        direction: "EXIT" as const,
        why: `Weakest at ${topLoser.gl.toFixed(1)}% — underperforming and dragging portfolio returns. Only ${topLoser.distFromSL.toFixed(0)}% above stop-loss.`,
        confidence: 65,
        timeframe: "Exit within 1 week",
        catalyst: "Stop-loss discipline — redeploy into stronger names",
      }] : []),
    ],
    alerts: {
      nearStopLoss: nearSL.map(h => ({
        symbol: h.symbol, currentPrice: h.currentPrice, stopLoss: h.stopLoss,
        distancePct: h.distFromSL,
        action: `Only ${h.distFromSL.toFixed(1)}% above stop-loss ₹${h.stopLoss.toFixed(0)}. Place stop order now or exit.`,
      })),
      nearTarget: nearTarget.map(h => ({
        symbol: h.symbol, currentPrice: h.currentPrice, target: h.target,
        distancePct: h.distFromTarget,
        action: `${h.distFromTarget.toFixed(1)}% from target ₹${h.target.toFixed(0)}. Consider booking 25-30% on approach.`,
      })),
    },
    portfolioStrengths: [
      portfolioGL > 0 ? `Portfolio profitable at +${portfolioGL.toFixed(1)}% overall G/L` : "Capital base intact with quality holdings",
      `${sectorSet.size} sector${sectorSet.size > 1 ? "s" : ""} — ${sectorSet.size >= 4 ? "well-diversified" : "moderate"} exposure`,
      `${holdings.filter(h => h.gl > 0).length}/${holdings.length} positions in profit`,
      "Stop-loss levels defined for all holdings",
    ].slice(0, 4),
    portfolioWeaknesses: [
      ...(nearSL.length > 0 ? [`${nearSL.length} holding${nearSL.length > 1 ? "s" : ""} near stop-loss — ${nearSL.map(h => h.symbol).join(", ")}`] : []),
      ...(sectorSet.size < 4 ? ["Sector concentration below optimal — add diversification"] : []),
      ...(holdings.some(h => h.gl < -20) ? ["Significant drawdown in some positions — review thesis"] : []),
      "No automated stop-loss orders — requires active daily monitoring",
    ].filter(Boolean).slice(0, 4),
    weeklyPlan: `${nearSL.length > 0 ? `URGENT: Review ${nearSL.map(h => h.symbol).join(", ")} near stop-loss first.` : "Positions within normal range."} ${nearTarget.length > 0 ? `Prepare partial exit plan for ${nearTarget.map(h => h.symbol).join(", ")} approaching targets.` : ""} Focus on sector rotation and deploy any idle cash to quality large-caps on dips.`.trim(),
    topOpportunity,
    highestRisk,
    highestConviction,
    disclaimer: "Showing rule-based analysis using live portfolio data. Open individual stock charts for live RSI/MACD/Stoch signals. Not financial advice — consult a SEBI-registered advisor before investing.",
  };
}

function totalCurrentValue(holdings: EnrichedE[]): number {
  return holdings.reduce((s, h) => s + h.currentPrice * h.shares, 0);
}
