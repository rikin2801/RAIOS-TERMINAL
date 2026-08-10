import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { holdingWhere } from "@/lib/portfolio";
import { getQuote } from "@/lib/market";
import type { Exchange } from "@/lib/india";

const PortfolioManagerSchema = z.object({
  generatedAt: z.string(),
  overallHealth: z.object({
    score: z.number().min(0).max(100),
    status: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"]),
    summary: z.string(),
  }),
  holdingRecommendations: z.array(z.object({
    symbol: z.string(),
    action: z.enum(["BUY_MORE", "ACCUMULATE", "HOLD", "REDUCE", "EXIT"]),
    reason: z.string(),
    currentWeight: z.number(),
    targetWeight: z.number(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]),
  })),
  sectorExposure: z.array(z.object({
    sector: z.string(),
    currentPct: z.number(),
    targetPct: z.number(),
    action: z.enum(["OVERWEIGHT", "UNDERWEIGHT", "NEUTRAL"]),
    suggestion: z.string(),
  })),
  riskAnalysis: z.object({
    concentrationRisk: z.string(),
    sectorRisk: z.string(),
    volatilityProfile: z.enum(["AGGRESSIVE", "MODERATE", "CONSERVATIVE"]),
    overallRisk: z.enum(["HIGH", "MEDIUM", "LOW"]),
    diversificationScore: z.number().min(0).max(10),
  }),
  cashDeployment: z.object({
    recommendation: z.string(),
    suggestedAllocation: z.string(),
    timing: z.string(),
  }),
  rebalancingPlan: z.array(z.object({
    step: z.number(),
    action: z.string(),
    impact: z.string(),
  })),
  sixMonthOutlook: z.string(),
  disclaimer: z.string(),
});

export type PortfolioManagerData = z.infer<typeof PortfolioManagerSchema>;

const _pmCache = new Map<string, { data: PortfolioManagerData; ts: number }>();
const PM_TTL_MS = 5 * 60_000;

type EnrichedH = {
  symbol: string;
  name: string;
  sector: string | null;
  shares: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  gl: number;
  weight: number;
  changePercent: number;
};

export async function GET(req: NextRequest) {
  const apiKey      = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const quick       = req.nextUrl.searchParams.get("quick") === "1";
  const force       = req.nextUrl.searchParams.get("force") === "1";
  const rawId       = req.nextUrl.searchParams.get("portfolioId");
  const portfolioId = rawId ?? "default";
  const where       = await holdingWhere(rawId);
  const holdings    = await prisma.holding.findMany({ where });

  if (holdings.length === 0) {
    return NextResponse.json({ error: "No holdings found. Add holdings first." }, { status: 400 });
  }

  const quoteResults = await Promise.allSettled(
    holdings.map((h) => getQuote(h.symbol, (h.exchange as Exchange) ?? "NSE"))
  );

  const enriched: EnrichedH[] = holdings.map((h, i) => {
    const q = quoteResults[i].status === "fulfilled"
      ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value
      : null;
    const price = q?.price ?? h.avgCost;
    const value = price * h.shares;
    const gl = ((price - h.avgCost) / h.avgCost) * 100;
    return {
      symbol: h.symbol, name: h.name, sector: h.sector, shares: h.shares,
      avgCost: h.avgCost, currentPrice: price, value, gl, weight: 0,
      changePercent: q?.changePercent ?? 0,
    };
  });

  const totalValue = enriched.reduce((s, h) => s + h.value, 0);
  const totalCost = enriched.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const portfolioGL = ((totalValue - totalCost) / totalCost) * 100;
  enriched.forEach((h) => { h.weight = (h.value / totalValue) * 100; });

  const sectorMap = new Map<string, number>();
  enriched.forEach((h) => {
    const s = h.sector ?? "Other";
    sectorMap.set(s, (sectorMap.get(s) ?? 0) + h.weight);
  });

  if (quick || !apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json({ ...getMockData(enriched, sectorMap, portfolioGL), source: "rule-based" });
  }

  const cached = _pmCache.get(portfolioId);
  if (!force && cached && Date.now() - cached.ts < PM_TTL_MS) {
    return NextResponse.json({ ...cached.data, source: "ai-cached" });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const prompt = `You are RAIOS, an expert Indian equity portfolio manager. Today is ${today}.

Analyze this portfolio comprehensively:

PORTFOLIO: ₹${totalValue.toFixed(0)} total value, ₹${totalCost.toFixed(0)} invested, ${portfolioGL.toFixed(2)}% overall G/L, ${holdings.length} holdings.

HOLDINGS (symbol, sector, weight%, G/L%, today%):
${enriched.map(h => `${h.symbol} (${h.sector ?? "Other"}): ${h.weight.toFixed(1)}% | G/L: ${h.gl > 0 ? "+" : ""}${h.gl.toFixed(1)}% | Today: ${h.changePercent > 0 ? "+" : ""}${h.changePercent.toFixed(2)}%`).join("\n")}

SECTOR BREAKDOWN: ${Array.from(sectorMap.entries()).map(([s, w]) => `${s}: ${w.toFixed(1)}%`).join(" | ")}

Provide portfolio management with:
1. Health score (0-100) and status (EXCELLENT/GOOD/FAIR/POOR/CRITICAL)
2. Action for each holding (BUY_MORE/ACCUMULATE/HOLD/REDUCE/EXIT), reason, current vs target weight, priority
3. Sector analysis — over/underweight vs ideal
4. Risk: concentrationRisk, sectorRisk, volatilityProfile, overallRisk, diversificationScore (0-10)
5. Cash deployment strategy
6. Step-by-step rebalancing plan (3-5 steps)
7. 6-month outlook for this portfolio`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: PortfolioManagerSchema,
      prompt,
    });
    _pmCache.set(portfolioId, { data: object, ts: Date.now() });
    return NextResponse.json({ ...object, source: "ai" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/portfolio-manager] Gemini error:", msg);
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const isAuth  = msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("UNAUTHENTICATED");
    const label   = isQuota ? "Gemini free-tier quota exceeded (20 req/day). Showing calculated estimates — quota resets at midnight Pacific time."
                  : isAuth  ? `Gemini API key rejected: ${msg}`
                  :           `Gemini error: ${msg}`;
    return NextResponse.json(
      { ...getMockData(enriched, sectorMap, portfolioGL), aiError: label },
      { status: 200 }
    );
  }
}

function getMockData(holdings: EnrichedH[], sectorMap: Map<string, number>, portfolioGL: number): PortfolioManagerData {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const score = Math.min(100, Math.max(0, 55 + portfolioGL * 0.4));
  const topH = [...holdings].sort((a, b) => b.weight - a.weight)[0];
  const concentrated = (topH?.weight ?? 0) > 25;

  return {
    generatedAt: today,
    overallHealth: {
      score: Math.round(score),
      status: score >= 80 ? "EXCELLENT" : score >= 65 ? "GOOD" : score >= 50 ? "FAIR" : score >= 35 ? "POOR" : "CRITICAL",
      summary: `Portfolio ${portfolioGL > 0 ? "up" : "down"} ${Math.abs(portfolioGL).toFixed(1)}% overall. ${concentrated ? `Concentration risk in ${topH.symbol} (${topH.weight.toFixed(1)}%).` : "Diversification looks reasonable."} Showing rule-based estimates.`,
    },
    holdingRecommendations: holdings.map((h) => ({
      symbol: h.symbol,
      action: h.gl > 35 ? "REDUCE" : h.gl < -20 ? "EXIT" : h.weight > 22 ? "REDUCE" : h.gl > 10 && h.weight < 8 ? "ACCUMULATE" : "HOLD",
      reason: h.gl > 35
        ? `Strong +${h.gl.toFixed(0)}% gain — consider booking 20-30% of position for partial profit.`
        : h.gl < -20
        ? `Down ${Math.abs(h.gl).toFixed(0)}% — review thesis; consider stop-loss if thesis broken.`
        : h.weight > 22
        ? `Overweight at ${h.weight.toFixed(1)}% — trim to ~15% to reduce concentration.`
        : h.gl > 10 && h.weight < 8
        ? `Good performer at low weight — can accumulate on dips to increase to 10-12%.`
        : `Hold position. Monitor support levels and quarterly earnings results.`,
      currentWeight: parseFloat(h.weight.toFixed(1)),
      targetWeight: parseFloat(Math.min(15, Math.max(5, h.weight * 0.9)).toFixed(1)),
      priority: h.gl < -25 || h.weight > 28 ? "HIGH" : h.gl < -15 || h.weight > 20 ? "MEDIUM" : "LOW",
    })),
    sectorExposure: Array.from(sectorMap.entries()).map(([sector, pct]) => ({
      sector,
      currentPct: parseFloat(pct.toFixed(1)),
      targetPct: parseFloat(Math.min(25, Math.max(5, pct)).toFixed(1)),
      action: pct > 30 ? "OVERWEIGHT" : pct < 8 ? "UNDERWEIGHT" : "NEUTRAL",
      suggestion: pct > 30
        ? `${sector} at ${pct.toFixed(0)}% is too concentrated. Target ≤25%.`
        : pct < 8
        ? `${sector} underrepresented at ${pct.toFixed(0)}%. Consider adding quality exposure.`
        : `${sector} at ${pct.toFixed(0)}% is within healthy range.`,
    })),
    riskAnalysis: {
      concentrationRisk: concentrated
        ? `HIGH: ${topH.symbol} at ${topH.weight.toFixed(1)}% exceeds 25% threshold.`
        : `MODERATE: No single stock exceeds 25% weight.`,
      sectorRisk: sectorMap.size < 4
        ? `HIGH: Only ${sectorMap.size} sector(s) — limited diversification.`
        : `MODERATE: ${sectorMap.size} sectors provide reasonable spread.`,
      volatilityProfile: "MODERATE",
      overallRisk: concentrated ? "HIGH" : "MEDIUM",
      diversificationScore: parseFloat(Math.min(10, sectorMap.size * 1.5 + (holdings.length > 6 ? 1.5 : 0)).toFixed(1)),
    },
    cashDeployment: {
      recommendation: "Maintain 5-10% cash buffer for opportunistic dip-buying.",
      suggestedAllocation: "Target quality Nifty 50 large-caps with strong earnings visibility.",
      timing: "Deploy in 2-3 tranches over 4-6 weeks. Avoid lump-sum at elevated valuations.",
    },
    rebalancingPlan: [
      { step: 1, action: "Identify positions exceeding 20% weight and trim to 15%", impact: "Reduces single-stock concentration risk significantly" },
      { step: 2, action: "Review underperformers (>15% loss) for exit if thesis is broken", impact: "Stops capital erosion and frees funds for better ideas" },
      { step: 3, action: "Add exposure to sectors below 5% with strong fundamentals", impact: "Improves portfolio diversification and risk-adjusted returns" },
      { step: 4, action: "Set trailing stop-losses at 12% below recent highs for all positions", impact: "Protects unrealized gains from sudden market reversals" },
    ],
    sixMonthOutlook: "India's domestic growth trajectory remains intact. Focus on cyclicals with government capex tailwinds. Monitor FII flows, RBI policy, and global risk from US rates and crude oil. Quarterly earnings will be the primary trigger for stock-specific moves.",
    disclaimer: "Showing rule-based estimates using your actual portfolio metrics. Not financial advice.",
  };
}
