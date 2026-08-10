"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortfolio } from "@/contexts/portfolio-context";
import { formatCurrency, formatPercent, formatCurrencyCompact } from "@/lib/utils";
import type { Holding } from "@/types";
import type { DecisionData } from "@/app/api/ai/decision/route";
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Star, Plus, Trash2, Brain, ArrowRight, ShieldAlert,
  Zap, Eye, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import type { Watchlist } from "@/types";

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SELL:                { bg: "bg-red-500/10 border-red-500/30",    text: "text-red-400",    label: "SELL" },
  REDUCE_POSITION:     { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", label: "REDUCE" },
  BOOK_PARTIAL_PROFITS:{ bg: "bg-amber-500/10 border-amber-500/30",text: "text-amber-400",  label: "BOOK PROFITS" },
  BUY:                 { bg: "bg-green-500/10 border-green-500/30", text: "text-green-400",  label: "BUY" },
  ACCUMULATE:          { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", label: "ACCUMULATE" },
  HOLD:                { bg: "bg-blue-500/10 border-blue-500/30",   text: "text-blue-400",   label: "HOLD" },
  WAIT_AND_WATCH:      { bg: "bg-sky-500/10 border-sky-500/30",     text: "text-sky-400",    label: "WATCH" },
};

const SENTIMENT_STYLES = {
  BULLISH: { color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  dot: "bg-green-400"  },
  NEUTRAL: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30",dot: "bg-yellow-400" },
  BEARISH: { color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",       dot: "bg-red-400"    },
};

export default function DashboardPage() {
  const { activePortfolioId, activePortfolioLabel } = usePortfolio();
  const [holdings, setHoldings]     = useState<Holding[]>([]);
  const [quotes, setQuotes]         = useState<Record<string, { price: number; change: number; changePercent: number }>>({});
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [watchQuotes, setWatchQuotes] = useState<Record<string, { price: number; changePercent: number }>>({});
  const [decision, setDecision]     = useState<DecisionData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiError, setAiError]       = useState<string | null>(null);
  const [watchInput, setWatchInput] = useState("");
  const [activeListId, setActiveListId] = useState<string>("");
  const [addingWatch, setAddingWatch] = useState(false);

  const fetchAll = useCallback(async () => {
    const holdUrl = activePortfolioId ? `/api/holdings?portfolioId=${activePortfolioId}` : "/api/holdings";
    const decUrl  = activePortfolioId ? `/api/ai/decision?portfolioId=${activePortfolioId}&quick=1` : "/api/ai/decision?quick=1";
    const [hRes, wRes, decRes] = await Promise.all([
      fetch(holdUrl), fetch("/api/watchlist"), fetch(decUrl),
    ]);
    const [hData, wData] = await Promise.all([hRes.json(), wRes.json()]);
    setHoldings(hData);
    setWatchlists(wData);
    if (!activeListId && wData.length > 0) setActiveListId(wData[0].id);
    if (decRes.ok) {
      const d = await decRes.json();
      if (!d.error) { setDecision(d); setAiError(d.aiError ?? null); }
    }
    setLoading(false);
  }, [activePortfolioId, activeListId]);

  const fetchQuotesFor = useCallback(async (
    items: { symbol: string; exchange?: string }[],
    setter: (q: Record<string, { price: number; change: number; changePercent: number }>) => void,
  ) => {
    const res = await Promise.allSettled(
      items.map(h => fetch(`/api/market/${h.symbol}?exchange=${h.exchange ?? "NSE"}`).then(r => r.json()))
    );
    const map: Record<string, { price: number; change: number; changePercent: number }> = {};
    res.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.price) map[items[i].symbol] = { price: r.value.price, change: r.value.change, changePercent: r.value.changePercent };
    });
    setter(map);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (holdings.length > 0) fetchQuotesFor(holdings, setQuotes); }, [holdings, fetchQuotesFor]);
  useEffect(() => {
    const list = watchlists.find(l => l.id === activeListId);
    if (list?.items.length) fetchQuotesFor(list.items, setWatchQuotes as never);
  }, [watchlists, activeListId, fetchQuotesFor]);

  // Auto-refresh during market hours
  useEffect(() => {
    if (holdings.length === 0) return;
    const isOpen = () => {
      const now = new Date();
      if ([0, 6].includes(now.getDay())) return false;
      const m = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
      return m >= 555 && m <= 930;
    };
    const t = setInterval(() => {
      if (!isOpen()) return;
      fetchQuotesFor(holdings, setQuotes);
      const list = watchlists.find(l => l.id === activeListId);
      if (list?.items.length) fetchQuotesFor(list.items, setWatchQuotes as never);
    }, 10 * 60_000);
    return () => clearInterval(t);
  }, [holdings, watchlists, activeListId, fetchQuotesFor]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const list = watchlists.find(l => l.id === activeListId);
    const decUrl = activePortfolioId ? `/api/ai/decision?portfolioId=${activePortfolioId}&force=1` : "/api/ai/decision?force=1";
    await Promise.all([
      holdings.length > 0 ? fetchQuotesFor(holdings, setQuotes) : Promise.resolve(),
      list?.items.length ? fetchQuotesFor(list.items, setWatchQuotes as never) : Promise.resolve(),
      fetch(decUrl).then(r => r.ok ? r.json() : null).then(d => { if (d && !d.error) { setDecision(d); setAiError(d.aiError ?? null); } }),
    ]);
    setRefreshing(false);
  };

  // Portfolio metrics
  const enriched = holdings.map(h => {
    const q = quotes[h.symbol];
    const price       = q?.price ?? h.avgCost;
    const currentVal  = price * h.shares;
    const cost        = h.avgCost * h.shares;
    const gl          = currentVal - cost;
    const glPct       = cost > 0 ? (gl / cost) * 100 : 0;
    const dayChange   = (q?.change ?? 0) * h.shares;
    return { ...h, price, currentVal, cost, gl, glPct, dayChange };
  });

  const totalValue   = enriched.reduce((s, h) => s + h.currentVal, 0);
  const totalCost    = enriched.reduce((s, h) => s + h.cost, 0);
  const totalGL      = totalValue - totalCost;
  const totalGLPct   = totalCost > 0 ? (totalGL / totalCost) * 100 : 0;
  const dayGL        = enriched.reduce((s, h) => s + h.dayChange, 0);
  const dayGLPct     = totalValue > 0 ? (dayGL / (totalValue - dayGL || 1)) * 100 : 0;
  const healthScore  = decision?.portfolioHealthScore ?? 0;

  const handleAddWatch = async () => {
    const sym = watchInput.trim().toUpperCase();
    if (!sym || !activeListId) return;
    setAddingWatch(true);
    try {
      const qRes = await fetch(`/api/market/${sym}?exchange=NSE`);
      if (!qRes.ok) throw new Error();
      const q = await qRes.json();
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, name: q.name ?? sym, watchlistId: activeListId }),
      });
      setWatchInput("");
      await fetchAll();
    } catch { alert("Could not find symbol."); }
    finally { setAddingWatch(false); }
  };

  const handleRemoveWatch = async (id: string) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const activeList = watchlists.find(l => l.id === activeListId);
  const sentiment = decision?.marketSentiment ?? "NEUTRAL";
  const sentStyle = SENTIMENT_STYLES[sentiment];

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-3">
      <Brain className="h-6 w-6 text-primary animate-pulse" />
      <span className="text-sm text-muted-foreground">Loading your portfolio…</span>
    </div>
  );

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{activePortfolioLabel} · {today}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {aiError && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* ── 4 Key Metrics ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Portfolio Value</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrencyCompact(totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{holdings.length} position{holdings.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total P&amp;L</p>
          <p className={`text-2xl font-bold tabular-nums ${totalGL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalGL >= 0 ? "+" : ""}{formatCurrencyCompact(totalGL)}
          </p>
          <p className={`text-xs mt-1 ${totalGL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalGL >= 0 ? "+" : ""}{totalGLPct.toFixed(2)}% overall
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Health Score</p>
          <p className={`text-2xl font-bold tabular-nums ${healthScore >= 70 ? "text-green-400" : healthScore >= 45 ? "text-yellow-400" : "text-red-400"}`}>
            {healthScore}<span className="text-base font-normal text-muted-foreground">/100</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {healthScore >= 70 ? "Technically Strong" : healthScore >= 45 ? "Mixed Signals" : "Needs Attention"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Today&apos;s Change</p>
          <p className={`text-2xl font-bold tabular-nums ${dayGL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {dayGL >= 0 ? "+" : ""}{formatCurrencyCompact(dayGL)}
          </p>
          <p className={`text-xs mt-1 ${dayGL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {dayGL >= 0 ? "+" : ""}{dayGLPct.toFixed(2)}% today
          </p>
        </div>
      </div>

      {/* ── Main Content: Left (Alerts) + Right (Opportunity / Risk / Outlook) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT — Attention + Watchlist */}
        <div className="lg:col-span-2 space-y-5">

          {/* Attention Required */}
          {decision && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400" />
                  <h2 className="text-sm font-bold">Requires Attention Today</h2>
                </div>
                <Link href="/portfolio-manager" className="text-xs text-primary hover:underline flex items-center gap-1">
                  Full Analysis <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              {decision.attentionRequired.length === 0 ? (
                <div className="rounded-xl border border-border bg-card px-5 py-8 text-center">
                  <div className="text-green-400 text-2xl mb-2">✓</div>
                  <p className="text-sm font-medium text-foreground">No urgent actions today</p>
                  <p className="text-xs text-muted-foreground mt-1">All holdings look technically stable</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {decision.attentionRequired.map(item => {
                    const style = ACTION_STYLES[item.action] ?? ACTION_STYLES["SELL"];
                    return (
                      <div key={item.symbol} className={`rounded-xl border ${style.bg} p-4`}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${style.bg} ${style.text}`}>
                              {item.urgency === "URGENT" ? "🔴 URGENT" : "🟠 HIGH"} · {style.label}
                            </span>
                            <span className="font-bold text-sm">{item.symbol}</span>
                          </div>
                          <span className={`text-xs font-semibold ${style.text}`}>{item.confidence}% confidence</span>
                        </div>
                        <ul className="space-y-1">
                          {item.reasons.map((r, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="mt-0.5 shrink-0">·</span>{r}
                            </li>
                          ))}
                        </ul>
                        <Link href="/portfolio-manager" className={`mt-3 text-xs font-medium ${style.text} hover:underline flex items-center gap-1`}>
                          View full analysis <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Watchlist */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold">Watchlist</h2>
              {watchlists.length > 1 && (
                <div className="flex gap-1 ml-2">
                  {watchlists.map(l => (
                    <button key={l.id} onClick={() => setActiveListId(l.id)}
                      className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${activeListId === l.id ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover:text-foreground"}`}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex gap-2 p-3 border-b border-border">
                <Input
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleAddWatch()}
                  placeholder="Add symbol (e.g. INFY)"
                  className="h-8 text-xs font-mono"
                />
                <Button size="sm" onClick={handleAddWatch} disabled={addingWatch} className="h-8 px-3">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!activeList?.items.length ? (
                <p className="text-xs text-muted-foreground text-center py-8">Add stocks to your watchlist</p>
              ) : (
                <div className="divide-y divide-border">
                  {activeList.items.map(item => {
                    const q = watchQuotes[item.symbol];
                    const chg = q?.changePercent ?? 0;
                    return (
                      <div key={item.symbol} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                        <div>
                          <p className="text-sm font-semibold font-mono">{item.symbol}</p>
                          <p className="text-xs text-muted-foreground">{item.name}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-mono">{q ? formatCurrency(q.price) : "—"}</p>
                            <p className={`text-xs font-mono ${chg >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                            </p>
                          </div>
                          <button onClick={() => handleRemoveWatch(item.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Opportunity / Risk / Market Outlook */}
        <div className="space-y-4">

          {/* Top Opportunity */}
          {decision?.topOpportunity && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Top Opportunity</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-base">{decision.topOpportunity.symbol}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {decision.topOpportunity.action}
                </span>
                <span className="text-xs text-emerald-400 ml-auto">{decision.topOpportunity.confidence}%</span>
              </div>
              <ul className="space-y-1 mb-3">
                {decision.topOpportunity.reasons.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="shrink-0 mt-0.5">·</span>{r}
                  </li>
                ))}
              </ul>
              <Link href="/portfolio-manager" className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
                View details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Biggest Risk */}
          {decision?.biggestRisk && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Biggest Risk</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-base">{decision.biggestRisk.symbol}</span>
                <span className="text-xs text-red-400 ml-auto">{decision.biggestRisk.confidence}% concern</span>
              </div>
              <ul className="space-y-1 mb-3">
                {decision.biggestRisk.reasons.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="shrink-0 mt-0.5">·</span>{r}
                  </li>
                ))}
              </ul>
              <Link href="/portfolio-manager" className="text-xs text-red-400 hover:underline flex items-center gap-1">
                View details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Market Outlook */}
          {decision && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Market Outlook</span>
              </div>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold mb-3 ${sentStyle.bg} ${sentStyle.color}`}>
                <span className={`w-2 h-2 rounded-full ${sentStyle.dot}`} />
                {sentiment}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{decision.marketContext}</p>
              <ul className="space-y-1">
                {decision.marketReasons.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="shrink-0 mt-0.5 text-primary">›</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Holdings summary */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top Holdings</span>
              <Link href="/portfolio" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="space-y-2">
              {enriched.sort((a, b) => b.currentVal - a.currentVal).slice(0, 5).map(h => (
                <div key={h.symbol} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold font-mono">{h.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">{h.sector ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono">{formatCurrency(h.price)}</p>
                    <p className={`text-[10px] font-mono ${h.glPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {h.glPct >= 0 ? "+" : ""}{h.glPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <Link href="/portfolio-manager" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center hover:bg-primary/10 transition-colors">
              <Brain className="h-4 w-4 text-primary mx-auto mb-1" />
              <p className="text-xs font-semibold text-primary">AI Manager</p>
            </Link>
            <Link href="/market" className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors">
              <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <p className="text-xs font-semibold text-muted-foreground">Market</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
