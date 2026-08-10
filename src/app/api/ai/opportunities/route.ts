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
    const errMsg = String(err);
    console.error("Opportunity generation failed:", err);
    if (errMsg.includes("429") || errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("resource_exhausted")) {
      return NextResponse.json(
        { error: "rate_limit", message: "Gemini API rate limit reached. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(getMockOpportunities(quoteSummary));
  }
}

function getMockOpportunities(quotes: { symbol: string; name: string; price: number; changePercent: number; pe: number | undefined; pctFrom52wHigh: string }[]): OpportunitiesData {
  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const topGainers = sorted.slice(0, 5);       // ranks 1–5: top buys
  const swingCandidates = sorted.slice(5, 8);  // ranks 6–8: swing trades (different stocks)
  const momentum = sorted.slice(0, 3);          // ranks 1–3: momentum leaders
  const midTier = sorted.slice(8, 11);          // ranks 9–11: hidden gems (moderate movers)
  const losers = sorted.slice(-2);              // bottom 2: avoid list
  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  return {
    generatedAt: today,
    topBuys: topGainers.map((q, i) => ({
      rank: i + 1,
      symbol: q.symbol,
      name: q.name,
      price: `₹${q.price.toFixed(2)}`,
      target: `₹${(q.price * 1.15).toFixed(2)}`,
      upside: "15%",
      why: `Showing relative strength today. Technical setup suggests continued upside. Enable Gemini AI in Settings for real analysis.`,
      risk: "Market volatility, sector rotation risk",
      timeframe: "6-12 months",
      conviction: i === 0 ? "HIGH" : "MEDIUM",
    })),
    swingTrades: swingCandidates.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      entry: `₹${(q.price * 0.99).toFixed(2)} - ₹${(q.price * 1.01).toFixed(2)}`,
      target: `₹${(q.price * 1.06).toFixed(2)}`,
      stopLoss: `₹${(q.price * 0.96).toFixed(2)}`,
      why: "Short-term momentum candidate. Enable Gemini AI for real swing trade reasoning.",
      duration: "2-3 weeks",
    })),
    momentumLeaders: momentum.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      why: "Outperforming the market on price and volume today.",
      momentum: q.changePercent > 0 ? `+${q.changePercent.toFixed(2)}% today` : `${q.changePercent.toFixed(2)}% today`,
    })),
    hiddenGems: midTier.slice(0, 2).map((q) => ({
      symbol: q.symbol,
      name: q.name,
      why: "Moderate mover with potential. Enable Gemini AI for real hidden gem analysis.",
      catalyst: "Enable Gemini AI in Settings for catalyst analysis",
    })),
    avoidList: losers.map((q) => ({
      symbol: q.symbol,
      reason: `Underperforming today (${q.changePercent.toFixed(2)}%). Wait for stabilization before entering.`,
    })),
    marketOutlook: "Indian markets showing mixed signals. Enable Gemini AI in Settings for real-time market outlook and actionable insights.",
  };
}
