import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";
import { getQuote } from "@/lib/market";
import type { Exchange } from "@/lib/india";

const BriefSchema = z.object({
  date: z.string(),
  portfolioHealth: z.object({
    score: z.number().min(0).max(100),
    grade: z.enum(["A+", "A", "B+", "B", "C+", "C", "D", "F"]),
    summary: z.string(),
  }),
  marketSentiment: z.object({
    overall: z.enum(["BULLISH", "NEUTRAL", "BEARISH"]),
    india: z.string(),
    global: z.string(),
  }),
  todayActions: z.array(z.object({
    symbol: z.string(),
    action: z.enum(["BUY", "ACCUMULATE", "HOLD", "REDUCE", "SELL", "WATCH"]),
    reason: z.string(),
    urgency: z.enum(["HIGH", "MEDIUM", "LOW"]),
  })),
  topOpportunity: z.object({
    symbol: z.string(),
    why: z.string(),
    entryRange: z.string(),
    target: z.string(),
    risk: z.string(),
  }),
  highestRisk: z.object({
    symbol: z.string(),
    risk: z.string(),
    action: z.string(),
  }),
  sectorRotation: z.string(),
  cashDeployment: z.string(),
  rebalancingSuggestion: z.string(),
  keyTheme: z.string(),
  disclaimer: z.string(),
});

export type DailyBrief = z.infer<typeof BriefSchema>;

export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const portfolioId = await resolvePortfolioId(req.nextUrl.searchParams.get("portfolioId"));

  const holdings = await prisma.holding.findMany({ where: { portfolioId } });

  if (holdings.length === 0) {
    return NextResponse.json({ error: "No holdings found. Add holdings to get your daily brief." }, { status: 400 });
  }

  // Fetch live prices for all holdings
  const quoteResults = await Promise.allSettled(
    holdings.map((h) => getQuote(h.symbol, (h.exchange as Exchange) ?? "NSE"))
  );

  const holdingsSummary = holdings.map((h, i) => {
    const q = quoteResults[i].status === "fulfilled" ? (quoteResults[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value : null;
    const price = q?.price ?? h.avgCost;
    const gl = ((price - h.avgCost) / h.avgCost) * 100;
    return {
      symbol: h.symbol,
      name: h.name,
      shares: h.shares,
      avgCost: h.avgCost,
      currentPrice: price,
      changePercent: q?.changePercent ?? 0,
      gainLossPct: gl,
      sector: h.sector ?? "Other",
    };
  });

  const totalValue = holdingsSummary.reduce((s, h) => s + h.currentPrice * h.shares, 0);
  const totalCost = holdingsSummary.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const portfolioGL = ((totalValue - totalCost) / totalCost) * 100;
  const dayChange = holdingsSummary.reduce((s, h) => s + h.changePercent * h.currentPrice * h.shares, 0) / totalValue;

  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json(getMockBrief(holdingsSummary, portfolioGL, dayChange));
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const prompt = `You are RAIOS, a professional AI investment advisor for Indian equity markets (NSE/BSE). Today is ${today}.

Generate a concise, actionable daily investment brief for this portfolio:

PORTFOLIO OVERVIEW:
- Total Value: ₹${totalValue.toFixed(0)}
- Total Cost: ₹${totalCost.toFixed(0)}
- Portfolio G/L: ${portfolioGL.toFixed(2)}%
- Today's Change: ${dayChange.toFixed(2)}%
- Number of Holdings: ${holdings.length}

HOLDINGS (symbol, shares, avg cost, current price, G/L%):
${holdingsSummary.map(h => `${h.symbol} (${h.sector}): ${h.shares} shares @ ₹${h.avgCost}, now ₹${h.currentPrice.toFixed(2)}, ${h.gainLossPct > 0 ? "+" : ""}${h.gainLossPct.toFixed(1)}%, today ${h.changePercent > 0 ? "+" : ""}${h.changePercent.toFixed(2)}%`).join("\n")}

Generate a professional daily investment brief with:
1. Portfolio health score (0-100) and grade
2. Today's Indian market sentiment and context
3. 2-4 specific actions to take today (only for stocks in this portfolio)
4. Top opportunity (from portfolio OR related NSE stocks)
5. Highest risk holding and what to do
6. Sector rotation advice
7. Cash deployment suggestion (if any)
8. Rebalancing insight
9. One key market theme for the week

Be specific, concise, and India-market-aware. Use ₹ for all prices. Today is ${today}.`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: BriefSchema,
      prompt,
    });
    return NextResponse.json(object);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/brief] Gemini error:", msg);
    const isQuota = msg.includes("quota") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const isAuth  = msg.includes("API_KEY_INVALID") || msg.includes("401") || msg.includes("UNAUTHENTICATED");
    const label   = isQuota ? "Gemini free-tier quota exceeded (20 req/day). The brief will use calculated estimates until quota resets."
                  : isAuth  ? `Gemini API key rejected: ${msg}`
                  :           `Gemini error: ${msg}`;
    return NextResponse.json(
      { ...getMockBrief(holdingsSummary, portfolioGL, dayChange), aiError: label },
      { status: 200 }
    );
  }
}

function getMockBrief(holdings: { symbol: string; name: string; gainLossPct: number; sector: string; changePercent: number }[], portfolioGL: number, dayChange: number): DailyBrief {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const topGainer = [...holdings].sort((a, b) => b.gainLossPct - a.gainLossPct)[0];
  const topLoser = [...holdings].sort((a, b) => a.gainLossPct - b.gainLossPct)[0];
  const health = Math.min(100, Math.max(0, 60 + portfolioGL * 0.5));

  return {
    date: today,
    portfolioHealth: {
      score: Math.round(health),
      grade: health >= 85 ? "A+" : health >= 75 ? "A" : health >= 65 ? "B+" : health >= 55 ? "B" : "C",
      summary: `Portfolio is ${portfolioGL > 0 ? "up" : "down"} ${Math.abs(portfolioGL).toFixed(1)}% overall. ${dayChange > 0 ? "Positive" : "Negative"} momentum today. Showing rule-based estimates.`,
    },
    marketSentiment: {
      overall: dayChange > 0.5 ? "BULLISH" : dayChange < -0.5 ? "BEARISH" : "NEUTRAL",
      india: "Indian markets showing mixed signals. Watch RBI policy and FII flows closely.",
      global: "Global cues from US Fed and crude oil prices remain key watchpoints.",
    },
    todayActions: [
      { symbol: topGainer?.symbol ?? "RELIANCE", action: "HOLD", reason: "Strong performer — maintain position and trail stop loss.", urgency: "LOW" },
      ...(topLoser && topLoser.gainLossPct < -10 ? [{ symbol: topLoser.symbol, action: "REDUCE" as const, reason: "Underperforming significantly. Consider partial exit to manage risk.", urgency: "MEDIUM" as const }] : []),
    ],
    topOpportunity: {
      symbol: topGainer?.symbol ?? "RELIANCE",
      why: "Strongest holding in the portfolio. Consider adding on dips.",
      entryRange: "Current ± 2%",
      target: "+15% in 12 months",
      risk: "Market downturn, sector-specific headwinds",
    },
    highestRisk: {
      symbol: topLoser?.symbol ?? holdings[0]?.symbol ?? "N/A",
      risk: "Significant underperformance vs peers. Watch for further deterioration.",
      action: "Set stop loss at -15% from avg cost. Review thesis.",
    },
    sectorRotation: "Watch for rotation from IT to PSU Banks. Infrastructure plays remain strong with government capex.",
    cashDeployment: "Deploy gradually on dips in quality large-caps. Avoid chasing momentum stocks.",
    rebalancingSuggestion: "Consider capping single-stock exposure at 20% of portfolio. Increase diversification across sectors.",
    keyTheme: "India's domestic consumption story remains intact. Focus on companies with strong pricing power.",
    disclaimer: "Showing rule-based estimates. This is not financial advice.",
  };
}
