"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortfolio } from "@/contexts/portfolio-context";
import { formatCurrency, formatPercent, formatCurrencyCompact } from "@/lib/utils";
import type { Holding, HoldingWithMarket, Watchlist } from "@/types";
import type { DecisionData } from "@/app/api/ai/decision/route";
import {
  TrendingUp, TrendingDown, Activity, Star, Plus, Trash2,
  RefreshCw, Shield, Zap, AlertTriangle, ArrowRight,
} from "lucide-react";
import { StockChartModal } from "@/components/charts/stock-chart-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

const DECISION_ACTION_STYLES: Record<string, string> = {
  BUY:                 "text-green-400 bg-green-400/10 border-green-400/30",
  ACCUMULATE:          "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  HOLD:                "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  REDUCE:              "text-orange-400 bg-orange-400/10 border-orange-400/30",
  BOOK_PARTIAL_PROFIT: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  SELL:                "text-red-400 bg-red-400/10 border-red-400/30",
  WAIT:                "text-blue-400 bg-blue-400/10 border-blue-400/30",
  WATCH:               "text-blue-400 bg-blue-400/10 border-blue-400/30",
};

const SECTOR_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const stroke = score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";
  const textColor = score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle
            cx="28" cy="28" r="24" fill="none"
            stroke={stroke}
            strokeWidth="5"
            strokeDasharray={`${(score / 100) * 150.8} 150.8`}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${textColor}`}>
          {score}
        </span>
      </div>
      <div>
        <p className={`font-semibold text-sm ${textColor}`}>{color}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function computeScores(holdings: HoldingWithMarket[]): { health: number; risk: number } {
  if (holdings.length === 0) return { health: 0, risk: 50 };

  // Health
  let health = 50;
  const winners = holdings.filter((h) => h.gainLoss > 0).length;
  health += (winners / holdings.length) * 20;
  const avgGL = holdings.reduce((s, h) => s + h.gainLossPercent, 0) / holdings.length;
  health += Math.min(Math.max(avgGL, -20), 20);
  const sectors = new Set(holdings.map((h) => h.sector ?? "Other")).size;
  health += Math.min(sectors * 2, 10);

  // Risk (lower = safer)
  let risk = 50;
  const concentration = holdings.length > 0
    ? (holdings[0]?.currentValue ?? 0) / Math.max(holdings.reduce((s, h) => s + h.currentValue, 0), 1) * 100
    : 0;
  risk += concentration > 50 ? 20 : concentration > 30 ? 10 : 0;
  risk -= sectors > 5 ? 10 : 0;
  risk += avgGL < -10 ? 10 : 0;

  return {
    health: Math.min(Math.max(Math.round(health), 0), 100),
    risk: Math.min(Math.max(Math.round(risk), 0), 100),
  };
}

export default function DashboardPage() {
  const { activePortfolioId, activePortfolio } = usePortfolio();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({});
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [watchQuotes, setWatchQuotes] = useState<Record<string, { price: number; changePercent: number }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decisionData, setDecisionData] = useState<DecisionData | null>(null);
  const [watchInput, setWatchInput] = useState("");
  const [activeListId, setActiveListId] = useState<string>("");
  const [addingWatch, setAddingWatch] = useState(false);
  const [chartSymbol, setChartSymbol] = useState<{ symbol: string; exchange?: string; name?: string } | null>(null);
  const [drillDownSymbol, setDrillDownSymbol] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const holdingsUrl = activePortfolioId
      ? `/api/holdings?portfolioId=${activePortfolioId}`
      : "/api/holdings";
    const decUrl = activePortfolioId
      ? `/api/ai/decision?portfolioId=${activePortfolioId}&quick=1`
      : `/api/ai/decision?quick=1`;
    const [hRes, wRes, decRes] = await Promise.all([
      fetch(holdingsUrl),
      fetch("/api/watchlist"),
      fetch(decUrl),
    ]);
    const [hData, wData] = await Promise.all([hRes.json(), wRes.json()]);
    setHoldings(hData);
    setWatchlists(wData);
    if (!activeListId && wData.length > 0) setActiveListId(wData[0].id);
    if (decRes.ok) {
      const decData = await decRes.json();
      if (!decData.error) setDecisionData(decData);
    }
    setLoading(false);
  }, [activePortfolioId, activeListId]);

  const fetchQuotesFor = useCallback(async (
    items: { symbol: string; exchange?: string }[],
    setter: (q: Record<string, { price: number; change: number; changePercent: number }>) => void
  ) => {
    const results = await Promise.allSettled(
      items.map((h) =>
        fetch(`/api/market/${h.symbol}?exchange=${h.exchange ?? "NSE"}`).then((r) => r.json())
      )
    );
    const map: Record<string, { price: number; change: number; changePercent: number }> = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.price) {
        map[items[i].symbol] = { price: r.value.price, change: r.value.change, changePercent: r.value.changePercent };
      }
    });
    setter(map);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (holdings.length > 0)
      fetchQuotesFor(holdings, setQuotes);
  }, [holdings, fetchQuotesFor]);

  useEffect(() => {
    const activeList = watchlists.find((l) => l.id === activeListId);
    if (activeList && activeList.items.length > 0)
      fetchQuotesFor(activeList.items, setWatchQuotes as never);
  }, [watchlists, activeListId, fetchQuotesFor]);

  // Auto-refresh quotes every 10 min during market hours (9:15–15:30 IST, Mon–Fri)
  useEffect(() => {
    if (holdings.length === 0) return;
    const isMarketHours = () => {
      const now = new Date();
      if ([0, 6].includes(now.getDay())) return false;
      const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
      return istMin >= 555 && istMin <= 930; // 9:15–15:30
    };
    const timer = setInterval(() => {
      if (!isMarketHours()) return;
      fetchQuotesFor(holdings, setQuotes);
      const activeList = watchlists.find(l => l.id === activeListId);
      if (activeList?.items.length) fetchQuotesFor(activeList.items, setWatchQuotes as never);
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [holdings, watchlists, activeListId, fetchQuotesFor]);

  // Morning Brief notification — fires once per day between 9:00–10:30 AM IST
  useEffect(() => {
    if (!decisionData || typeof window === "undefined") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("raios_morning_brief_date") === today) return;
    const istMin = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 330) % 1440;
    if (istMin < 540 || istMin > 630) return; // 9:00–10:30 AM IST
    const urgent = decisionData.todayDecisions.filter(d => d.urgency === "URGENT" || d.urgency === "HIGH");
    if (urgent.length > 0) {
      new Notification("RAIOS Morning Brief", {
        body: `${urgent.length} action${urgent.length > 1 ? "s" : ""} needed: ${urgent.slice(0, 3).map(u => `${u.action.replace(/_/g, " ")} ${u.symbol}`).join(", ")}`,
        tag: "raios-morning-brief",
        icon: "/globe.svg",
      });
    } else {
      new Notification("RAIOS Morning Brief", {
        body: `All ${decisionData.todayDecisions.length} positions are HOLD or WAIT — no urgent actions today.`,
        tag: "raios-morning-brief",
        icon: "/globe.svg",
      });
    }
    localStorage.setItem("raios_morning_brief_date", today);
  }, [decisionData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const activeList = watchlists.find((l) => l.id === activeListId);
    const decUrl = activePortfolioId
      ? `/api/ai/decision?portfolioId=${activePortfolioId}&quick=1`
      : `/api/ai/decision?quick=1`;
    await Promise.all([
      holdings.length > 0 ? fetchQuotesFor(holdings, setQuotes) : Promise.resolve(),
      activeList?.items.length ? fetchQuotesFor(activeList.items, setWatchQuotes as never) : Promise.resolve(),
      fetch(decUrl).then(r => r.ok ? r.json() : null).then(d => { if (d && !d.error) setDecisionData(d); }),
    ]);
    setRefreshing(false);
  };

  const enriched: HoldingWithMarket[] = holdings.map((h) => {
    const q = quotes[h.symbol];
    const currentPrice = q?.price ?? h.avgCost;
    const currentValue = currentPrice * h.shares;
    const totalCost = h.avgCost * h.shares;
    const gainLoss = currentValue - totalCost;
    const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
    const dayChange = (q?.change ?? 0) * h.shares;
    const dayChangePercent = q?.changePercent ?? 0;
    return { ...h, currentPrice, currentValue, totalCost, gainLoss, gainLossPercent, dayChange, dayChangePercent };
  });

  const totalValue = enriched.reduce((s, h) => s + h.currentValue, 0);
  const totalCost = enriched.reduce((s, h) => s + h.totalCost, 0);
  const totalGL = totalValue - totalCost;
  const totalGLPct = totalCost > 0 ? (totalGL / totalCost) * 100 : 0;
  const dayGL = enriched.reduce((s, h) => s + h.dayChange, 0);
  const dayGLPct = totalValue > 0 ? (dayGL / (totalValue - dayGL)) * 100 : 0;
  const { health: healthScore, risk: riskScore } = computeScores(enriched);

  // Sector allocation
  const sectorMap: Record<string, number> = {};
  enriched.forEach((h) => {
    const s = h.sector ?? "Other";
    sectorMap[s] = (sectorMap[s] ?? 0) + h.currentValue;
  });
  const sectorData = Object.entries(sectorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      value,
      pct: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0",
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));

  // Top 5 by value for allocation pie
  const topAlloc = [...enriched]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 6)
    .map((h, i) => ({
      name: h.symbol,
      value: h.currentValue,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));

  const topGainers = [...enriched].sort((a, b) => b.gainLossPercent - a.gainLossPercent).slice(0, 3);
  const topLosers = [...enriched].sort((a, b) => a.gainLossPercent - b.gainLossPercent).slice(0, 3);
  const topHoldings = [...enriched].sort((a, b) => b.currentValue - a.currentValue).slice(0, 5);

  const handleAddWatch = async () => {
    const sym = watchInput.trim().toUpperCase();
    if (!sym || !activeListId) return;
    setAddingWatch(true);
    try {
      const qRes = await fetch(`/api/market/${sym}?exchange=NSE`);
      if (!qRes.ok) throw new Error("Symbol not found");
      const q = await qRes.json();
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, name: q.name ?? sym, watchlistId: activeListId }),
      });
      setWatchInput("");
      await fetchAll();
    } catch {
      alert("Could not find symbol. Check the ticker and try again.");
    } finally {
      setAddingWatch(false);
    }
  };

  const handleRemoveWatch = async (id: string) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const activeList = watchlists.find((l) => l.id === activeListId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {activePortfolio?.name ?? "Portfolio"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="metric-label">Portfolio Value</p>
          <p className="metric-value">{formatCurrencyCompact(totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{holdings.length} positions</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="metric-label">Today&apos;s Gain/Loss</p>
          <p className={`metric-value ${dayGL >= 0 ? "gain" : "loss"}`}>{formatCurrencyCompact(dayGL)}</p>
          <p className={`text-sm ${dayGL >= 0 ? "gain" : "loss"}`}>{formatPercent(dayGLPct)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="metric-label">Total Gain/Loss</p>
          <p className={`metric-value ${totalGL >= 0 ? "gain" : "loss"}`}>{formatCurrencyCompact(totalGL)}</p>
          <p className={`text-sm ${totalGL >= 0 ? "gain" : "loss"}`}>{formatPercent(totalGLPct)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <ScoreGauge score={healthScore} label="Health" color={healthScore >= 70 ? "Healthy" : healthScore >= 40 ? "Moderate" : "At Risk"} />
          <div className="w-px h-10 bg-border" />
          <ScoreGauge score={riskScore} label="Risk" color={riskScore >= 70 ? "High Risk" : riskScore >= 40 ? "Medium" : "Low Risk"} />
        </div>
      </div>

      {/* TODAY'S COMMAND CENTRE — Decision Engine (quick mode) */}
      {decisionData && enriched.length > 0 && (() => {
        const urgentActions = decisionData.todayDecisions.filter(
          d => d.urgency === "URGENT" || d.urgency === "HIGH"
        );
        return (
          <div className="space-y-3">
            {/* Urgent/High priority alert banner */}
            {urgentActions.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-xs font-bold text-red-400 mb-2.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> REQUIRES ATTENTION TODAY
                </p>
                <div className="flex flex-col gap-1.5">
                  {urgentActions.map(a => (
                    <div key={a.symbol} className="flex items-start gap-2 text-xs">
                      <span className={`shrink-0 font-bold px-2 py-0.5 rounded border font-mono text-[10px] ${DECISION_ACTION_STYLES[a.action] ?? "text-muted-foreground border-border"}`}>
                        {a.action.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono font-semibold text-foreground">{a.symbol}</span>
                      <span className="text-muted-foreground leading-relaxed">{a.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3-card portfolio intelligence strip — click any card for full AI breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setDrillDownSymbol(decisionData.topOpportunity.symbol)}
                className="bg-card border border-green-400/20 rounded-lg p-3 text-left hover:border-green-400/50 hover:bg-green-400/5 transition-colors group"
              >
                <p className="text-[10px] font-bold text-green-400 mb-1 flex items-center gap-1">
                  <Star className="h-3 w-3" /> TOP OPPORTUNITY
                  <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="font-mono font-bold">{decisionData.topOpportunity.symbol}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {decisionData.topOpportunity.why}
                </p>
                <p className="text-xs text-green-400 font-mono mt-1">{decisionData.topOpportunity.confidence}% confidence</p>
              </button>
              <button
                onClick={() => setDrillDownSymbol(decisionData.highestRisk.symbol)}
                className="bg-card border border-red-400/20 rounded-lg p-3 text-left hover:border-red-400/50 hover:bg-red-400/5 transition-colors group"
              >
                <p className="text-[10px] font-bold text-red-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> HIGHEST RISK
                  <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="font-mono font-bold">{decisionData.highestRisk.symbol}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {decisionData.highestRisk.why}
                </p>
                <p className="text-xs text-red-400/70 font-mono mt-1 text-[10px]">Tap for full breakdown</p>
              </button>
              <button
                onClick={() => setDrillDownSymbol(decisionData.highestConviction.symbol)}
                className="bg-card border border-yellow-400/20 rounded-lg p-3 text-left hover:border-yellow-400/50 hover:bg-yellow-400/5 transition-colors group"
              >
                <p className="text-[10px] font-bold text-yellow-400 mb-1 flex items-center gap-1">
                  <Zap className="h-3 w-3" /> HIGHEST CONVICTION
                  <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-bold">{decisionData.highestConviction.symbol}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DECISION_ACTION_STYLES[decisionData.highestConviction.action] ?? "text-muted-foreground border-border"}`}>
                    {decisionData.highestConviction.action.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                  {decisionData.highestConviction.why}
                </p>
                <p className="text-xs text-yellow-400 font-mono mt-1">{decisionData.highestConviction.confidence}% confidence</p>
              </button>
            </div>

            <div className="flex justify-end">
              <Link href="/portfolio-manager">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  Full Action Plan → AI Portfolio Manager <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Charts Row */}
      {enriched.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sector Allocation */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Sector Allocation
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sectorData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                  {sectorData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrencyCompact(v as number)} />
                <Legend
                  formatter={(v) => {
                    const s = sectorData.find((d) => d.name === v);
                    return `${v} (${s?.pct}%)`;
                  }}
                  iconSize={10}
                  wrapperStyle={{ fontSize: "11px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Portfolio Allocation */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" /> Stock Allocation
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={topAlloc} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                  {topAlloc.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrencyCompact(v as number)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Gainers/Losers Row */}
      {enriched.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 gain" /> Top Gainers
            </h2>
            <div className="space-y-2">
              {topGainers.map((h) => (
                <div key={h.id} className="flex items-center justify-between">
                  <div>
                    <button onClick={() => setChartSymbol({ symbol: h.symbol, exchange: h.exchange, name: h.name })} className="font-mono font-semibold text-primary hover:underline text-sm">
                      {h.symbol}
                    </button>
                    <p className="text-xs text-muted-foreground">{h.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatCurrency(h.currentPrice)}</p>
                    <p className="text-xs gain">{formatPercent(h.gainLossPercent)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 loss" /> Top Losers
            </h2>
            <div className="space-y-2">
              {topLosers.map((h) => (
                <div key={h.id} className="flex items-center justify-between">
                  <div>
                    <button onClick={() => setChartSymbol({ symbol: h.symbol, exchange: h.exchange, name: h.name })} className="font-mono font-semibold text-primary hover:underline text-sm">
                      {h.symbol}
                    </button>
                    <p className="text-xs text-muted-foreground">{h.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatCurrency(h.currentPrice)}</p>
                    <p className="text-xs loss">{formatPercent(h.gainLossPercent)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold">Top Holdings</h2>
            <Link href="/portfolio">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Day</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Total G/L</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : topHoldings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      <p>No holdings yet.</p>
                      <Link href="/portfolio">
                        <Button variant="outline" size="sm" className="mt-2">
                          <Plus className="h-3 w-3 mr-1" /> Add Holding
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  topHoldings.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <button onClick={() => setChartSymbol({ symbol: h.symbol, exchange: h.exchange, name: h.name })} className="font-mono font-semibold text-primary hover:underline">
                          {h.symbol}
                        </button>
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">{h.name}</p>
                      </td>
                      <td className="text-right font-mono">{formatCurrency(h.currentPrice)}</td>
                      <td className={`text-right ${h.dayChangePercent >= 0 ? "gain" : "loss"}`}>
                        {h.dayChangePercent >= 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                        {formatPercent(h.dayChangePercent)}
                      </td>
                      <td className="text-right">{formatCurrencyCompact(h.currentValue)}</td>
                      <td className={`text-right ${h.gainLoss >= 0 ? "gain" : "loss"}`}>
                        {formatPercent(h.gainLossPercent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Named Watchlist */}
        <div className="rounded-lg border border-border bg-card flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Star className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
              {watchlists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveListId(l.id)}
                  className={`text-xs px-2 py-1 rounded whitespace-nowrap transition-colors ${activeListId === l.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 flex-1 space-y-1">
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="NSE symbol..."
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleAddWatch()}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={handleAddWatch} disabled={addingWatch || !activeListId}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {!activeList || activeList.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No symbols in this list.</p>
            ) : (
              activeList.items.map((w) => {
                const q = watchQuotes[w.symbol];
                return (
                  <div key={w.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent/50">
                    <div>
                      <button onClick={() => setChartSymbol({ symbol: w.symbol, name: w.name })} className="text-sm font-mono font-semibold text-primary hover:underline">
                        {w.symbol}
                      </button>
                      <p className="text-xs text-muted-foreground truncate max-w-[90px]">{w.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {q ? (
                        <div className="text-right">
                          <p className="text-sm font-mono">{formatCurrency(q.price)}</p>
                          <p className={`text-xs ${q.changePercent >= 0 ? "gain" : "loss"}`}>
                            {formatPercent(q.changePercent)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => handleRemoveWatch(w.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Explainable AI Drill-Down Modal */}
      {drillDownSymbol && decisionData && (() => {
        const d = decisionData.todayDecisions.find(x => x.symbol === drillDownSymbol);
        if (!d) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDrillDownSymbol(null)}
          >
            <div
              className="bg-card border border-border rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-lg">{d.symbol}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${DECISION_ACTION_STYLES[d.action] ?? "text-muted-foreground border-border"}`}>
                      {d.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {d.analysisTimeframe}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.priceLevel} · {d.confidence}% confidence · Risk: <span className={d.riskLevel === "HIGH" ? "text-red-400" : d.riskLevel === "MEDIUM" ? "text-yellow-400" : "text-green-400"}>{d.riskLevel}</span></p>
                </div>
                <button
                  onClick={() => setDrillDownSymbol(null)}
                  className="text-muted-foreground hover:text-foreground text-2xl leading-none ml-4"
                >
                  ×
                </button>
              </div>

              {/* Reason */}
              <p className="text-sm leading-relaxed border-b border-border pb-4">{d.reason}</p>

              {/* 2-col grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Your Position</p>
                  <p className="text-xs leading-relaxed">{d.portfolioContext}</p>
                  <p className="text-xs text-green-400 mt-1.5">{d.expectedReward}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Hold: {d.holdingPeriod}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Why Now?</p>
                  <p className="text-xs leading-relaxed">{d.whyNow}</p>
                </div>
              </div>

              {/* Technical */}
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5">Technical Signals</p>
                <p className="text-xs font-mono leading-relaxed text-foreground/80">{d.technicalSignal}</p>
              </div>

              {/* Invalidation */}
              <div className="bg-yellow-900/10 border border-yellow-900/30 rounded-lg p-3">
                <p className="text-[10px] font-bold text-yellow-400 mb-1">What would change this?</p>
                <p className="text-xs leading-relaxed">{d.whatCouldInvalidate}</p>
              </div>

              {/* Verdict */}
              <div className="bg-primary/5 border border-primary/30 rounded-lg p-3">
                <p className="text-[10px] font-bold text-primary mb-1">AI VERDICT</p>
                <p className="text-sm font-medium leading-relaxed">{d.finalVerdict}</p>
              </div>

              <button
                onClick={() => setDrillDownSymbol(null)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}

      {chartSymbol && (
        <StockChartModal
          symbol={chartSymbol.symbol}
          exchange={chartSymbol.exchange}
          name={chartSymbol.name}
          onClose={() => setChartSymbol(null)}
        />
      )}
    </div>
  );
}
