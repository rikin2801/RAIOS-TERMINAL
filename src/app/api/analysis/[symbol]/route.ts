import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData, getFundamentals, type AnalysisTimeframe } from "@/lib/market";
import { calculateAllIndicators } from "@/lib/technical";
import { runAIAnalysis } from "@/lib/ai-analysis";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";
import type { Exchange } from "@/lib/india";

function validateTimeframe(raw: string | null): AnalysisTimeframe {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "WEEKLY" || upper === "1W") return "WEEKLY";
  if (upper === "MONTHLY" || upper === "1M") return "MONTHLY";
  return "DAILY";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const exchange = (searchParams.get("exchange") ?? "NSE") as Exchange;
  const timeframe = validateTimeframe(searchParams.get("timeframe"));
  const portfolioId = await resolvePortfolioId(searchParams.get("portfolioId"));

  if (!force) {
    const cached = await prisma.aIAnalysis.findFirst({
      where: { symbol, timeframe },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      const ageMinutes = (Date.now() - cached.createdAt.getTime()) / 60000;
      const cacheTTL = timeframe === "DAILY" ? 60 : timeframe === "WEEKLY" ? 360 : 1440;
      if (ageMinutes < cacheTTL) {
        let rawMetrics: { indicators?: unknown; quote?: { price?: number; change?: number }; fundamentals?: unknown } = {};
        let reasoning: unknown = null;
        try { rawMetrics = JSON.parse(cached.rawMetrics); } catch { /**/ }
        try { reasoning = cached.reasoning ? JSON.parse(cached.reasoning) : null; } catch { /**/ }
        return NextResponse.json({
          ...cached,
          risks: JSON.parse(cached.risks),
          bullishFactors: JSON.parse(cached.bullishFactors),
          bearishFactors: JSON.parse(cached.bearishFactors),
          rawMetrics,
          indicators: rawMetrics.indicators,
          fundamentals: rawMetrics.fundamentals,
          reasoning,
          quote: rawMetrics.quote
            ? { symbol: cached.symbol, name: cached.symbol, price: rawMetrics.quote.price ?? 0, changePercent: rawMetrics.quote.change ?? 0, change: 0, open: 0, high: 0, low: 0, volume: 0, marketCap: 0, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0 }
            : undefined,
          timeframe,
          cached: true,
        });
      }
    }
  }

  try {
    const [quote, historical, fundamentals] = await Promise.all([
      getQuote(symbol, exchange),
      getHistoricalData(symbol, "1y", exchange, timeframe),
      getFundamentals(symbol, exchange),
    ]);

    if (historical.length < 20) {
      return NextResponse.json({ error: "Insufficient historical data for this timeframe" }, { status: 400 });
    }

    const indicators = calculateAllIndicators(historical);
    const analysis = await runAIAnalysis(quote, indicators, fundamentals);

    const rawMetrics = { indicators, fundamentals, quote: { price: quote.price, change: quote.changePercent } };

    await prisma.aIAnalysis.create({
      data: {
        symbol,
        portfolioId,
        timeframe,
        signal: analysis.signal,
        confidence: analysis.confidence,
        investmentScore: analysis.investmentScore,
        risks: JSON.stringify(analysis.risks),
        bullishFactors: JSON.stringify(analysis.bullishFactors),
        bearishFactors: JSON.stringify(analysis.bearishFactors),
        entryZone: analysis.entryZone,
        stopLoss: analysis.stopLoss,
        targetPrice: analysis.targetPrice,
        summary: analysis.summary,
        rawMetrics: JSON.stringify(rawMetrics),
      },
    });

    return NextResponse.json({
      ...analysis,
      indicators,
      fundamentals,
      quote,
      timeframe,
      cached: false,
    });
  } catch (error) {
    console.error(`Analysis error for ${symbol}:`, error);
    return NextResponse.json(
      { error: `Failed to analyze ${symbol}. Check the symbol and try again.` },
      { status: 500 }
    );
  }
}
