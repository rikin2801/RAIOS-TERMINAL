"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { POPULAR_INDIAN_STOCKS } from "@/lib/india";
import { StockChartModal } from "@/components/charts/stock-chart-modal";
import { Phase1CardBody, DEC, ProfitBookingCardBody } from "@/app/ai-analysis/page";
import type { Phase1AnalysisResult, ProfitBookingResult, EntryScreenResult } from "@/types";
import {
  Search, TrendingUp, TrendingDown, BrainCircuit, ChevronDown, ChevronUp,
  BarChart2, TrendingDown as BookIcon, Target, AlertCircle,
  CheckCircle2, Clock, XCircle, Minus,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Search tab types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchResult {
  symbol: string; name: string; price?: number; changePercent?: number;
  sector?: string; exchange: string;
}

interface Phase1State  { status: "idle" | "loading" | "done" | "error"; data?: Phase1AnalysisResult; error?: string; }
interface PBState      { status: "idle" | "loading" | "done" | "error"; data?: ProfitBookingResult;  error?: string; }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared across both tabs
// ─────────────────────────────────────────────────────────────────────────────

function pill(label: string, color: string) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider border ${color}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Search — ResultRow
// ─────────────────────────────────────────────────────────────────────────────

function ResultRow({ r, onChart }: { r: SearchResult; onChart: () => void }) {
  const [activePanel, setActivePanel] = useState<"none" | "phase1" | "profit-booking">("none");
  const [p1, setP1] = useState<Phase1State>({ status: "idle" });
  const [pb, setPb] = useState<PBState>({ status: "idle" });

  const fetchP1 = useCallback(async () => {
    if (p1.status === "loading" || p1.status === "done") return;
    setP1({ status: "loading" });
    try {
      const res  = await fetch(`/api/analysis/${r.symbol}?exchange=${r.exchange}`);
      const data = await res.json();
      if (data.phase1) setP1({ status: "done", data: data.phase1 });
      else setP1({ status: "error", error: data.error || "No Phase 1 data" });
    } catch { setP1({ status: "error", error: "Network error" }); }
  }, [p1.status, r.symbol, r.exchange]);

  const fetchPB = useCallback(async () => {
    if (pb.status === "loading" || pb.status === "done") return;
    setPb({ status: "loading" });
    try {
      const res  = await fetch(`/api/profit-booking/${r.symbol}?exchange=${r.exchange}`);
      const data: ProfitBookingResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      setPb({ status: "done", data });
    } catch (e) { setPb({ status: "error", error: String(e) }); }
  }, [pb.status, r.symbol, r.exchange]);

  const togglePanel = (panel: "phase1" | "profit-booking") => {
    if (activePanel === panel) { setActivePanel("none"); }
    else {
      setActivePanel(panel);
      if (panel === "phase1") fetchP1();
      if (panel === "profit-booking") fetchPB();
    }
  };

  const d    = p1.data ? (DEC[p1.data.decision] ?? DEC.HOLD) : null;
  const open = activePanel !== "none";

  return (
    <div className={`rounded-xl border bg-card overflow-hidden transition-colors ${d && activePanel === "phase1" ? d.border : "border-border"}`}>
      <div className="flex items-center gap-4 px-5 py-4">
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{r.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.name}</p>
          {r.sector && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{r.sector}</p>}
        </div>
        <div className="text-right shrink-0">
          {r.price != null ? (
            <>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(r.price)}</p>
              {r.changePercent != null && (
                <p className={`text-xs flex items-center gap-0.5 justify-end font-semibold ${r.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(r.changePercent)}
                </p>
              )}
            </>
          ) : <p className="text-xs text-muted-foreground">—</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => togglePanel("phase1")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${activePanel === "phase1" ? "border-primary bg-primary/10 text-primary" : "border-primary/40 text-primary hover:bg-primary/10"}`}>
            <BrainCircuit className="h-3.5 w-3.5" /> Phase 1
          </button>
          <button onClick={() => togglePanel("profit-booking")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-semibold transition-colors ${activePanel === "profit-booking" ? "border-orange-400/60 bg-orange-400/10 text-orange-400" : "border-orange-400/30 text-orange-400/80 hover:bg-orange-400/10"}`}>
            <BookIcon className="h-3.5 w-3.5" /> Profit Book
          </button>
          <button onClick={onChart}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <BarChart2 className="h-3.5 w-3.5" /> Chart
          </button>
        </div>
      </div>

      {activePanel === "phase1" && p1.status === "done"    && p1.data && <Phase1CardBody data={p1.data} holding={{ exchange: r.exchange, sector: r.sector }} />}
      {activePanel === "phase1" && p1.status === "loading" && (
        <div className="px-5 py-6 border-t border-border flex items-center gap-2 text-muted-foreground">
          <BrainCircuit className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Running Phase 1 Analysis for {r.symbol}…</span>
        </div>
      )}
      {activePanel === "phase1" && p1.status === "error"   && <div className="px-5 py-4 border-t border-border text-sm text-red-400">{p1.error}</div>}

      {activePanel === "profit-booking" && pb.status === "done"    && pb.data && <ProfitBookingCardBody data={pb.data} />}
      {activePanel === "profit-booking" && pb.status === "loading" && (
        <div className="px-5 py-6 border-t border-border flex items-center gap-2 text-muted-foreground">
          <BookIcon className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Analysing profit booking signals for {r.symbol}…</span>
        </div>
      )}
      {activePanel === "profit-booking" && pb.status === "error"   && <div className="px-5 py-4 border-t border-border text-sm text-red-400">{pb.error}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point Screening — result card
// ─────────────────────────────────────────────────────────────────────────────

const TREND_STYLE = {
  UP:       { cls: "text-green-400 bg-green-400/10 border-green-400/40",   icon: <TrendingUp   className="h-3 w-3" />, label: "UP / BULLISH"       },
  SIDEWAYS: { cls: "text-amber-400 bg-amber-400/10 border-amber-400/40",   icon: <Minus        className="h-3 w-3" />, label: "SIDEWAYS / UNCLEAR" },
  DOWN:     { cls: "text-red-400   bg-red-400/10   border-red-400/40",     icon: <TrendingDown className="h-3 w-3" />, label: "DOWN / BEARISH"     },
} as const;

const ASSESS_STYLE = {
  ENTRY_CONFIRMED: { cls: "text-green-400", Icon: CheckCircle2, emoji: "🟢", label: "ENTRY CONFIRMED" },
  DEVELOPING:      { cls: "text-amber-400", Icon: Clock,        emoji: "🟡", label: "ENTRY DEVELOPING — WAIT" },
  NO_ENTRY:        { cls: "text-red-400",   Icon: XCircle,      emoji: "🔴", label: "NO ENTRY" },
} as const;

const CROSS_STYLE: Record<string, string> = {
  PCO:  "text-green-400 bg-green-400/10 border-green-400/40",
  NCO:  "text-red-400   bg-red-400/10   border-red-400/40",
  NONE: "text-muted-foreground bg-muted/30 border-border",
};
const ZONE_STYLE: Record<string, string> = {
  OVERBOUGHT: "text-red-400   bg-red-400/10   border-red-400/40",
  OVERSOLD:   "text-green-400 bg-green-400/10 border-green-400/40",
  NEUTRAL:    "text-muted-foreground bg-muted/30 border-border",
};
const DIR_STYLE: Record<string, string> = {
  BULLISH: "text-green-400",
  BEARISH: "text-red-400",
  NEUTRAL: "text-amber-400",
};

function StepHeader({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-black tracking-widest text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">{step}</span>
      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-b-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function EntryScreenCard({ data }: { data: EntryScreenResult }) {
  const assess = ASSESS_STYLE[data.assessment];
  const AssessIcon = assess.Icon;
  const s1 = data.step1;
  const s2 = data.step2;
  const s3 = data.step3;
  const trend = TREND_STYLE[s1.weeklyTrend];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{data.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{data.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold tabular-nums text-foreground">{formatCurrency(data.price)}</p>
          <p className={`text-xs font-semibold ${data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {data.changePercent >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
          </p>
        </div>
        <div className={`flex items-center gap-2 ${assess.cls}`}>
          <AssessIcon className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider">{assess.emoji} {assess.label}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">

        {/* ── STEP 1 ────────────────────────────────────────────────────── */}
        <div>
          <StepHeader step="STEP 1" title="Weekly Chart" />
          <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-1 divide-y divide-border/40">
            <Row label="Weekly Trend">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider border ${trend.cls}`}>
                {trend.icon} {trend.label}
              </span>
              <span className="text-xs text-muted-foreground">{s1.weeklyTrendEvidence}</span>
            </Row>

            <Row label="Weekly MACD">
              {pill(s1.macdCrossover === "NONE" ? "No crossover" : s1.macdCrossover, CROSS_STYLE[s1.macdCrossover])}
              {pill(s1.macdZone, ZONE_STYLE[s1.macdZone])}
              <span className="text-xs text-muted-foreground tabular-nums">Hist: {s1.macdHist >= 0 ? "+" : ""}{s1.macdHist.toFixed(3)}</span>
            </Row>

            <Row label="Support">
              <span className="text-sm font-bold tabular-nums text-green-400">₹{s1.support.toFixed(0)}</span>
            </Row>
            <Row label="Resistance">
              <span className="text-sm font-bold tabular-nums text-red-400">₹{s1.resistance.toFixed(0)}</span>
            </Row>
          </div>
        </div>

        {/* ── STEP 2 ────────────────────────────────────────────────────── */}
        <div>
          <StepHeader step="STEP 2" title="Lower Timeframe Confirmation" />
          <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-1 divide-y divide-border/40">

            <Row label="Bollinger Bands">
              {s2.bb ? (
                <>
                  {pill(`Bands ${s2.bb.direction === "UP" ? "↑" : s2.bb.direction === "DOWN" ? "↓" : "→"}`,
                    s2.bb.direction === "UP" ? "text-green-400 bg-green-400/10 border-green-400/40" :
                    s2.bb.direction === "DOWN" ? "text-red-400 bg-red-400/10 border-red-400/40" :
                    "text-muted-foreground bg-muted/30 border-border"
                  )}
                  <span className="text-xs text-muted-foreground">{data.bbSummary}</span>
                </>
              ) : <span className="text-xs text-muted-foreground">DATA NOT AVAILABLE</span>}
            </Row>

            <Row label="RSI (14)">
              <span className={`text-sm font-bold tabular-nums ${s2.rsi.currentRSI < 35 ? "text-green-400" : s2.rsi.currentRSI > 65 ? "text-red-400" : "text-amber-400"}`}>
                {s2.rsi.currentRSI.toFixed(1)}
              </span>
              {s2.rsi.action !== "NONE" && pill(`${s2.rsi.nearestLevel} ${s2.rsi.action}`,
                s2.rsi.action === "SUPPORT" ? "text-green-400 bg-green-400/10 border-green-400/40" : "text-red-400 bg-red-400/10 border-red-400/40")}
              {s2.rsi.reversalDir !== "NONE" && pill(`Reversing ${s2.rsi.reversalDir === "UP" ? "↑" : "↓"}`,
                s2.rsi.reversalDir === "UP" ? "text-green-400 bg-green-400/10 border-green-400/40" : "text-red-400 bg-red-400/10 border-red-400/40")}
              <span className="text-xs text-muted-foreground">{data.rsiSummary}</span>
            </Row>

            <Row label="Stochastic">
              <span className="text-sm font-bold tabular-nums text-foreground">K={s2.stochastic.k.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">D={s2.stochastic.d.toFixed(1)}</span>
              {pill(s2.stochastic.crossover === "NONE" ? "No crossover" : s2.stochastic.crossover, CROSS_STYLE[s2.stochastic.crossover])}
              {pill(s2.stochastic.zone, ZONE_STYLE[s2.stochastic.zone])}
              <span className="text-xs text-muted-foreground">{data.stochSummary}</span>
            </Row>

            <Row label="EMA Support">
              <span className="text-xs text-muted-foreground tabular-nums">
                50: ₹{s2.ema.ema50.toFixed(0)} · 100: ₹{s2.ema.ema100.toFixed(0)} · 200: ₹{s2.ema.ema200.toFixed(0)}
              </span>
              <span className="text-xs text-muted-foreground">{data.emaSummary}</span>
            </Row>

            {s2.hourly && (
              <Row label="Hourly">
                <AlertCircle className={`h-3.5 w-3.5 shrink-0 ${s2.hourly.aligns ? "text-green-400" : "text-amber-400"}`} />
                <span className="text-xs text-muted-foreground">
                  RSI {s2.hourly.rsi} · Stoch {s2.hourly.stochCrossover !== "NONE" ? s2.hourly.stochCrossover : "no cross"} · {s2.hourly.note}
                </span>
              </Row>
            )}
          </div>
        </div>

        {/* ── STEP 3 ────────────────────────────────────────────────────── */}
        <div>
          <StepHeader step="STEP 3" title="Price Action" />
          <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3 flex items-start gap-3">
            <span className={`text-sm font-bold shrink-0 ${DIR_STYLE[s3.direction]}`}>{s3.pattern}</span>
            <span className="text-xs text-muted-foreground leading-relaxed">{data.priceActionSummary}</span>
          </div>
        </div>

        {/* ── Entry / Stop / Target ─────────────────────────────────────── */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Entry</p>
              {data.entryPrice != null ? (
                <p className="text-base font-black tabular-nums text-green-400">
                  ₹{data.entryPrice}
                  {data.entryRangeHigh && data.entryRangeHigh !== data.entryPrice && (
                    <span className="text-sm font-bold text-foreground"> – ₹{data.entryRangeHigh}</span>
                  )}
                </p>
              ) : <p className="text-sm text-muted-foreground">—</p>}
              {data.entryBasis && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.entryBasis}</p>}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Stop-Loss</p>
              {data.stopLoss != null ? (
                <p className="text-base font-black tabular-nums text-red-400">₹{data.stopLoss}</p>
              ) : <p className="text-sm text-muted-foreground">—</p>}
              {data.stopBasis && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.stopBasis}</p>}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Target</p>
              {data.target != null ? (
                <p className="text-base font-black tabular-nums text-sky-400">₹{data.target}</p>
              ) : <p className="text-sm text-muted-foreground">—</p>}
              {data.targetBasis && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{data.targetBasis}</p>}
            </div>
          </div>
        </div>

        {/* ── Final assessment — WHY ─────────────────────────────────────── */}
        <div>
          <div className={`flex items-center gap-2 mb-3 ${assess.cls}`}>
            <AssessIcon className="h-4 w-4 shrink-0" />
            <p className="text-sm font-bold">{assess.emoji} {assess.label}</p>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Why?</p>
          <ul className="space-y-1.5">
            {data.why.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                <span className="shrink-0 text-primary font-bold mt-0.5">{i + 1}.</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point Screening — tab
// ─────────────────────────────────────────────────────────────────────────────

interface EntryState { status: "idle" | "loading" | "done" | "error"; data?: EntryScreenResult; error?: string; symbol?: string; }

function EntryScreenTab() {
  const [query,  setQuery]  = useState("");
  const [exch,   setExch]   = useState("NSE");
  const [state,  setState]  = useState<EntryState>({ status: "idle" });

  const analyze = useCallback(async (sym?: string, exchange?: string) => {
    const s = (sym ?? query).trim().toUpperCase();
    const e = exchange ?? exch;
    if (!s) return;
    setState({ status: "loading", symbol: s });
    try {
      const res  = await fetch(`/api/entry-screen/${s}?exchange=${e}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setState({ status: "done", data, symbol: s });
    } catch (err) {
      setState({ status: "error", error: String(err), symbol: s });
    }
  }, [query, exch]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Analyse any stock using the three-step entry strategy —{" "}
          <span className="text-foreground font-semibold">Weekly trend → Lower TF confirmation → Price action → Entry / Wait / No Entry</span>
        </p>

        <div className="flex gap-2 max-w-xl">
          <div className="relative flex-1">
            <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="RELIANCE, INFY, HDFCBANK..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && analyze()}
              className="pl-9"
            />
          </div>
          <select
            value={exch}
            onChange={e => setExch(e.target.value)}
            className="rounded-md border border-border bg-card text-foreground px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
          <Button onClick={() => analyze()} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Analysing…" : "Analyse"}
          </Button>
        </div>
      </div>

      {/* Popular stocks quick launch */}
      {state.status === "idle" && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Quick screen</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_INDIAN_STOCKS.slice(0, 14).map(s => (
              <button key={s.symbol}
                onClick={() => { setQuery(s.symbol); analyze(s.symbol); }}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent hover:border-primary transition-colors font-mono">
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {state.status === "loading" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3">
          <Target className="h-8 w-8 text-primary animate-pulse" />
          <p className="text-sm font-semibold text-foreground">Screening {state.symbol}…</p>
          <p className="text-xs text-muted-foreground text-center">
            Fetching weekly + daily + hourly data, computing indicators, and running the three-step strategy
          </p>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-5 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">Analysis failed for {state.symbol}</p>
            <p className="text-xs text-muted-foreground mt-1">{state.error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {state.status === "done" && state.data && (
        <EntryScreenCard data={state.data} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Search — tab
// ─────────────────────────────────────────────────────────────────────────────

function StockSearchTab() {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [chartStock, setChartStock] = useState<{ symbol: string; exchange: string; name?: string } | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    const matches = POPULAR_INDIAN_STOCKS.filter(
      s => s.symbol.includes(q) || s.name.toUpperCase().includes(q) || s.sector.toUpperCase().includes(q)
    ).slice(0, 12);

    if (matches.length === 0) {
      try {
        const res = await fetch(`/api/market/${q}?exchange=NSE`);
        if (res.ok) {
          const data = await res.json();
          setResults([{ symbol: data.symbol, name: data.name, price: data.price, changePercent: data.changePercent, exchange: "NSE" }]);
        } else { setResults([]); }
      } catch { setResults([]); }
      setLoading(false);
      return;
    }

    const quotes = await Promise.allSettled(
      matches.map(m => fetch(`/api/market/${m.symbol}?exchange=NSE`).then(r => r.json()))
    );
    setResults(matches.map((m, i) => {
      const r  = quotes[i];
      const q2 = r.status === "fulfilled" ? r.value : null;
      return { symbol: m.symbol, name: m.name, sector: m.sector, exchange: "NSE", price: q2?.price, changePercent: q2?.changePercent };
    }));
    setLoading(false);
  }, [query]);

  return (
    <div className="space-y-5">
      <div className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="RELIANCE, Tata, IT, Banking..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {!searched && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">Popular sectors</p>
          <div className="flex flex-wrap gap-2">
            {["IT", "Banking", "Energy", "Pharma", "FMCG", "Auto", "Finance", "Telecom"].map(s => (
              <button key={s} onClick={() => setQuery(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors">
                {s}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-4 mb-3">Popular stocks — click Phase 1 for AI analysis</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_INDIAN_STOCKS.slice(0, 16).map(s => (
              <button key={s.symbol}
                onClick={() => setChartStock({ symbol: s.symbol, exchange: "NSE", name: s.name })}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent hover:border-primary transition-colors font-mono">
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && (
        <div className="space-y-3">
          {results.length === 0 && !loading ? (
            <p className="text-muted-foreground">No results found for &quot;{query}&quot;.</p>
          ) : (
            results.map(r => (
              <ResultRow key={r.symbol} r={r} onChart={() => setChartStock({ symbol: r.symbol, exchange: r.exchange, name: r.name })} />
            ))
          )}
        </div>
      )}

      {chartStock && (
        <StockChartModal
          symbol={chartStock.symbol}
          exchange={chartStock.exchange}
          name={chartStock.name}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — tab switcher
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "search" | "entry-screen";

export default function SearchPage() {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">Search stocks or screen for technical entry points</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40 w-fit border border-border">
        {([
          { id: "search",       label: "Stock Search",          Icon: Search },
          { id: "entry-screen", label: "Entry Point Screening", Icon: Target },
        ] as { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              activeTab === id
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "search"        && <StockSearchTab />}
      {activeTab === "entry-screen"  && <EntryScreenTab />}
    </div>
  );
}
