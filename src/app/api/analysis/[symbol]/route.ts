import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData, getFundamentals, getHourlyCandles, type AnalysisTimeframe } from "@/lib/market";
import { calculateAllIndicators, calculateRSI, calculateMACD, calculateStochastic } from "@/lib/technical";
import { runAIAnalysis, runPhase1Analysis } from "@/lib/ai-analysis";
import { getStockNews } from "@/lib/news";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";
import type { Exchange } from "@/lib/india";
import {
  analyzeMultiTimeframeTrend,
  classifyBusinessHealth,
  classifyPriceAttractiveness,
  computeEntryZone,
  computeClusteredSupportResistance,
} from "@/lib/trend-engine";

function validateTimeframe(raw: string | null): AnalysisTimeframe {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "WEEKLY" || upper === "1W") return "WEEKLY";
  if (upper === "MONTHLY" || upper === "1M") return "MONTHLY";
  return "DAILY";
}

function decisionToSignal(decision: string): string {
  if (decision === "BUY") return "BUY";
  if (decision === "WAIT") return "HOLD";
  if (decision === "HOLD") return "HOLD";
  if (decision === "BOOK_PROFITS") return "REDUCE";
  if (decision === "SELL") return "SELL";
  return "HOLD";
}

function decisionToScore(decision: string): number {
  const map: Record<string, number> = { BUY: 8, WAIT: 6, HOLD: 5, BOOK_PROFITS: 4, SELL: 2 };
  return map[decision] ?? 5;
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

  // ── Cache read ──────────────────────────────────────────────────────────────
  if (!force) {
    const cached = await prisma.aIAnalysis.findFirst({
      where: { symbol, timeframe },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      const ageMinutes = (Date.now() - cached.createdAt.getTime()) / 60000;
      const cacheTTL = timeframe === "DAILY" ? 60 : timeframe === "WEEKLY" ? 360 : 1440;
      if (ageMinutes < cacheTTL) {
        let rawMetrics: Record<string, unknown> = {};
        try { rawMetrics = JSON.parse(cached.rawMetrics); } catch { /**/ }

        // Phase 1 cached result — skip if it predates weekly/macdDir fields
        if (rawMetrics.version === "phase1") {
          const p1 = rawMetrics.result as Record<string, unknown>;
          const daily = p1.daily as Record<string, unknown> | undefined;
          const isUpToDate = p1.weekly !== undefined && daily?.macdDir !== undefined;
          if (isUpToDate) {
            return NextResponse.json({
              signal: cached.signal,
              confidence: cached.confidence,
              investmentScore: cached.investmentScore,
              risks: JSON.parse(cached.risks),
              bullishFactors: JSON.parse(cached.bullishFactors),
              bearishFactors: JSON.parse(cached.bearishFactors),
              entryZone: cached.entryZone,
              stopLoss: cached.stopLoss,
              targetPrice: cached.targetPrice,
              summary: cached.summary,
              indicators: rawMetrics.indicators,
              fundamentals: null,
              quote: rawMetrics.quote
                ? { symbol: cached.symbol, name: cached.symbol, ...(rawMetrics.quote as object) }
                : undefined,
              timeframe,
              cached: true,
              phase1: p1,
            });
          }
          // Stale cache — fall through to re-compute with new fields
        }

        // Legacy cached result
        let reasoning: unknown = null;
        try { reasoning = cached.reasoning ? JSON.parse(cached.reasoning) : null; } catch { /**/ }
        const q = rawMetrics.quote as { price?: number; change?: number } | undefined;
        return NextResponse.json({
          ...cached,
          risks: JSON.parse(cached.risks),
          bullishFactors: JSON.parse(cached.bullishFactors),
          bearishFactors: JSON.parse(cached.bearishFactors),
          rawMetrics,
          indicators: rawMetrics.indicators,
          fundamentals: rawMetrics.fundamentals,
          reasoning,
          quote: q
            ? { symbol: cached.symbol, name: cached.symbol, price: q.price ?? 0, changePercent: q.change ?? 0, change: 0, open: 0, high: 0, low: 0, volume: 0, marketCap: 0, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0 }
            : undefined,
          timeframe,
          cached: true,
        });
      }
    }
  }

  try {
    // ── Fetch all data in parallel ────────────────────────────────────────────
    const [quote, historical, fundamentals, hourlyCandles, weeklyCandles, news] = await Promise.all([
      getQuote(symbol, exchange),
      getHistoricalData(symbol, "1y", exchange, timeframe),
      getFundamentals(symbol, exchange),
      timeframe === "DAILY" ? getHourlyCandles(symbol, exchange) : Promise.resolve([]),
      timeframe === "DAILY" ? getHistoricalData(symbol, "2y", exchange, "WEEKLY") : Promise.resolve([]),
      getStockNews(symbol, "").catch(() => [] as Awaited<ReturnType<typeof getStockNews>>),
    ]);

    if (historical.length < 20) {
      return NextResponse.json({ error: "Insufficient historical data for this timeframe" }, { status: 400 });
    }

    // ── Daily indicators ─────────────────────────────────────────────────────
    const dailyIndicators = calculateAllIndicators(historical);
    const dClosesPrev = historical.slice(0, -1).map((c) => c.close);
    const { histogram: dMACDPrev } = calculateMACD(dClosesPrev);
    const dMACDDir: "RISING" | "FALLING" = dailyIndicators.macdHistogram >= dMACDPrev ? "RISING" : "FALLING";

    // ── Weekly indicators ─────────────────────────────────────────────────────
    let weeklyResult: { rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number } | null = null;
    if (weeklyCandles.length >= 35) {
      const wCloses = weeklyCandles.map((c) => c.close);
      const wHighs  = weeklyCandles.map((c) => c.high);
      const wLows   = weeklyCandles.map((c) => c.low);
      const wRSI = calculateRSI(wCloses);
      const { histogram: wMACDHist } = calculateMACD(wCloses);
      const { histogram: wMACDPrev } = calculateMACD(wCloses.slice(0, -1));
      const { k: wStochK } = calculateStochastic(wHighs, wLows, wCloses);
      weeklyResult = {
        rsi: Math.round(wRSI * 10) / 10,
        macdHist: Math.round(wMACDHist * 1000) / 1000,
        macdBullish: wMACDHist > 0,
        macdDir: wMACDHist >= wMACDPrev ? "RISING" : "FALLING",
        stochK: Math.round(wStochK * 10) / 10,
      };
    }

    // ── Hourly indicators ─────────────────────────────────────────────────────
    let hourlyResult: { rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number } | null = null;
    if (hourlyCandles.length >= 50) {
      const hCloses = hourlyCandles.map((c) => c.close);
      const hHighs = hourlyCandles.map((c) => c.high);
      const hLows = hourlyCandles.map((c) => c.low);
      const hRSI = calculateRSI(hCloses);
      const { histogram: hMACDHist } = calculateMACD(hCloses);
      const { histogram: hMACDPrev } = calculateMACD(hCloses.slice(0, -1));
      const { k: hStochK } = calculateStochastic(hHighs, hLows, hCloses);
      hourlyResult = {
        rsi: Math.round(hRSI * 10) / 10,
        macdHist: Math.round(hMACDHist * 1000) / 1000,
        macdBullish: hMACDHist > 0,
        macdDir: hMACDHist >= hMACDPrev ? "RISING" : "FALLING",
        stochK: Math.round(hStochK * 10) / 10,
      };
    }

    // ── Phase 1 engine ────────────────────────────────────────────────────────
    const trendAnalysis = analyzeMultiTimeframeTrend(historical);
    const { health: businessHealth, summary: businessSummary } = classifyBusinessHealth(fundamentals);
    const { attractiveness: priceAttractiveness, summary: priceSummary } = classifyPriceAttractiveness(
      quote.price,
      quote.fiftyTwoWeekHigh,
      quote.fiftyTwoWeekLow,
      fundamentals?.analystTarget
    );
    const { support, resistance } = computeClusteredSupportResistance(historical);
    const entryZone = computeEntryZone(quote.price, support);

    // ── Gemini Phase 1 decision ───────────────────────────────────────────────
    const gemini = await runPhase1Analysis({
      quote,
      trend: trendAnalysis,
      businessHealth,
      businessSummary,
      priceAttractiveness,
      priceSummary,
      analystTarget: fundamentals?.analystTarget ?? null,
      analystCount: fundamentals?.analystCount ?? null,
      analystConsensus: fundamentals?.analystConsensus ?? null,
      news,
      dailyRSI: dailyIndicators.rsi,
      dailyStochK: dailyIndicators.stochastic,
    });

    // ── Build full Phase 1 result ─────────────────────────────────────────────
    const phase1 = {
      decision: gemini.decision,
      whatChanged: gemini.whatChanged,
      whyDecision: gemini.whyDecision,
      whatWouldChange: gemini.whatWouldChange,
      targets: gemini.targets,
      trend: {
        oneMonth: { trend: trendAnalysis.oneMonth.trend, evidence: trendAnalysis.oneMonth.evidence },
        threeMonths: { trend: trendAnalysis.threeMonths.trend, evidence: trendAnalysis.threeMonths.evidence },
        sixMonths: { trend: trendAnalysis.sixMonths.trend, evidence: trendAnalysis.sixMonths.evidence },
        oneYear: { trend: trendAnalysis.oneYear.trend, evidence: trendAnalysis.oneYear.evidence },
        primary: trendAnalysis.primary,
      },
      businessHealth,
      businessSummary,
      priceAttractiveness,
      priceSummary,
      entryZone: { low: entryZone.low, high: entryZone.high },
      confirmationLevel: entryZone.confirmationLevel,
      support,
      resistance,
      daily: {
        rsi: Math.round(dailyIndicators.rsi * 10) / 10,
        macdHist: Math.round(dailyIndicators.macdHistogram * 1000) / 1000,
        macdBullish: dailyIndicators.macdHistogram > 0,
        macdDir: dMACDDir,
        stochK: Math.round(dailyIndicators.stochastic * 10) / 10,
      },
      weekly: weeklyResult,
      hourly: hourlyResult,
      analystTarget: fundamentals?.analystTarget ?? null,
      analystCount: fundamentals?.analystCount ?? null,
      analystConsensus: fundamentals?.analystConsensus ?? null,
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      pe: quote.pe ?? null,
    };

    // ── Backward-compatible fields (for portfolio.tsx) ────────────────────────
    const signalCompat = decisionToSignal(gemini.decision);
    const midpoint6M = Math.round((gemini.targets.sixMonths.low + gemini.targets.sixMonths.high) / 2);
    const entryZoneStr = `₹${entryZone.low.toFixed(0)}–₹${entryZone.high.toFixed(0)}`;
    const summary = `${gemini.decision}: ${gemini.whatChanged}`;

    // ── Persist to DB ─────────────────────────────────────────────────────────
    const rawMetrics = JSON.stringify({
      version: "phase1",
      result: phase1,
      indicators: dailyIndicators,
      quote: { price: quote.price, change: quote.change, changePercent: quote.changePercent, symbol: quote.symbol, name: quote.name, fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh, fiftyTwoWeekLow: quote.fiftyTwoWeekLow, open: quote.open, high: quote.high, low: quote.low, volume: quote.volume },
    });

    await prisma.aIAnalysis.create({
      data: {
        symbol,
        portfolioId,
        timeframe,
        signal: signalCompat,
        confidence: 80,
        investmentScore: decisionToScore(gemini.decision),
        risks: JSON.stringify(gemini.whatWouldChange),
        bullishFactors: JSON.stringify(gemini.whyDecision.slice(0, 3)),
        bearishFactors: JSON.stringify(gemini.whatWouldChange),
        entryZone: entryZoneStr,
        stopLoss: support,
        targetPrice: midpoint6M,
        summary,
        rawMetrics,
      },
    });

    return NextResponse.json({
      // Backward-compatible fields
      signal: signalCompat,
      confidence: 80,
      investmentScore: decisionToScore(gemini.decision),
      risks: gemini.whatWouldChange,
      bullishFactors: gemini.whyDecision.slice(0, 3),
      bearishFactors: gemini.whatWouldChange,
      entryZone: entryZoneStr,
      stopLoss: support,
      targetPrice: midpoint6M,
      summary,
      indicators: dailyIndicators,
      fundamentals,
      quote,
      timeframe,
      cached: false,
      // Phase 1 data
      phase1,
    });
  } catch (error) {
    console.error(`Analysis error for ${symbol}:`, error);

    // Graceful fallback: try old engine if Phase 1 fails completely
    try {
      const [quote, historical, fundamentals] = await Promise.all([
        getQuote(symbol, exchange),
        getHistoricalData(symbol, "1y", exchange, timeframe),
        getFundamentals(symbol, exchange),
      ]);
      if (historical.length >= 20) {
        const indicators = calculateAllIndicators(historical);
        const analysis = await runAIAnalysis(quote, indicators, fundamentals, []);
        return NextResponse.json({ ...analysis, indicators, fundamentals, quote, timeframe, cached: false });
      }
    } catch { /**/ }

    return NextResponse.json(
      { error: `Failed to analyze ${symbol}. Check the symbol and try again.` },
      { status: 500 }
    );
  }
}
