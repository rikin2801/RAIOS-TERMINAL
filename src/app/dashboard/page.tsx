"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortfolio } from "@/contexts/portfolio-context";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type { Holding } from "@/types";
import type { DecisionData } from "@/app/api/ai/decision/route";
import {
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Zap, ShieldAlert, ChevronRight, ArrowRight, Star,
  Plus, Trash2, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import type { Watchlist } from "@/types";

const ACTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SELL:                 { bg: "bg-red-500/15",     text: "text-red-400",     label: "SELL"        },
  REDUCE_POSITION:      { bg: "bg-orange-500/15",  text: "text-orange-400",  label: "REDUCE"      },
  BOOK_PARTIAL_PROFITS: { bg: "bg-amber-500/15",   text: "text-amber-400",   label: "BOOK PROFITS" },
  BUY:                  { bg: "bg-green-500/15",   text: "text-green-400",   label: "BUY"         },
  ACCUMULATE:           { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "ACCUMULATE"  },
  HOLD:                 { bg: "bg-blue-500/15",    text: "text-blue-400",    label: "HOLD"        },
  WAIT_AND_WATCH:       { bg: "bg-sky-500/15",     text: "text-sky-400",     label: "WATCH"       },
  AVOID:                { bg: "bg-zinc-500/15",    text: "text-zinc-400",    label: "AVOID"       },
};

const SENTIMENT_STYLE = {
  BULLISH: { color: "text-green-400",  dot: "bg-green-400"  },
  NEUTRAL: { color: "text-yellow-400", dot: "bg-yellow-400" },
  BEARISH: { color: "text-red-400",    dot: "bg-red-400"    },
};

export default function DashboardPage() {
  const { activePortfolioId, activePortfolioLabel } = usePortfolio();
  const [holdings, setHoldings]         = useState<Holding[]>([]);
  const [quotes, setQuotes]             = useState<Record<string, { price: number; change: number; changePercent: number }>>({});
  const [watchlists, setWatchlists]     = useState<Watchlist[]>([]);
  const [watchQuotes, setWatchQuotes]   = useState<Record<string, { price: number; changePercent: number }>>({});
  const [decision, setDecision]         = useState<DecisionData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [aiError, setAiError]           = useState<string | null>(null);
  const [watchInput, setWatchInput]     = useState("");
  const [activeListId, setActiveListId] = useState<string>("");
  const [addingWatch, setAddingWatch]   = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);

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
      if (r.status === "fulfilled" && r.value?.price)
        map[items[i].symbol] = { price: r.value.price, change: r.value.change, changePercent: r.value.changePercent };
    });
    setter(map);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (holdings.length > 0) fetchQuotesFor(holdings, setQuotes); }, [holdings, fetchQuotesFor]);
  useEffect(() => {
    const list = watchlists.find(l => l.id === activeListId);
    if (list?.items.length) fetchQuotesFor(list.items, setWatchQuotes as never);
  }, [watchlists, activeListId, fetchQuotesFor]);

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

  // Portfolio metrics
  const enriched = holdings.map(h => {
    const q          = quotes[h.symbol];
    const price      = q?.price ?? h.avgCost;
    const currentVal = price * h.shares;
    const cost       = h.avgCost * h.shares;
    const gl         = currentVal - cost;
    const glPct      = cost > 0 ? (gl / cost) * 100 : 0;
    const dayChange  = (q?.change ?? 0) * h.shares;
    return { ...h, price, currentVal, cost, gl, glPct, dayChange, changePercent: q?.changePercent ?? 0 };
  });

  const totalValue  = enriched.reduce((s, h) => s + h.currentVal, 0);
  const totalCost   = enriched.reduce((s, h) => s + h.cost, 0);
  const totalGL     = totalValue - totalCost;
  const totalGLPct  = totalCost > 0 ? (totalGL / totalCost) * 100 : 0;
  const dayGL       = enriched.reduce((s, h) => s + h.dayChange, 0);
  const dayGLPct    = totalValue > 0 ? (dayGL / (totalValue - dayGL || 1)) * 100 : 0;
  const healthScore = decision?.portfolioHealthScore ?? 0;

  // Build AI signal map for holdings table
  const signalMap = Object.fromEntries(
    (decision?.todayDecisions ?? []).map(d => [d.symbol, d])
  );

  const activeList = watchlists.find(l => l.id === activeListId);
  const sentiment  = decision?.marketSentiment ?? "NEUTRAL";
  const sentStyle  = SENTIMENT_STYLE[sentiment];

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-3 text-sm text-muted-foreground">
      Loading your portfolio…
    </div>
  );

  const urgentItems = decision?.attentionRequired ?? [];

  return (
    <div className="p-5 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{activePortfolioLabel}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {aiError && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* ── 4 Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Portfolio Value" value={formatCurrencyCompact(totalValue)} sub={`${holdings.length} positions`} />
        <MetricCard
          label="Total P&L"
          value={`${totalGL >= 0 ? "+" : ""}${formatCurrencyCompact(totalGL)}`}
          sub={`${totalGL >= 0 ? "+" : ""}${totalGLPct.toFixed(2)}% overall`}
          color={totalGL >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="Health Score"
          value={`${healthScore}/100`}
          sub={healthScore >= 70 ? "Technically Strong" : healthScore >= 45 ? "Mixed Signals" : "Needs Attention"}
          color={healthScore >= 70 ? "text-green-400" : healthScore >= 45 ? "text-yellow-400" : "text-red-400"}
        />
        <MetricCard
          label="Today's Change"
          value={`${dayGL >= 0 ? "+" : ""}${formatCurrencyCompact(dayGL)}`}
          sub={`${dayGL >= 0 ? "+" : ""}${dayGLPct.toFixed(2)}% today`}
          color={dayGL >= 0 ? "text-green-400" : "text-red-400"}
        />
      </div>

      {/* ── Today's Brief ── */}
      {decision && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className={`flex items-center gap-1.5 shrink-0 text-xs font-semibold ${sentStyle.color}`}>
            <span className={`w-2 h-2 rounded-full ${sentStyle.dot}`} />
            {sentiment}
          </div>
          <div className="w-px h-4 bg-border" />
          <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{decision.marketContext}</p>
          <Link href="/portfolio-manager" className="text-xs text-primary font-medium hover:underline flex items-center gap-1 shrink-0">
            Full AI Analysis <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* ── Urgent Actions banner (only when items exist) ── */}
      {urgentItems.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span className="text-sm font-bold text-red-400">Action Required</span>
            </div>
            <Link href="/portfolio-manager" className="text-xs text-red-400 hover:underline flex items-center gap-1">
              Full analysis <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {urgentItems.map(item => {
            const style = ACTION_COLORS[item.action] ?? ACTION_COLORS["SELL"];
            return (
              <div key={item.symbol} className="flex items-start gap-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.bg} ${style.text} shrink-0 mt-0.5`}>
                  {item.urgency === "URGENT" ? "🔴" : "🟠"} {style.label}
                </span>
                <div>
                  <span className="text-xs font-bold mr-2">{item.symbol}</span>
                  <span className="text-xs text-muted-foreground">{item.reasons[0]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT — Holdings with AI Signal */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Holdings</span>
              <Link href="/portfolio-manager" className="text-xs text-primary hover:underline flex items-center gap-1">
                AI Manager <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {enriched.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">No holdings yet</p>
                <Link href="/portfolio" className="text-xs text-primary hover:underline mt-1 block">Add your first holding →</Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Column headers */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Stock</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">AI Signal</span>
                </div>
                {enriched
                  .sort((a, b) => b.currentVal - a.currentVal)
                  .map(h => {
                    const sig = signalMap[h.symbol];
                    const sigStyle = ACTION_COLORS[sig?.action ?? "HOLD"] ?? ACTION_COLORS["HOLD"];
                    return (
                      <div key={h.symbol} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-4 py-2.5 items-center hover:bg-accent/20 transition-colors">
                        {/* Stock */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono">{h.symbol}</span>
                            <span className={`text-[10px] font-mono ${h.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {h.changePercent >= 0 ? "▲" : "▼"} {Math.abs(h.changePercent).toFixed(2)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{h.sector ?? h.name}</p>
                        </div>
                        {/* Price */}
                        <div className="text-right">
                          <p className="text-xs font-mono">{formatCurrency(h.price)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCurrencyCompact(h.currentVal)}</p>
                        </div>
                        {/* P&L */}
                        <div className="text-right">
                          <p className={`text-xs font-mono font-semibold ${h.gl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {h.gl >= 0 ? "+" : ""}{h.glPct.toFixed(1)}%
                          </p>
                          <p className={`text-[10px] ${h.gl >= 0 ? "text-green-400/70" : "text-red-400/70"}`}>
                            {h.gl >= 0 ? "+" : ""}{formatCurrencyCompact(h.gl)}
                          </p>
                        </div>
                        {/* AI Signal */}
                        <div className="flex items-center justify-end gap-2">
                          {sig ? (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sigStyle.bg} ${sigStyle.text}`}>
                              {sigStyle.label}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                          <Link href="/portfolio-manager" className="text-muted-foreground hover:text-primary transition-colors">
                            <BarChart2 className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Intelligence Panel */}
        <div className="space-y-4">

          {/* Top Opportunity */}
          {decision?.topOpportunity && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Top Opportunity</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm">{decision.topOpportunity.symbol}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {decision.topOpportunity.action}
                </span>
                <span className="text-xs text-emerald-400 ml-auto">{decision.topOpportunity.confidence}%</span>
              </div>
              <ul className="space-y-1 mb-2">
                {decision.topOpportunity.reasons.slice(0, 2).map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 leading-relaxed">
                    <span className="shrink-0 mt-0.5">·</span>{r}
                  </li>
                ))}
              </ul>
              <Link href="/portfolio-manager" className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1">
                View full analysis <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Biggest Risk */}
          {decision?.biggestRisk && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Biggest Risk</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-sm">{decision.biggestRisk.symbol}</span>
                <span className="text-xs text-red-400 ml-auto">{decision.biggestRisk.confidence}% concern</span>
              </div>
              <ul className="space-y-1 mb-2">
                {decision.biggestRisk.reasons.slice(0, 2).map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 leading-relaxed">
                    <span className="shrink-0 mt-0.5">·</span>{r}
                  </li>
                ))}
              </ul>
              <Link href="/portfolio-manager" className="text-[11px] text-red-400 hover:underline flex items-center gap-1">
                View full analysis <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Market Outlook — compact */}
          {decision && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Market</span>
                <span className={`flex items-center gap-1.5 text-xs font-bold ${sentStyle.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sentStyle.dot}`} />
                  {sentiment}
                </span>
              </div>
              <ul className="space-y-1">
                {decision.marketReasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5 leading-relaxed">
                    <span className="shrink-0 mt-0.5 text-primary">›</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Watchlist — collapsed by default */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowWatchlist(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-bold">Watchlist</span>
                {activeList?.items.length ? (
                  <span className="text-[10px] text-muted-foreground">({activeList.items.length})</span>
                ) : null}
              </div>
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showWatchlist ? "rotate-90" : ""}`} />
            </button>

            {showWatchlist && (
              <>
                {watchlists.length > 1 && (
                  <div className="flex gap-1 px-3 pb-2 border-t border-border pt-2">
                    {watchlists.map(l => (
                      <button key={l.id} onClick={() => setActiveListId(l.id)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${activeListId === l.id ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border"}`}>
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 px-3 py-2 border-t border-border">
                  <Input
                    value={watchInput}
                    onChange={e => setWatchInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && handleAddWatch()}
                    placeholder="Add symbol…"
                    className="h-7 text-xs font-mono"
                  />
                  <Button size="sm" onClick={handleAddWatch} disabled={addingWatch} className="h-7 px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {!activeList?.items.length ? (
                  <p className="text-xs text-muted-foreground text-center py-4 border-t border-border">Add stocks to watch</p>
                ) : (
                  <div className="divide-y divide-border border-t border-border">
                    {activeList.items.map(item => {
                      const q   = watchQuotes[item.symbol];
                      const chg = q?.changePercent ?? 0;
                      return (
                        <div key={item.symbol} className="flex items-center justify-between px-3 py-2 hover:bg-accent/20">
                          <div>
                            <p className="text-xs font-semibold font-mono">{item.symbol}</p>
                            <p className="text-[10px] text-muted-foreground">{item.name}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs font-mono">{q ? formatCurrency(q.price) : "—"}</p>
                              <p className={`text-[10px] font-mono ${chg >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                              </p>
                            </div>
                            <button onClick={() => handleRemoveWatch(item.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color ?? ""}`}>{value}</p>
      <p className={`text-[11px] mt-1 ${color ? color + "/80" : "text-muted-foreground"}`}>{sub}</p>
    </div>
  );
}
