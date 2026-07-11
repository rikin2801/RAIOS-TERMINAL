import { NextRequest, NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/market";

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  if (!message) return NextResponse.json({ error: "No message" }, { status: 400 });

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return NextResponse.json({
      reply: "Please add your Gemini API key to the .env file as GOOGLE_GENERATIVE_AI_API_KEY to use the AI chat.",
    });
  }

  // Fetch portfolio for context
  const holdings = await prisma.holding.findMany({ orderBy: { createdAt: "asc" } });

  let portfolioContext = "";
  if (holdings.length > 0) {
    const quotes = await Promise.allSettled(
      holdings.map((h) => getQuote(h.symbol, h.exchange as "NSE" | "BSE"))
    );
    const lines = holdings.map((h, i) => {
      const q = quotes[i].status === "fulfilled" ? quotes[i].value : null;
      const cur = q?.price ?? h.avgCost;
      const val = cur * h.shares;
      const gl = ((cur - h.avgCost) / h.avgCost * 100).toFixed(1);
      return `${h.symbol} (${h.exchange}): ${h.shares} shares @ ₹${h.avgCost}, current ₹${cur.toFixed(0)}, value ₹${val.toFixed(0)}, G/L ${gl}%, sector: ${h.sector ?? "Unknown"}`;
    });
    portfolioContext = `\n\nUSER PORTFOLIO:\n${lines.join("\n")}`;
  }

  const systemPrompt = `You are an expert Indian stock market investment advisor with deep knowledge of NSE, BSE, Nifty 50, Sensex, and Indian macroeconomics.

You advise on:
- Indian stocks (RELIANCE, TCS, HDFC, INFY, etc.)
- NSE/BSE listed companies
- Indian market regulations (SEBI)
- Indian economic factors (RBI policy, inflation, FII/DII flows)
- Portfolio allocation in INR (₹)
- Indian mutual funds, ETFs, bonds

Always use Indian number format (Lakh = 1,00,000; Crore = 1,00,00,000).
Use ₹ symbol for all currency values.
Be specific, data-driven, and actionable.
Keep responses concise (3-5 sentences max for simple questions, structured for complex ones).
${portfolioContext}`;

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      prompt: message,
    });
    return NextResponse.json({ reply: text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
