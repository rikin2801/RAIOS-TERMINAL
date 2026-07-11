import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const hasAI = Boolean(apiKey && apiKey !== "your-gemini-api-key-here");

  let holdingsCount = 0;
  let dbOk = false;
  try {
    holdingsCount = await prisma.holding.count();
    dbOk = true;
  } catch { /* offline */ }

  return NextResponse.json({
    ai: { connected: hasAI, model: "gemini-2.5-flash", mode: hasAI ? "LIVE" : "MOCK" },
    marketData: { provider: "Yahoo Finance", exchanges: ["NSE", "BSE"], status: "OK" },
    database: { ok: dbOk, holdings: holdingsCount },
    version: "2.0.0",
    buildDate: new Date().toISOString().split("T")[0],
  });
}
