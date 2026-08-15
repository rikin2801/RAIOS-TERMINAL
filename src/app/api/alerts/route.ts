import { NextRequest, NextResponse } from "next/server";
import { getQuote, getHistoricalData } from "@/lib/market";
import { calculateRSI, calculateStochastic, calculateSMA } from "@/lib/technical";
import { computeClusteredSupportResistance, computeEntryZone } from "@/lib/trend-engine";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";

export interface StockAlert {
  symbol: string;
  name: string;
  price: number;
  type: "ENTRY_ZONE" | "PROFIT_ALERT" | "EXIT_SIGNAL" | "CONFIRMATION_BREAK";
  severity: "green" | "amber" | "red";
  title: string;
  message: string;
}

// 10-minute in-memory cache so polling doesn't hammer APIs
let _cache: { alerts: StockAlert[]; ts: number } | null = null;
const TTL_MS = 10 * 60_000;

async function checkSymbol(
  symbol: string,
  exchange: string,
  avgCost: number,
): Promise<StockAlert[]> {
  const alerts: StockAlert[] = [];

  try {
    const [quote, daily] = await Promise.all([
      getQuote(symbol, exchange as "NSE" | "BSE"),
      getHistoricalData(symbol, "1y", exchange as "NSE" | "BSE", "DAILY"),
    ]);

    if (daily.length < 20) return [];

    const closes = daily.map((c) => c.close);
    const highs  = daily.map((c) => c.high);
    const lows   = daily.map((c) => c.low);

    const rsi   = calculateRSI(closes);
    const { k: stoch } = calculateStochastic(highs, lows, closes);
    const sma50 = calculateSMA(closes, 50);

    const price = quote.price;
    const { fiftyTwoWeekHigh, fiftyTwoWeekLow } = quote;
    const rangeSpan     = fiftyTwoWeekHigh - fiftyTwoWeekLow || 1;
    const rangePosition = ((price - fiftyTwoWeekLow) / rangeSpan) * 100;

    // ── Pull Phase 1 cached entry zone from DB ───────────────────────────────
    const cached = await prisma.aIAnalysis.findFirst({
      where: { symbol },
      orderBy: { createdAt: "desc" },
    });

    let entryLow: number | null = null;
    let entryHigh: number | null = null;
    let confirmationLevel: number | null = null;

    if (cached?.rawMetrics) {
      try {
        const raw = JSON.parse(cached.rawMetrics);
        const p1 = raw?.result;
        if (p1?.entryZone) {
          entryLow = p1.entryZone.low;
          entryHigh = p1.entryZone.high;
          confirmationLevel = p1.confirmationLevel;
        }
      } catch { /* ignore */ }
    }

    // Fallback: compute from current support
    if (!entryLow || !entryHigh) {
      const { support } = computeClusteredSupportResistance(daily);
      const zone = computeEntryZone(price, support);
      entryLow  = zone.low;
      entryHigh = zone.high;
      confirmationLevel = zone.confirmationLevel;
    }

    // ── 1. Entry zone alert — price dropped into the buy zone ────────────────
    if (entryLow && entryHigh && price >= entryLow && price <= entryHigh) {
      alerts.push({
        symbol, name: quote.name, price,
        type: "ENTRY_ZONE",
        severity: "green",
        title: `${symbol} in entry zone`,
        message: `Price ₹${price.toFixed(0)} has entered the preferred entry zone ₹${entryLow.toFixed(0)}–₹${entryHigh.toFixed(0)}. RSI ${rsi.toFixed(1)} — consider adding.`,
      });
    }

    // ── 2. Confirmation break — price broke above confirmation level ─────────
    if (confirmationLevel && price > confirmationLevel && avgCost > 0) {
      const pctAbove = ((price - confirmationLevel) / confirmationLevel) * 100;
      if (pctAbove < 3) {
        alerts.push({
          symbol, name: quote.name, price,
          type: "CONFIRMATION_BREAK",
          severity: "green",
          title: `${symbol} broke confirmation level`,
          message: `Price ₹${price.toFixed(0)} broke above confirmation level ₹${confirmationLevel.toFixed(0)} — next leg may have started.`,
        });
      }
    }

    // ── 3. Profit booking alert — momentum extended for existing holders ──────
    if (avgCost > 0) {
      const gainPct = ((price - avgCost) / avgCost) * 100;
      if (gainPct > 5) {
        // EXIT signal
        if ((!(price > sma50) && rsi > 68) || rangePosition > 92) {
          alerts.push({
            symbol, name: quote.name, price,
            type: "EXIT_SIGNAL",
            severity: "red",
            title: `${symbol} — consider exiting`,
            message: `Up ${gainPct.toFixed(1)}% from avg ₹${avgCost.toFixed(0)}. RSI ${rsi.toFixed(1)} + range at ${rangePosition.toFixed(0)}% of 52W. Review position urgently.`,
          });
        }
        // PROFIT ALERT
        else if ((rsi > 70 && stoch > 78) || rsi > 75 || (rangePosition > 85 && rsi > 60)) {
          alerts.push({
            symbol, name: quote.name, price,
            type: "PROFIT_ALERT",
            severity: "amber",
            title: `${symbol} — consider partial booking`,
            message: `Up ${gainPct.toFixed(1)}% from avg ₹${avgCost.toFixed(0)}. RSI ${rsi.toFixed(1)}, Stoch ${stoch.toFixed(1)} — momentum extended. Consider booking 25–30%.`,
          });
        }
      }
    }
  } catch { /* symbol unavailable — skip silently */ }

  return alerts;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const portfolioId = await resolvePortfolioId(searchParams.get("portfolioId"));
  const force = searchParams.get("force") === "true";

  if (!force && _cache && Date.now() - _cache.ts < TTL_MS) {
    return NextResponse.json({ alerts: _cache.alerts, cached: true });
  }

  try {
    const holdings = await prisma.holding.findMany({
      where: portfolioId ? { portfolioId } : {},
      select: { symbol: true, exchange: true, avgCost: true, shares: true },
    });

    // Deduplicate — same symbol may appear across portfolios
    const seen = new Set<string>();
    const unique = holdings.filter((h) => {
      const key = `${h.symbol}:${h.exchange}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const results = await Promise.all(
      unique.map((h) => checkSymbol(h.symbol, h.exchange, h.avgCost))
    );

    const alerts = results.flat();
    _cache = { alerts, ts: Date.now() };

    return NextResponse.json({ alerts, cached: false });
  } catch (error) {
    console.error("[alerts]", error);
    return NextResponse.json({ alerts: [], error: "Failed to compute alerts" }, { status: 500 });
  }
}
