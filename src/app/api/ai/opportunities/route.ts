import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { getMultipleQuotes } from "@/lib/market";

const OpportunitySchema = z.object({
  generatedAt: z.string(),
  topBuys: z.array(z.object({
    rank: z.number(),
    symbol: z.string(),
    name: z.string(),
    price: z.string(),
    target: z.string(),
    upside: z.string(),
    why: z.string(),
    risk: z.string(),
    timeframe: z.string(),
    conviction: z.enum(["HIGH", "MEDIUM", "LOW"]),
  })),
  swingTrades: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    entry: z.string(),
    target: z.string(),
    stopLoss: z.string(),
    why: z.string(),
    duration: z.string(),
  })),
  momentumLeaders: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    why: z.string(),
    momentum: z.string(),
  })),
  hiddenGems: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    why: z.string(),
    catalyst: z.string(),
  })),
  avoidList: z.array(z.object({
    symbol: z.string(),
    reason: z.string(),
  })),
  marketOutlook: z.string(),
});

export type OpportunitiesData = z.infer<typeof OpportunitySchema>;

// Quick scan universe for opportunity generation
const SCAN_SYMBOLS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
  "BAJFINANCE", "LT", "AXISBANK", "MARUTI", "SUNPHARMA", "WIPRO", "ITC",
  "HCLTECH", "TECHM", "DRREDDY", "TITAN", "ASHOKLEY", "ABCAPITAL",
  "LTIM", "PERSISTENT", "ZOMATO", "CIPLA", "APOLLOHOSP", "VOLTAS",
  "HAVELLS", "BRITANNIA", "TATACONSUM", "TATASTEEL",
];

export async function GET() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // Fetch current quotes for scan universe
  const quotes = await getMultipleQuotes(SCAN_SYMBOLS);

  const quoteSummary = quotes.map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changePercent: q.changePercent,
    marketCap: q.marketCap,
    pe: q.pe,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    pctFrom52wHigh: q.fiftyTwoWeekHigh > 0 ? ((q.price / q.fiftyTwoWeekHigh - 1) * 100).toFixed(1) : "N/A",
    dividendYield: q.dividendYield,
  }));

  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json(getMockOpportunities(quoteSummary));
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `You are RAIOS, an expert Indian equity market AI. Today is ${today}.

Analyze these NSE stocks and identify the best opportunities:

STOCK UNIVERSE (symbol, name, price, day%, % from 52W high, P/E):
${quoteSummary.map(q => `${q.symbol}: ₹${q.price.toFixed(2)}, ${q.changePercent > 0 ? "+" : ""}${q.changePercent.toFixed(2)}%, ${q.pctFrom52wHigh}% from 52W high, P/E: ${q.pe?.toFixed(1) ?? "N/A"}`).join("\n")}

Generate an opportunity analysis with:
1. Top 5 BUY opportunities (specific price targets in ₹, upside %, explain WHY clearly)
2. Top 3 swing trades (short-term 2-4 week trades with entry/target/stop in ₹)
3. Top 3 momentum leaders (stocks showing strong upward momentum)
4. 2-3 hidden gems (under-the-radar stocks worth watching)
5. 2-3 stocks to avoid (and why)
6. Brief market outlook

Focus on the Indian market context. All prices in ₹. Be specific and actionable.`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: OpportunitySchema,
      prompt,
    });
    return NextResponse.json(object);
  } catch (err) {
    console.error("Opportunity generation failed:", err);
    return NextResponse.json(getMockOpportunities(quoteSummary));
  }
}

function getMockOpportunities(quotes: { symbol: string; name: string; price: number; changePercent: number; pe: number | undefined; pctFrom52wHigh: string }[]): OpportunitiesData {
  const gainers = [...quotes].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const losers = [...quotes].sort((a, b) => a.changePercent - b.changePercent).slice(0, 2);
  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  return {
    generatedAt: today,
    topBuys: gainers.map((q, i) => ({
      rank: i + 1,
      symbol: q.symbol,
      name: q.name,
      price: `₹${q.price.toFixed(2)}`,
      target: `₹${(q.price * 1.15).toFixed(2)}`,
      upside: "15%",
      why: `Strong fundamentals and positive momentum. Technical setup suggests continued upside. Add Gemini API key for real AI analysis.`,
      risk: "Market volatility, sector rotation risk",
      timeframe: "6-12 months",
      conviction: i === 0 ? "HIGH" : "MEDIUM",
    })),
    swingTrades: gainers.slice(0, 3).map((q) => ({
      symbol: q.symbol,
      name: q.name,
      entry: `₹${(q.price * 0.99).toFixed(2)} - ₹${(q.price * 1.01).toFixed(2)}`,
      target: `₹${(q.price * 1.06).toFixed(2)}`,
      stopLoss: `₹${(q.price * 0.96).toFixed(2)}`,
      why: "Short-term momentum play. Looking for 5-7% gain over 2-3 weeks.",
      duration: "2-3 weeks",
    })),
    momentumLeaders: gainers.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      why: "Outperforming peers on positive price action and volume.",
      momentum: q.changePercent > 0 ? `+${q.changePercent.toFixed(2)}% today` : `${q.changePercent.toFixed(2)}% today`,
    })),
    hiddenGems: [
      { symbol: "PERSISTENT", name: "Persistent Systems", why: "Strong order book growth. Under-owned midcap IT.", catalyst: "AI/cloud deal wins, margin expansion" },
      { symbol: "VOLTAS", name: "Voltas Ltd", why: "Summer demand catalyst. Market leader in ACs.", catalyst: "Seasonal demand pickup, new product launches" },
    ],
    avoidList: losers.map((q) => ({
      symbol: q.symbol,
      reason: `Underperforming with ${q.changePercent.toFixed(2)}% move. Wait for stabilization. Add Gemini API for real AI reasoning.`,
    })),
    marketOutlook: "Indian markets remain resilient supported by strong domestic flows. Watch for RBI policy decisions and Q4 earnings season. FII activity and crude oil are key near-term drivers. Add your Gemini API key in Settings for real AI market analysis.",
  };
}
