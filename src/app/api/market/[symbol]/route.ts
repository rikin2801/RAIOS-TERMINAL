import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData, getFundamentals, getChartData } from "@/lib/market";
import type { ChartPeriod, ChartInterval } from "@/lib/market";
import { calculateAllIndicators } from "@/lib/technical";
import type { Exchange } from "@/lib/india";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const include = searchParams.get("include") ?? "quote";
  const exchange = (searchParams.get("exchange") ?? "NSE") as Exchange;

  try {
    if (include === "full") {
      const [quote, historical, fundamentals] = await Promise.all([
        getQuote(symbol, exchange),
        getHistoricalData(symbol, "1y", exchange),
        getFundamentals(symbol, exchange),
      ]);
      const indicators = historical.length > 50 ? calculateAllIndicators(historical) : null;
      return NextResponse.json({ quote, historical, fundamentals, indicators });
    }

    if (include === "historical") {
      const period = (searchParams.get("period") ?? "1y") as "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";
      const historical = await getHistoricalData(symbol, period, exchange);
      return NextResponse.json({ historical });
    }

    if (include === "chart") {
      const chartPeriod = (searchParams.get("period") ?? "1M") as ChartPeriod;
      const chartInterval = (searchParams.get("interval") ?? "1d") as ChartInterval;
      const [candles, quote] = await Promise.allSettled([
        getChartData(symbol, chartPeriod, chartInterval, exchange),
        getQuote(symbol, exchange),
      ]);
      return NextResponse.json({
        candles: candles.status === "fulfilled" ? candles.value : [],
        quote:   quote.status   === "fulfilled" ? quote.value   : null,
      });
    }

    const quote = await getQuote(symbol, exchange);
    return NextResponse.json(quote);
  } catch (error) {
    console.error(`Market data error for ${symbol}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch data for ${symbol}` },
      { status: 500 }
    );
  }
}
