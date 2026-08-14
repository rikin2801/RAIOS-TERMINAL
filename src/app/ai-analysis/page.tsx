"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";
import { formatCurrency } from "@/lib/utils";
import type { Holding, Phase1AnalysisResult } from "@/types";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BrainCircuit,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";

// ── colour helpers ────────────────────────────────────────────────────────────

const DEC: Record<string, { label: string; dot: string; badge: string; border: string }> = {
  BUY:          { label: "BUY",          dot: "bg-green-400",  badge: "text-green-400  bg-green-400/10  border-green-400/40",  border: "border-green-400/30"  },
  WAIT:         { label: "WAIT",         dot: "bg-amber-400",  badge: "text-amber-400  bg-amber-400/10  border-amber-400/40",  border: "border-amber-400/30"  },
  HOLD:         { label: "HOLD",         dot: "bg-sky-400",    badge: "text-sky-400    bg-sky-400/10    border-sky-400/40",    border: "border-sky-400/30"    },
  BOOK_PROFITS: { label: "BOOK PROFITS", dot: "bg-orange-400", badge: "text-orange-400 bg-orange-400/10 border-orange-400/40", border: "border-orange-400/30" },
  SELL:         { label: "SELL",         dot: "bg-red-400",    badge: "text-red-400    bg-red-400/10    border-red-400/40",    border: "border-red-400/30"    },
};

const HEALTH_CLS: Record<string, string> = { STRONG: "text-green-400", STABLE: "text-amber-400", WEAK: "text-red-400" };
const PRICE_CLS:  Record<string, string> = { ATTRACTIVE: "text-green-400", FAIRLY_VALUED: "text-amber-400", EXPENSIVE: "text-red-400" };

function trendCls(t: string) {
  if (t === "UPTREND")   return "bg-green-400/10 border-green-400/40 text-green-400";
  if (t === "DOWNTREND") return "bg-red-400/10   border-red-400/40   text-red-400";
  return                        "bg-amber-400/10 border-amber-400/40 text-amber-400";
}
function trendIcon(t: string) {
  if (t === "UPTREND")   return <TrendingUp   className="h-3 w-3" />;
  if (t === "DOWNTREND") return <TrendingDown className="h-3 w-3" />;
  return                        <Minus        className="h-3 w-3" />;
}
function trendShort(t: string) {
  if (t === "UPTREND")   return "UP";
  if (t === "DOWNTREND") return "DOWN";
  return "SIDE";
}

// RSI / MACD / Stoch colour + context
function rsiCls(v: number)   { return v < 35 ? "text-green-400" : v > 70 ? "text-red-400" : "text-amber-400"; }
function stochCls(v: number) { return v < 25 ? "text-green-400" : v > 80 ? "text-red-400" : "text-amber-400"; }
function macdCls(bull: boolean) { return bull ? "text-green-400" : "text-red-400"; }

function rsiCtx(v: number)   { return v < 35 ? "Oversold — potential bounce zone" : v > 70 ? "Overbought — watch for reversal" : "Healthy — room to extend"; }
function stochCtx(v: number) { return v < 25 ? "Oversold — watch for bounce" : v > 80 ? "Overbought — watch for pullback" : "Mid-range — no extreme signal"; }
function macdCtx(bull: boolean, hist: number) {
  if (bull && hist > 0)  return "Positive & rising — momentum building";
  if (!bull && hist < 0) return "Negative — distribution pressure";
  return "Near zero — momentum neutral";
}

function analystCls(c: string) {
  if (c.includes("buy")) return "text-green-400 bg-green-400/10";
  if (c.includes("sell")) return "text-red-400 bg-red-400/10";
  return "text-amber-400 bg-amber-400/10";
}

// ── Target progress bar ───────────────────────────────────────────────────────

function TargetBar({
  label, low, high, price, rangeMin, rangeMax,
}: {
  label: string; low: number; high: number; price: number; rangeMin: number; rangeMax: number;
}) {
  const span = rangeMax - rangeMin || 1;
  const barLeft  = ((low  - rangeMin) / span) * 100;
  const barWidth = ((high - low)      / span) * 100;
  const curLeft  = Math.min(Math.max(((price - rangeMin) / span) * 100, 0), 100);

  return (
    <div className="flex items-center gap-3 py-2 border-t border-border/50 first:border-t-0">
      <span className="w-6 shrink-0 text-[11px] font-bold text-muted-foreground">{label}</span>
      <div className="relative flex-1 h-1 rounded-full bg-muted/40">
        <div
          className="absolute top-0 h-1 rounded-full opacity-70"
          style={{
            left: `${barLeft}%`,
            width: `${barWidth}%`,
            background: "linear-gradient(90deg, #3B82F6, #22C55E)",
          }}
        />
        {/* current price marker */}
        <div
          className="absolute -top-1 w-0.5 h-3 rounded-sm bg-amber-400"
          style={{ left: `${curLeft}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">
        ₹{low.toFixed(0)}<span className="text-muted-foreground font-normal"> – </span>₹{high.toFixed(0)}
      </span>
    </div>
  );
}

// ── Indicator block ───────────────────────────────────────────────────────────

function IndBlock({
  label,
  rsi, macdHist, macdBullish, stochK,
}: {
  label: string;
  rsi: number; macdHist: number; macdBullish: boolean; stochK: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground pb-2 mb-2 border-b border-border/40">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">RSI (14)</p>
          <p className={`text-[13px] font-bold tabular-nums ${rsiCls(rsi)}`}>{rsi.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{rsiCtx(rsi)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">MACD Hist</p>
          <p className={`text-[13px] font-bold tabular-nums ${macdCls(macdBullish)}`}>
            {macdHist >= 0 ? "+" : ""}{macdHist.toFixed(3)}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{macdCtx(macdBullish, macdHist)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Stoch K</p>
          <p className={`text-[13px] font-bold tabular-nums ${stochCls(stochK)}`}>{stochK.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{stochCtx(stochK)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Phase1Card ────────────────────────────────────────────────────────────────

function Phase1Card({ data, holding }: { data: Phase1AnalysisResult; holding: Holding }) {
  const [expanded, setExpanded] = useState(false);
  const d = DEC[data.decision] ?? DEC.HOLD;

  const pnl    = holding.shares * (data.price - holding.avgCost);
  const pnlPct = ((data.price - holding.avgCost) / holding.avgCost) * 100;
  const pnlPos = pnl >= 0;

  // Target bar scale
  const t = data.targets;
  const allLows  = [t.oneMonth.low,  t.threeMonths.low,  t.sixMonths.low,  t.oneYear.low];
  const allHighs = [t.oneMonth.high, t.threeMonths.high, t.sixMonths.high, t.oneYear.high];
  const rangeMin = Math.min(...allLows, data.price) * 0.97;
  const rangeMax = Math.max(...allHighs) * 1.02;

  const fw52Pct = data.fiftyTwoWeekHigh > data.fiftyTwoWeekLow
    ? Math.round(((data.price - data.fiftyTwoWeekLow) / (data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow)) * 100)
    : null;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${d.border}`}>

      {/* ── 1. Header ── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{data.symbol}</p>
          <p className="text-[15px] font-bold text-foreground leading-tight mt-0.5">{data.name || holding.name}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold text-muted-foreground border border-border rounded px-1.5 py-0.5 tracking-wide">
            {holding.exchange}
            {holding.sector ? ` · ${holding.sector}` : ""}
          </span>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
            <span>{holding.shares} shares · avg ₹{holding.avgCost.toFixed(0)}</span>
            <span>·</span>
            <span className={`font-bold ${pnlPos ? "text-green-400" : "text-red-400"}`}>
              {pnlPos ? "+" : ""}{formatCurrency(pnl)} ({pnlPos ? "+" : ""}{pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-extrabold tabular-nums text-foreground leading-none">{formatCurrency(data.price)}</p>
          <p className={`text-[12px] font-semibold mt-1 tabular-nums ${data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}% ({data.changePercent >= 0 ? "+" : ""}₹{data.change.toFixed(2)})
          </p>
          {fw52Pct !== null && (
            <p className="text-[10px] text-muted-foreground mt-1">52W ₹{data.fiftyTwoWeekLow.toFixed(0)} – ₹{data.fiftyTwoWeekHigh.toFixed(0)}</p>
          )}
        </div>
      </div>

      {/* ── 2. Decision ── */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">Phase 1 Decision</p>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-[18px] font-black tracking-wide ${d.badge}`}>
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${d.dot}`} />
          {d.label}
        </div>
      </div>

      {/* ── 3. Four pillars (2×2) ── */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border">
        {/* Trend */}
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Trend (HH/HL)</p>
          <p className={`text-[13px] font-bold ${
            data.trend.primary === "UPTREND" ? "text-green-400" : data.trend.primary === "DOWNTREND" ? "text-red-400" : "text-amber-400"
          }`}>
            {trendIcon(data.trend.primary)}&nbsp;{trendShort(data.trend.primary)}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(["oneYear","sixMonths","threeMonths","oneMonth"] as const).map((tf, i) => {
              const labels = ["1Y","6M","3M","1M"];
              const tr = data.trend[tf] as { trend: string; evidence: string };
              return (
                <span key={tf} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${trendCls(tr.trend)}`}>
                  {trendIcon(tr.trend)}{labels[i]}: {trendShort(tr.trend)}
                </span>
              );
            })}
          </div>
          {data.trend.oneYear.evidence && (
            <p className="text-[10px] text-muted-foreground mt-2 leading-snug">{data.trend.oneYear.evidence}</p>
          )}
        </div>

        {/* Business */}
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Business</p>
          <p className={`text-[13px] font-bold ${HEALTH_CLS[data.businessHealth] ?? "text-foreground"}`}>
            {data.businessHealth === "STRONG" ? "🟢" : data.businessHealth === "STABLE" ? "🟡" : "🔴"} {data.businessHealth}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{data.businessSummary}</p>
        </div>

        {/* Price */}
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Price</p>
          <p className={`text-[13px] font-bold ${PRICE_CLS[data.priceAttractiveness] ?? "text-foreground"}`}>
            {data.priceAttractiveness === "ATTRACTIVE" ? "🟢" : data.priceAttractiveness === "FAIRLY_VALUED" ? "🟡" : "🔴"} {data.priceAttractiveness.replace("_", " ")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{data.priceSummary}</p>
        </div>

        {/* What Changed */}
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">What Changed?</p>
          <p className="text-[11px] text-foreground leading-snug">{data.whatChanged}</p>
        </div>
      </div>

      {/* ── 4. Entry zone + Confirmation level ── */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Preferred Entry Zone</p>
          <p className="text-[14px] font-bold tabular-nums text-foreground">
            ₹{data.entryZone.low.toFixed(0)} – ₹{data.entryZone.high.toFixed(0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Near support at ₹{data.support.toFixed(0)} from price structure
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1">Confirmation Level</p>
          <p className="text-[14px] font-bold tabular-nums text-foreground">
            ₹{data.confirmationLevel > 0 ? data.confirmationLevel.toFixed(0) : data.resistance.toFixed(0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Prior resistance — sustained break confirms next leg up
          </p>
        </div>
      </div>

      {/* ── 5. Analyst consensus ── */}
      {data.analystConsensus && (
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-1.5">Analyst Consensus</p>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${analystCls(data.analystConsensus)}`}>
                {data.analystConsensus.toUpperCase().replace("_", " ")}
              </span>
              {data.analystCount && (
                <span className="text-[11px] text-muted-foreground">
                  {data.analystCount} analysts{data.analystTarget ? ` · Avg ₹${data.analystTarget.toFixed(0)}` : ""}
                </span>
              )}
            </div>
          </div>
          {data.analystTarget && (
            <div className="text-right shrink-0">
              <p className="text-[14px] font-bold tabular-nums text-foreground">₹{data.analystTarget.toFixed(0)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Analyst avg target</p>
            </div>
          )}
        </div>
      )}

      {/* ── 6. Target ranges with progress bars ── */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3">
          Price Target Ranges · Evidence-Based
        </p>
        <TargetBar label="1M" low={t.oneMonth.low}    high={t.oneMonth.high}    price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="3M" low={t.threeMonths.low} high={t.threeMonths.high} price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="6M" low={t.sixMonths.low}   high={t.sixMonths.high}   price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="1Y" low={t.oneYear.low}     high={t.oneYear.high}     price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
      </div>

      {/* ── 7. Technical indicators ── */}
      <div className="px-5 py-4 border-b border-border space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Supporting Technical Context — Not Decision Drivers
        </p>
        <IndBlock
          label={`Daily Timeframe`}
          rsi={data.daily.rsi}
          macdHist={data.daily.macdHist}
          macdBullish={data.daily.macdBullish}
          stochK={data.daily.stochK}
        />
        {data.hourly && (
          <IndBlock
            label="Hourly Timeframe"
            rsi={data.hourly.rsi}
            macdHist={data.hourly.macdHist}
            macdBullish={data.hourly.macdBullish}
            stochK={data.hourly.stochK}
          />
        )}
        <p className="text-[9px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
          ⚠ RSI, MACD and Stochastic above are supporting context only. The {d.label} decision is driven by trend structure (Higher Highs / Higher Lows), business fundamentals, and price attractiveness — not by these indicator levels individually.
        </p>
      </div>

      {/* ── 8. Why + What would change (collapsible) ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Why {d.label}? &amp; What Would Change
        </p>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <>
          <div className="px-5 py-4 border-t border-border">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3">Why {d.label}?</p>
            <ol className="space-y-2.5">
              {data.whyDecision.map((r, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="shrink-0 h-[18px] w-[18px] rounded-full border border-border bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[12px] text-foreground/80 leading-relaxed">{r}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="px-5 py-4 bg-muted/20 rounded-b-xl border-t border-border">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-2">What Would Change This Decision?</p>
            <ul className="space-y-1.5">
              {data.whatWouldChange.map((w, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-foreground/80 leading-relaxed items-start">
                  <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400 mt-1.5" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard({ holding }: { holding: Holding }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-muted rounded" />
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
        <div className="space-y-2 text-right">
          <div className="h-7 w-28 bg-muted rounded" />
          <div className="h-3 w-20 bg-muted rounded ml-auto" />
        </div>
      </div>
      <div className="px-5 py-4 border-b border-border">
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-10 w-36 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border">
        {[1,2,3,4].map(i => (
          <div key={i} className="px-4 py-4 space-y-2">
            <div className="h-2.5 w-16 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-2.5 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="px-5 py-4 flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-muted-foreground/30" />
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

  useEffect(() => {
    const pid = activePortfolioId === ALL_PORTFOLIOS_ID ? "__ALL__" : activePortfolioId;
    setLoadingHoldings(true);
    fetch(`/api/holdings?portfolioId=${pid}`)
      .then(r => r.json())
      .then((all: Holding[]) => {
        const seen = new Set<string>();
        const unique = all.filter(h => { if (seen.has(h.symbol)) return false; seen.add(h.symbol); return true; });
        setHoldings(unique);
        setAnalysis(Object.fromEntries(unique.map(h => [h.symbol, { status: "loading" }])));
      })
      .catch(() => setHoldings([]))
      .finally(() => setLoadingHoldings(false));
  }, [activePortfolioId]);

  const runAnalysis = useCallback(async (list: Holding[], force = false) => {
    if (fetchingRef.current && !force) return;
    fetchingRef.current = true;
    setAnalysis(Object.fromEntries(list.map(h => [h.symbol, { status: "loading" }])));

    async function processOne(h: Holding) {
      try {
        const url = `/api/analysis/${h.symbol}?exchange=${h.exchange || "NSE"}${force ? "&force=true" : ""}`;
        const data = await fetch(url).then(r => r.json());
        if (data.phase1) {
          setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "done", data: data.phase1 } }));
        } else {
          setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "error", error: data.error || "No Phase 1 data" } }));
        }
      } catch {
        setAnalysis(prev => ({ ...prev, [h.symbol]: { status: "error", error: "Network error" } }));
      }
    }

    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map(processOne));
    }
    fetchingRef.current = false;
  }, []);

  useEffect(() => {
    if (holdings.length > 0) runAnalysis(holdings);
  }, [holdings, runAnalysis]);

  const doneCount = Object.values(analysis).filter(a => a.status === "done").length;

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

  if (!loadingHoldings && holdings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <BrainCircuit className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No holdings in this portfolio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
          onClick={() => runAnalysis(holdings, true)}
          disabled={fetchingRef.current}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${fetchingRef.current ? "animate-spin" : ""}`} />
          Refresh All
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {holdings.map(holding => {
          const state = analysis[holding.symbol];
          if (!state || state.status === "loading") return <SkeletonCard key={holding.symbol} holding={holding} />;
          if (state.status === "error") return (
            <div key={holding.symbol} className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{holding.symbol}</p>
                <p className="text-xs text-muted-foreground">{state.error}</p>
              </div>
            </div>
          );
          return <Phase1Card key={holding.symbol} data={state.data!} holding={holding} />;
        })}
      </div>
    </div>
  );
}
