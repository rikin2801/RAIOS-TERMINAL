"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";
import { formatCurrency } from "@/lib/utils";
import type { Holding, Phase1AnalysisResult } from "@/types";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BrainCircuit,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const DECISION_META: Record<string, { label: string; cls: string; border: string }> = {
  BUY:          { label: "BUY",          cls: "text-green-400  bg-green-400/10",  border: "border-green-400/30"  },
  WAIT:         { label: "WAIT",         cls: "text-amber-400  bg-amber-400/10",  border: "border-amber-400/30"  },
  HOLD:         { label: "HOLD",         cls: "text-sky-400    bg-sky-400/10",    border: "border-sky-400/30"    },
  BOOK_PROFITS: { label: "BOOK PROFITS", cls: "text-orange-400 bg-orange-400/10", border: "border-orange-400/30" },
  SELL:         { label: "SELL",         cls: "text-red-400    bg-red-400/10",    border: "border-red-400/30"    },
};

const TREND_META: Record<string, { icon: typeof TrendingUp; cls: string }> = {
  UPTREND:   { icon: TrendingUp,   cls: "text-green-400 bg-green-400/10 border-green-400/30" },
  DOWNTREND: { icon: TrendingDown, cls: "text-red-400   bg-red-400/10   border-red-400/30"   },
  SIDEWAYS:  { icon: Minus,        cls: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
};

const HEALTH_CLS: Record<string, string> = {
  STRONG: "text-green-400", STABLE: "text-amber-400", WEAK: "text-red-400",
};
const PRICE_CLS: Record<string, string> = {
  ATTRACTIVE: "text-green-400", FAIRLY_VALUED: "text-amber-400", EXPENSIVE: "text-red-400",
};

function TrendChip({ label, trend }: { label: string; trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS" }) {
  const m = TREND_META[trend];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      <Icon className="h-3 w-3" />
      <span className="text-[10px] text-muted-foreground font-normal">{label}</span>
    </span>
  );
}

function TargetRow({ label, range }: { label: string; range: { low: number; high: number } }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm font-bold text-foreground tabular-nums">
        ₹{range.low.toFixed(0)}
        <span className="text-muted-foreground font-normal">–</span>
        ₹{range.high.toFixed(0)}
      </p>
    </div>
  );
}

// ── Phase1 card ───────────────────────────────────────────────────────────────

function Phase1Card({ data, holding }: { data: Phase1AnalysisResult; holding: Holding }) {
  const [expanded, setExpanded] = useState(false);
  const dm = DECISION_META[data.decision] ?? DECISION_META.HOLD;
  const pnl = holding.shares * (data.price - holding.avgCost);
  const pnlPct = ((data.price - holding.avgCost) / holding.avgCost) * 100;
  const pnlPos = pnl >= 0;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${dm.border}`}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-foreground tracking-tight">{data.name || holding.name}</span>
            <span className="text-xs text-muted-foreground font-mono">{data.symbol}</span>
            <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">{holding.exchange}</span>
          </div>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span className="text-2xl font-bold text-foreground tabular-nums">{formatCurrency(data.price)}</span>
            <span className={`text-sm font-semibold ${data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%
            </span>
            {data.pe && <span className="text-xs text-muted-foreground">P/E {data.pe.toFixed(1)}</span>}
          </div>
          {/* P&L row */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{holding.shares} shares · avg ₹{holding.avgCost.toFixed(0)}</span>
            <span>·</span>
            <span className={`font-semibold ${pnlPos ? "text-green-400" : "text-red-400"}`}>
              {pnlPos ? "+" : ""}{formatCurrency(pnl)} ({pnlPos ? "+" : ""}{pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Decision badge */}
        <div className={`shrink-0 rounded-lg border px-4 py-2 text-center ${dm.cls} ${dm.border}`}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Decision</p>
          <p className="text-xl font-black tracking-tight leading-none">{dm.label}</p>
        </div>
      </div>

      {/* ── Trend structure ── */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
          Trend Structure (HH/HL)
        </p>
        <div className="flex flex-wrap gap-2">
          <TrendChip label="1Y" trend={data.trend.oneYear.trend} />
          <TrendChip label="6M" trend={data.trend.sixMonths.trend} />
          <TrendChip label="3M" trend={data.trend.threeMonths.trend} />
          <TrendChip label="1M" trend={data.trend.oneMonth.trend} />
        </div>
        {data.trend.oneYear.evidence && (
          <p className="mt-2 text-xs text-muted-foreground">{data.trend.oneYear.evidence}</p>
        )}
      </div>

      {/* ── Business / Price / What Changed ── */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Business</p>
          <p className={`text-base font-black ${HEALTH_CLS[data.businessHealth] ?? "text-foreground"}`}>
            {data.businessHealth.replace("_", " ")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{data.businessSummary}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Price</p>
          <p className={`text-base font-black ${PRICE_CLS[data.priceAttractiveness] ?? "text-foreground"}`}>
            {data.priceAttractiveness.replace("_", " ")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{data.priceSummary}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">What Changed</p>
          <p className="text-xs text-foreground leading-relaxed">{data.whatChanged}</p>
        </div>
      </div>

      {/* ── Target ranges ── */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
          Target Ranges
        </p>
        <div className="grid grid-cols-4 gap-4">
          <TargetRow label="1 Month" range={data.targets.oneMonth} />
          <TargetRow label="3 Months" range={data.targets.threeMonths} />
          <TargetRow label="6 Months" range={data.targets.sixMonths} />
          <TargetRow label="1 Year"   range={data.targets.oneYear} />
        </div>
      </div>

      {/* ── Entry zone + Analyst ── */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Entry Zone</p>
          <p className="text-base font-bold text-foreground tabular-nums">
            ₹{data.entryZone.low.toFixed(0)}–₹{data.entryZone.high.toFixed(0)}
          </p>
          {data.confirmationLevel > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Confirm above ₹{data.confirmationLevel.toFixed(0)}
            </p>
          )}
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Analyst Consensus</p>
          {data.analystConsensus ? (
            <>
              <p className={`text-base font-bold ${
                data.analystConsensus.includes("buy") ? "text-green-400" :
                data.analystConsensus.includes("sell") ? "text-red-400" : "text-amber-400"
              } uppercase`}>{data.analystConsensus.replace("_", " ")}</p>
              {data.analystTarget && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Avg target ₹{data.analystTarget.toFixed(0)}
                  {data.analystCount ? ` · ${data.analystCount} analysts` : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No analyst data</p>
          )}
        </div>
      </div>

      {/* ── Why + What would change (collapsible) ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Why {dm.label}? &amp; What Would Change
        </p>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Reasons</p>
            <ol className="space-y-1.5">
              {data.whyDecision.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground leading-snug">
                  <span className="shrink-0 text-muted-foreground font-mono text-xs mt-0.5">{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Would flip if…</p>
            <ul className="space-y-1.5">
              {data.whatWouldChange.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground leading-snug">
                  <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400 mt-1.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard({ holding }: { holding: Holding }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div className="flex-1 space-y-2">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="h-7 w-32 bg-muted rounded" />
          <div className="h-3 w-64 bg-muted rounded" />
        </div>
        <div className="h-16 w-28 bg-muted rounded-lg shrink-0" />
      </div>
      <div className="px-5 py-4 border-b border-border space-y-2">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-6 w-20 bg-muted rounded" />)}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[1, 2, 3].map(i => (
          <div key={i} className="px-5 py-4 space-y-2">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-5 w-24 bg-muted rounded" />
            <div className="h-3 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="px-5 py-4 flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-muted-foreground/40" />
        <span className="text-xs text-muted-foreground">Running Phase 1 Analysis for {holding.symbol}…</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface AnalysisState {
  status: "loading" | "done" | "error";
  data?: Phase1AnalysisResult;
  error?: string;
}

export default function AIAnalysisPage() {
  const { activePortfolioId } = usePortfolio();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [analysis, setAnalysis] = useState<Record<string, AnalysisState>>({});
  const fetchingRef = useRef(false);

  // Fetch holdings
  useEffect(() => {
    const pid = activePortfolioId === ALL_PORTFOLIOS_ID ? "__ALL__" : activePortfolioId;
    setLoadingHoldings(true);
    fetch(`/api/holdings?portfolioId=${pid}`)
      .then(r => r.json())
      .then((all: Holding[]) => {
        // Deduplicate by symbol, keep first occurrence
        const seen = new Set<string>();
        const unique = all.filter(h => {
          if (seen.has(h.symbol)) return false;
          seen.add(h.symbol);
          return true;
        });
        setHoldings(unique);
        setAnalysis(Object.fromEntries(unique.map(h => [h.symbol, { status: "loading" }])));
      })
      .catch(() => setHoldings([]))
      .finally(() => setLoadingHoldings(false));
  }, [activePortfolioId]);

  // Fetch analysis per holding (max 3 concurrent)
  const runAnalysis = useCallback(async (list: Holding[], force = false) => {
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;

    // Reset to loading
    setAnalysis(Object.fromEntries(list.map(h => [h.symbol, { status: "loading" }])));

    const queue = [...list];
    const concurrency = 3;

    async function processOne(h: Holding) {
      try {
        const ex = h.exchange || "NSE";
        const url = `/api/analysis/${h.symbol}?exchange=${ex}${force ? "&force=true" : ""}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.phase1) {
          setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "done", data: data.phase1 } }));
        } else {
          setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "error", error: data.error || "No Phase 1 data" } }));
        }
      } catch {
        setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "error", error: "Network error" } }));
      }
    }

    // Process in batches of `concurrency`
    for (let i = 0; i < queue.length; i += concurrency) {
      await Promise.all(queue.slice(i, i + concurrency).map(processOne));
    }

    fetchingRef.current = false;
  }, []);

  useEffect(() => {
    if (holdings.length > 0) runAnalysis(holdings);
  }, [holdings, runAnalysis]);

  const handleRefresh = () => runAnalysis(holdings, true);

  if (loadingHoldings) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BrainCircuit className="h-5 w-5 animate-pulse" />
          <span className="text-sm">Loading holdings…</span>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <BrainCircuit className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No holdings found in this portfolio.</p>
        </div>
      </div>
    );
  }

  const doneCount = Object.values(analysis).filter(a => a.status === "done").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            AI Analysis
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Phase 1 Decision Engine · {doneCount}/{holdings.length} analysed
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={fetchingRef.current}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetchingRef.current ? "animate-spin" : ""}`} />
          Refresh All
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {holdings.map(holding => {
          const state = analysis[holding.symbol];
          if (!state || state.status === "loading") {
            return <SkeletonCard key={holding.symbol} holding={holding} />;
          }
          if (state.status === "error") {
            return (
              <div key={holding.symbol} className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{holding.symbol}</p>
                  <p className="text-xs text-muted-foreground">{state.error}</p>
                </div>
              </div>
            );
          }
          return <Phase1Card key={holding.symbol} data={state.data!} holding={holding} />;
        })}
      </div>
    </div>
  );
}
