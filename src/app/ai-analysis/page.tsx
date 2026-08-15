"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";
import { formatCurrency } from "@/lib/utils";
import type { Holding, Phase1AnalysisResult, ProfitBookingResult, ProfitBookingStatus } from "@/types";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, BrainCircuit,
  ChevronDown, ChevronUp, AlertCircle, TrendingDown as BookIcon,
} from "lucide-react";

// ── shared Phase1Card component (also exported for Search page) ───────────────

export const DEC: Record<string, { label: string; dot: string; badge: string; border: string; summaryBadge: string }> = {
  BUY:          { label: "BUY",          dot: "bg-green-400",  badge: "text-green-400  bg-green-400/10  border-green-400/40",  border: "border-green-400/30",  summaryBadge: "text-green-400  bg-green-400/10  border border-green-400/40"  },
  WAIT:         { label: "WAIT",         dot: "bg-amber-400",  badge: "text-amber-400  bg-amber-400/10  border-amber-400/40",  border: "border-amber-400/30",  summaryBadge: "text-amber-400  bg-amber-400/10  border border-amber-400/40"  },
  HOLD:         { label: "HOLD",         dot: "bg-sky-400",    badge: "text-sky-400    bg-sky-400/10    border-sky-400/40",    border: "border-sky-400/30",    summaryBadge: "text-sky-400    bg-sky-400/10    border border-sky-400/40"    },
  BOOK_PROFITS: { label: "BOOK PROFITS", dot: "bg-orange-400", badge: "text-orange-400 bg-orange-400/10 border-orange-400/40", border: "border-orange-400/30", summaryBadge: "text-orange-400 bg-orange-400/10 border border-orange-400/40" },
  SELL:         { label: "SELL",         dot: "bg-red-400",    badge: "text-red-400    bg-red-400/10    border-red-400/40",    border: "border-red-400/30",    summaryBadge: "text-red-400    bg-red-400/10    border border-red-400/40"    },
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

function rsiCls(v: number)  { return v < 35 ? "text-green-400" : v > 70 ? "text-red-400" : "text-amber-400"; }
function stochCls(v: number){ return v < 25 ? "text-green-400" : v > 80 ? "text-red-400" : "text-amber-400"; }
function macdCls(bull: boolean) { return bull ? "text-green-400" : "text-red-400"; }
function rsiCtx(v: number)  { return v < 35 ? "Oversold — potential bounce zone" : v > 70 ? "Overbought — watch for reversal" : "Healthy — room to extend"; }
function stochCtx(v: number){ return v < 25 ? "Oversold — watch for bounce" : v > 80 ? "Overbought — watch for pullback" : "Mid-range — no extreme signal"; }
function macdCtx(bull: boolean, dir: "RISING" | "FALLING") {
  if (bull  && dir === "RISING")  return "↑ Positive · ↑ Rising — momentum building";
  if (bull  && dir === "FALLING") return "↑ Positive · ↓ Slowing — watch for reversal";
  if (!bull && dir === "FALLING") return "↓ Negative · ↓ Falling — downward pressure";
  return "↓ Negative · ↑ Recovering — potential floor forming";
}
function analystCls(c: string) {
  if (c.includes("buy"))  return "text-green-400 bg-green-400/10";
  if (c.includes("sell")) return "text-red-400   bg-red-400/10";
  return "text-amber-400 bg-amber-400/10";
}

// ── Section label (white, bigger, readable) ───────────────────────────────────
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
      {children}
    </p>
  );
}

// ── Target progress bar ───────────────────────────────────────────────────────
function TargetBar({ label, low, high, price, rangeMin, rangeMax }: {
  label: string; low: number; high: number; price: number; rangeMin: number; rangeMax: number;
}) {
  const span = rangeMax - rangeMin || 1;
  const barLeft  = ((low  - rangeMin) / span) * 100;
  const barWidth = ((high - low)      / span) * 100;
  const curLeft  = Math.min(Math.max(((price - rangeMin) / span) * 100, 0), 100);
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border/40 first:border-t-0">
      <span className="w-6 shrink-0 text-xs font-bold text-foreground">{label}</span>
      <div className="relative flex-1 h-1 rounded-full bg-muted/40">
        <div className="absolute top-0 h-1 rounded-full opacity-70" style={{ left:`${barLeft}%`, width:`${barWidth}%`, background:"linear-gradient(90deg,#3B82F6,#22C55E)" }} />
        <div className="absolute -top-1 w-0.5 h-3 rounded-sm bg-amber-400" style={{ left:`${curLeft}%`, transform:"translateX(-50%)" }} />
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
        ₹{low.toFixed(0)}<span className="text-muted-foreground font-normal"> – </span>₹{high.toFixed(0)}
      </span>
    </div>
  );
}

// ── Indicator block ───────────────────────────────────────────────────────────
function IndBlock({ label, rsi, macdHist, macdBullish, macdDir, stochK }: {
  label: string; rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground pb-2 mb-2 border-b border-border/40">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1">RSI (14)</p>
          <p className={`text-[13px] font-bold tabular-nums ${rsiCls(rsi)}`}>{rsi.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{rsiCtx(rsi)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1">MACD Momentum</p>
          <p className={`text-[13px] font-bold tabular-nums ${macdCls(macdBullish)}`}>{macdHist >= 0 ? "+" : ""}{macdHist.toFixed(3)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{macdCtx(macdBullish, macdDir)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/70 mb-1">Stoch K</p>
          <p className={`text-[13px] font-bold tabular-nums ${stochCls(stochK)}`}>{stochK.toFixed(1)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{stochCtx(stochK)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Phase1 card body (shared between Holdings page and Search page) ───────────
export function Phase1CardBody({
  data,
  holding,
}: {
  data: Phase1AnalysisResult;
  holding?: { shares?: number; avgCost?: number; exchange?: string; sector?: string | null };
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const d = DEC[data.decision] ?? DEC.HOLD;

  const t = data.targets;
  const allLows  = [t.oneMonth.low,  t.threeMonths.low,  t.sixMonths.low,  t.oneYear.low];
  const allHighs = [t.oneMonth.high, t.threeMonths.high, t.sixMonths.high, t.oneYear.high];
  const rangeMin = Math.min(...allLows, data.price) * 0.97;
  const rangeMax = Math.max(...allHighs) * 1.02;

  const showPnL = holding?.shares && holding?.avgCost;
  const pnl    = showPnL ? holding!.shares! * (data.price - holding!.avgCost!) : 0;
  const pnlPct = showPnL ? ((data.price - holding!.avgCost!) / holding!.avgCost!) * 100 : 0;

  return (
    <div className="border-t border-border">
      {/* price + meta */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-muted-foreground border border-border rounded px-1.5 py-0.5">
              {holding?.exchange || "NSE"}{holding?.sector ? ` · ${holding.sector}` : ""}
            </span>
            {data.pe && <span className="text-[10px] text-muted-foreground">P/E {data.pe.toFixed(1)}</span>}
          </div>
          {showPnL && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {holding!.shares} shares · avg ₹{holding!.avgCost!.toFixed(0)} ·{" "}
              <span className={`font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)} ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
              </span>
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-extrabold tabular-nums text-foreground leading-none">{formatCurrency(data.price)}</p>
          <p className={`text-sm font-semibold mt-1 tabular-nums ${data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%
            {data.change !== 0 && ` (${data.changePercent >= 0 ? "+" : ""}₹${data.change.toFixed(2)})`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">52W ₹{data.fiftyTwoWeekLow.toFixed(0)} – ₹{data.fiftyTwoWeekHigh.toFixed(0)}</p>
        </div>
      </div>

      {/* Decision badge */}
      <div className="px-5 py-4 border-b border-border">
        <SLabel>Phase 1 Decision</SLabel>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-[18px] font-black tracking-wide ${d.badge}`}>
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${d.dot}`} />
          {d.label}
        </div>
      </div>

      {/* 4 Pillars 2×2 */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border">
        <div className="px-4 py-4">
          <SLabel>Trend (HH/HL)</SLabel>
          <p className={`text-sm font-bold flex items-center gap-1 ${data.trend.primary === "UPTREND" ? "text-green-400" : data.trend.primary === "DOWNTREND" ? "text-red-400" : "text-amber-400"}`}>
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
        <div className="px-4 py-4">
          <SLabel>Business</SLabel>
          <p className={`text-sm font-bold ${HEALTH_CLS[data.businessHealth] ?? "text-foreground"}`}>
            {data.businessHealth === "STRONG" ? "🟢" : data.businessHealth === "STABLE" ? "🟡" : "🔴"} {data.businessHealth}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{data.businessSummary}</p>
        </div>
        <div className="px-4 py-4">
          <SLabel>Price</SLabel>
          <p className={`text-sm font-bold ${PRICE_CLS[data.priceAttractiveness] ?? "text-foreground"}`}>
            {data.priceAttractiveness === "ATTRACTIVE" ? "🟢" : data.priceAttractiveness === "FAIRLY_VALUED" ? "🟡" : "🔴"} {data.priceAttractiveness.replace("_", " ")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{data.priceSummary}</p>
        </div>
        <div className="px-4 py-4">
          <SLabel>What Changed?</SLabel>
          <p className="text-[11px] text-foreground leading-snug">{data.whatChanged}</p>
        </div>
      </div>

      {/* Entry zone + Confirmation level */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border">
        <div>
          <SLabel>Preferred Entry Zone</SLabel>
          <p className="text-[14px] font-bold tabular-nums text-foreground">₹{data.entryZone.low.toFixed(0)} – ₹{data.entryZone.high.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Near support at ₹{data.support.toFixed(0)} from price structure</p>
        </div>
        <div>
          <SLabel>Confirmation Level</SLabel>
          <p className="text-[14px] font-bold tabular-nums text-foreground">
            ₹{data.confirmationLevel > 0 ? data.confirmationLevel.toFixed(0) : data.resistance.toFixed(0)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Prior resistance — sustained break confirms next leg up</p>
        </div>
      </div>

      {/* Analyst consensus */}
      {data.analystConsensus && (
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
          <div>
            <SLabel>Analyst Consensus</SLabel>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${analystCls(data.analystConsensus)}`}>
                {data.analystConsensus.toUpperCase().replace("_", " ")}
              </span>
              {data.analystCount && (
                <span className="text-[11px] text-muted-foreground">{data.analystCount} analysts{data.analystTarget ? ` · Avg ₹${data.analystTarget.toFixed(0)}` : ""}</span>
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

      {/* Target ranges with bars */}
      <div className="px-5 py-4 border-b border-border">
        <SLabel>Price Target Ranges · Evidence-Based</SLabel>
        <TargetBar label="1M" low={t.oneMonth.low}    high={t.oneMonth.high}    price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="3M" low={t.threeMonths.low} high={t.threeMonths.high} price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="6M" low={t.sixMonths.low}   high={t.sixMonths.high}   price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
        <TargetBar label="1Y" low={t.oneYear.low}     high={t.oneYear.high}     price={data.price} rangeMin={rangeMin} rangeMax={rangeMax} />
      </div>

      {/* Technical indicators */}
      <div className="px-5 py-4 border-b border-border space-y-3">
        <SLabel>Supporting Technical Context — Not Decision Drivers</SLabel>
        {data.weekly && (
          <IndBlock label="Weekly Timeframe" rsi={data.weekly.rsi} macdHist={data.weekly.macdHist} macdBullish={data.weekly.macdBullish} macdDir={data.weekly.macdDir} stochK={data.weekly.stochK} />
        )}
        <IndBlock label="Daily Timeframe" rsi={data.daily.rsi} macdHist={data.daily.macdHist} macdBullish={data.daily.macdBullish} macdDir={data.daily.macdDir} stochK={data.daily.stochK} />
        {data.hourly && (
          <IndBlock label="Hourly Timeframe" rsi={data.hourly.rsi} macdHist={data.hourly.macdHist} macdBullish={data.hourly.macdBullish} macdDir={data.hourly.macdDir} stochK={data.hourly.stochK} />
        )}
        <p className="text-[9px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
          ⚠ RSI, MACD and Stochastic are supporting context only. The {d.label} decision is driven by trend structure (HH/HL), business fundamentals, and price attractiveness — not indicator levels.
        </p>
      </div>

      {/* Why + What would change */}
      <button onClick={() => setWhyOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/20 transition-colors">
        <p className="text-xs font-bold uppercase tracking-wider text-foreground">Why {d.label}? &amp; What Would Change</p>
        {whyOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {whyOpen && (
        <>
          <div className="px-5 py-4 border-t border-border">
            <SLabel>Why {d.label}?</SLabel>
            <ol className="space-y-2.5">
              {data.whyDecision.map((r, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="shrink-0 h-[18px] w-[18px] rounded-full border border-border bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-0.5">{i + 1}</span>
                  <span className="text-[12px] text-foreground/80 leading-relaxed">{r}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="px-5 py-4 bg-muted/20 rounded-b-xl border-t border-border">
            <SLabel>What Would Change This Decision?</SLabel>
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

// ── Profit Booking components ─────────────────────────────────────────────────

export const PB_STATUS: Record<ProfitBookingStatus, {
  emoji: string; label: string;
  stripe: string; heroBg: string; heroBorder: string; heroText: string;
  badgeBg: string; badgeText: string; badgeBorder: string;
}> = {
  LET_PROFITS_RUN: {
    emoji: "🟢", label: "Let Profits Run",
    stripe: "bg-green-500",
    heroBg: "bg-green-950/40", heroBorder: "border-green-800/40", heroText: "text-green-400",
    badgeBg: "bg-green-400/10", badgeText: "text-green-400", badgeBorder: "border-green-400/40",
  },
  WATCH: {
    emoji: "🟡", label: "Profit Booking Watch",
    stripe: "bg-amber-400",
    heroBg: "bg-amber-950/40", heroBorder: "border-amber-700/40", heroText: "text-amber-400",
    badgeBg: "bg-amber-400/10", badgeText: "text-amber-400", badgeBorder: "border-amber-400/40",
  },
  ALERT: {
    emoji: "🟠", label: "Profit Booking Alert",
    stripe: "bg-orange-500",
    heroBg: "bg-orange-950/40", heroBorder: "border-orange-700/40", heroText: "text-orange-400",
    badgeBg: "bg-orange-400/10", badgeText: "text-orange-400", badgeBorder: "border-orange-400/40",
  },
  EXIT: {
    emoji: "🔴", label: "Protect / Exit Review",
    stripe: "bg-red-500",
    heroBg: "bg-red-950/40", heroBorder: "border-red-800/40", heroText: "text-red-400",
    badgeBg: "bg-red-400/10", badgeText: "text-red-400", badgeBorder: "border-red-400/40",
  },
};

const SEVERITY_CLS: Record<string, string> = {
  green:  "text-green-400  bg-green-400/10  border-green-400/30",
  amber:  "text-amber-400  bg-amber-400/10  border-amber-400/30",
  orange: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  red:    "text-red-400    bg-red-400/10    border-red-400/30",
};

function TriggerRow({ trigger }: { trigger: ProfitBookingResult["triggers"][0] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <span className="text-sm font-semibold text-foreground">{trigger.name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold tabular-nums text-foreground">{trigger.value}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${SEVERITY_CLS[trigger.severity]}`}>
          {trigger.tag}
        </span>
      </div>
    </div>
  );
}

export function ProfitBookingCardBody({
  data,
  holding,
}: {
  data: ProfitBookingResult;
  holding?: { shares?: number; avgCost?: number; exchange?: string };
}) {
  const st = PB_STATUS[data.status];
  const showPnL = holding?.shares && holding?.avgCost && data.price > 0;
  const pnl    = showPnL ? holding!.shares! * (data.price - holding!.avgCost!) : 0;
  const pnlPct = showPnL ? ((data.price - holding!.avgCost!) / holding!.avgCost!) * 100 : 0;
  const rangeSpan = data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow || 1;

  return (
    <div className="border-t border-border">
      {/* Price + P&L strip */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-border">
        <div>
          {showPnL && (
            <p className="text-xs text-muted-foreground">
              {holding!.shares} shares · avg ₹{holding!.avgCost!.toFixed(0)} ·{" "}
              <span className={`font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)} ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
              </span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            52W ₹{data.fiftyTwoWeekLow.toFixed(0)} – ₹{data.fiftyTwoWeekHigh.toFixed(0)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-extrabold tabular-nums text-foreground leading-none">{formatCurrency(data.price)}</p>
          <p className={`text-sm font-semibold mt-1 tabular-nums ${data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
            {data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(data.changePercent).toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Status hero */}
      <div className={`px-5 py-6 border-b border-border flex flex-col items-center text-center gap-2 ${st.heroBg}`}>
        <span className="text-4xl leading-none">{st.emoji}</span>
        <p className={`text-xl font-black uppercase tracking-wide ${st.heroText}`}>{st.label}</p>
        <p className="text-sm text-foreground/70 max-w-sm leading-relaxed">{data.suggestedAction}</p>
      </div>

      {/* 52W range bar */}
      <div className="px-5 py-4 border-b border-border">
        <SLabel>52-Week Range Position — {data.rangePosition}% of yearly range</SLabel>
        <div className="relative h-1.5 rounded-full bg-muted/40 mt-2 mb-3">
          <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(to right, #ef4444, #f59e0b, #22c55e)" }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-amber-400 z-10"
            style={{ left: `${Math.min(Math.max(data.rangePosition, 2), 98)}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>52W Low ₹{data.fiftyTwoWeekLow.toFixed(0)}</span>
          <span className="text-amber-400 font-bold">▲ ₹{data.price.toFixed(2)}</span>
          <span>52W High ₹{data.fiftyTwoWeekHigh.toFixed(0)}</span>
        </div>
      </div>

      {/* Triggers */}
      <div className="px-5 py-4 border-b border-border space-y-2">
        <SLabel>Why this alert triggered</SLabel>
        {data.triggers.map((t, i) => <TriggerRow key={i} trigger={t} />)}
      </div>

      {/* Gemini reasoning */}
      <div className="px-5 py-4 border-b border-border">
        <SLabel>Why the AI suggests this</SLabel>
        <div className="space-y-3 mt-1">
          {data.reasoning.map((r, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="shrink-0 h-5 w-5 rounded-full border border-border bg-muted flex items-center justify-center text-[10px] font-bold text-primary mt-0.5">
                {i + 1}
              </span>
              <p className="text-[13px] text-foreground/85 leading-relaxed">{r}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4-state mini legend */}
      <div className="flex items-center gap-2 px-5 py-3">
        {(["LET_PROFITS_RUN", "WATCH", "ALERT", "EXIT"] as ProfitBookingStatus[]).map(s => {
          const m = PB_STATUS[s];
          const active = s === data.status;
          return (
            <div key={s} className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-center transition-colors ${active ? `${m.badgeBg} ${m.badgeBorder}` : "border-border"}`}>
              <span className="text-base leading-none">{m.emoji}</span>
              <span className={`text-[9px] font-bold uppercase leading-tight ${active ? m.badgeText : "text-muted-foreground"}`}>
                {m.label.split(" ").slice(0, 2).join(" ")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Profit Booking Accordion row ──────────────────────────────────────────────

interface PBState {
  status: "loading" | "done" | "error" | "skipped";
  data?: ProfitBookingResult;
  error?: string;
}

function PBAccordionRow({ holding, state }: { holding: Holding; state: PBState }) {
  const [open, setOpen] = useState(false);
  const st = state.data ? PB_STATUS[state.data.status] : null;

  if (state.status === "skipped") {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4 opacity-50">
        <div className="flex-1 min-w-0">
          <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{holding.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{holding.name}</p>
        </div>
        <span className="text-xs text-muted-foreground border border-border rounded px-2 py-1">Loss position — not applicable</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-card overflow-hidden transition-colors ${st ? st.badgeBorder : "border-border"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{holding.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{holding.name}</p>
        </div>

        {state.status === "loading" && (
          <span className="shrink-0 text-[11px] text-muted-foreground animate-pulse px-3 py-1.5 rounded border border-border">Analysing…</span>
        )}
        {state.status === "error" && (
          <span className="shrink-0 text-[11px] text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Error
          </span>
        )}
        {state.status === "done" && state.data && st && (
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-sm font-black px-3 py-1.5 rounded border ${st.badgeBg} ${st.badgeText} ${st.badgeBorder}`}>
              {st.emoji} {st.label}
            </span>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(state.data.price)}</p>
              <p className={`text-[11px] font-semibold tabular-nums ${state.data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                {state.data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(state.data.changePercent).toFixed(2)}%
              </p>
            </div>
          </div>
        )}
      </button>

      {open && state.status === "done" && state.data && (
        <ProfitBookingCardBody
          data={state.data}
          holding={{ shares: holding.shares, avgCost: holding.avgCost, exchange: holding.exchange }}
        />
      )}
      {open && state.status === "loading" && (
        <div className="px-5 py-6 border-t border-border flex items-center gap-2 text-muted-foreground">
          <BrainCircuit className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Analysing {holding.symbol} for profit booking signals…</span>
        </div>
      )}
      {open && state.status === "error" && (
        <div className="px-5 py-4 border-t border-border text-sm text-muted-foreground">{state.error}</div>
      )}
    </div>
  );
}

// ── Accordion row ─────────────────────────────────────────────────────────────

interface AnalysisState {
  status: "loading" | "done" | "error";
  data?: Phase1AnalysisResult;
  error?: string;
}

function AccordionRow({ holding, state }: { holding: Holding; state: AnalysisState }) {
  const [open, setOpen] = useState(false);
  const d = state.data ? (DEC[state.data.decision] ?? DEC.HOLD) : null;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden transition-colors ${d ? d.border : "border-border"}`}>
      {/* Summary header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        {/* Expand icon */}
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>

        {/* Stock name — BIG, CAPS, BOLD */}
        <div className="flex-1 min-w-0">
          <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{holding.symbol}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{holding.name}</p>
        </div>

        {/* Decision badge or loading */}
        {state.status === "loading" && (
          <span className="shrink-0 text-[11px] text-muted-foreground animate-pulse px-3 py-1.5 rounded border border-border">
            Analysing…
          </span>
        )}
        {state.status === "error" && (
          <span className="shrink-0 text-[11px] text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> Error
          </span>
        )}
        {state.status === "done" && state.data && d && (
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-sm font-black px-3 py-1.5 rounded ${d.summaryBadge}`}>{d.label}</span>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(state.data.price)}</p>
              <p className={`text-[11px] font-semibold tabular-nums ${state.data.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                {state.data.changePercent >= 0 ? "▲" : "▼"} {Math.abs(state.data.changePercent).toFixed(2)}%
              </p>
            </div>
          </div>
        )}
      </button>

      {/* Expanded body */}
      {open && state.status === "done" && state.data && (
        <Phase1CardBody
          data={state.data}
          holding={{ shares: holding.shares, avgCost: holding.avgCost, exchange: holding.exchange, sector: holding.sector }}
        />
      )}
      {open && state.status === "error" && (
        <div className="px-5 py-4 border-t border-border text-sm text-muted-foreground">{state.error}</div>
      )}
      {open && state.status === "loading" && (
        <div className="px-5 py-6 border-t border-border flex items-center gap-2 text-muted-foreground">
          <BrainCircuit className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Running Phase 1 Analysis for {holding.symbol}…</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PB_STATUS_ORDER: ProfitBookingStatus[] = ["EXIT", "ALERT", "WATCH", "LET_PROFITS_RUN"];

export default function AIAnalysisPage() {
  const { activePortfolioId } = usePortfolio();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [activeTab, setActiveTab] = useState<"phase1" | "profit-booking">("phase1");

  // Phase 1 state
  const [analysis, setAnalysis] = useState<Record<string, AnalysisState>>({});
  const fetchingRef = useRef(false);

  // Profit Booking state
  const [pbAnalysis, setPbAnalysis] = useState<Record<string, PBState>>({});
  const pbFetchingRef = useRef(false);

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

  // Phase 1 runner
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

  // Profit Booking runner — only runs when tab is first opened
  const runProfitBooking = useCallback(async (list: Holding[]) => {
    if (pbFetchingRef.current) return;
    pbFetchingRef.current = true;

    // Mark all as loading or skipped (loss-making stocks have no avgCost / negative P&L can't be determined without price yet, so we'll check after fetch)
    setPbAnalysis(Object.fromEntries(list.map(h => [h.symbol, { status: "loading" }])));

    async function processPB(h: Holding) {
      try {
        const res  = await fetch(`/api/profit-booking/${h.symbol}?exchange=${h.exchange || "NSE"}`);
        const data: ProfitBookingResult = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");

        // If holding is in a loss (currentPrice < avgCost), skip profit booking
        if (h.avgCost && data.price < h.avgCost) {
          setPbAnalysis(prev => ({ ...prev, [h.symbol]: { status: "skipped" } }));
        } else {
          setPbAnalysis(prev => ({ ...prev, [h.symbol]: { status: "done", data } }));
        }
      } catch (e) {
        setPbAnalysis(prev => ({ ...prev, [h.symbol]: { status: "error", error: String(e) } }));
      }
    }

    for (let i = 0; i < list.length; i += 3) {
      await Promise.all(list.slice(i, i + 3).map(processPB));
    }
    pbFetchingRef.current = false;
  }, []);

  useEffect(() => {
    if (holdings.length > 0) runAnalysis(holdings);
  }, [holdings, runAnalysis]);

  // Lazy-load profit booking when tab is first opened
  useEffect(() => {
    if (activeTab === "profit-booking" && holdings.length > 0 && Object.keys(pbAnalysis).length === 0) {
      runProfitBooking(holdings);
    }
  }, [activeTab, holdings, pbAnalysis, runProfitBooking]);

  const doneCount = Object.values(analysis).filter(a => a.status === "done").length;
  const pbDoneCount = Object.values(pbAnalysis).filter(a => a.status === "done").length;

  // Sort PB holdings by urgency
  const sortedForPB = [...holdings].sort((a, b) => {
    const sa = pbAnalysis[a.symbol];
    const sb = pbAnalysis[b.symbol];
    if (!sa || !sb) return 0;
    const ia = sa.status === "done" ? PB_STATUS_ORDER.indexOf(sa.data!.status) : 99;
    const ib = sb.status === "done" ? PB_STATUS_ORDER.indexOf(sb.data!.status) : 99;
    return ia - ib;
  });

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
      {/* Page header + tabs */}
      <div className="border-b border-border shrink-0">
        <div className="flex items-center justify-between px-6 pt-4 pb-0">
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-primary" />
            AI Analysis
          </h1>
          <button
            onClick={() => activeTab === "phase1" ? runAnalysis(holdings, true) : runProfitBooking(holdings)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 px-6 pb-0 mt-3">
          <button
            onClick={() => setActiveTab("phase1")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "phase1"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Phase 1 Engine
            <span className="text-[10px] opacity-60">{doneCount}/{holdings.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("profit-booking")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "profit-booking"
                ? "border-orange-400 text-orange-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookIcon className="h-3.5 w-3.5" />
            Profit Booking
            {pbDoneCount > 0 && <span className="text-[10px] opacity-60">{pbDoneCount}/{holdings.length}</span>}
          </button>
        </div>
      </div>

      {/* Phase 1 tab */}
      {activeTab === "phase1" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <p className="text-xs text-muted-foreground">{doneCount}/{holdings.length} holdings analysed · click any stock to expand</p>
          {holdings.map(holding => {
            const state = analysis[holding.symbol] ?? { status: "loading" };
            return <AccordionRow key={holding.symbol} holding={holding} state={state} />;
          })}
        </div>
      )}

      {/* Profit Booking tab */}
      {activeTab === "profit-booking" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <p className="text-xs text-muted-foreground">
            Sorted by urgency 🔴→🟠→🟡→🟢 · Loss positions excluded · click any stock to expand
          </p>
          {sortedForPB.map(holding => {
            const state = pbAnalysis[holding.symbol] ?? { status: "loading" };
            return <PBAccordionRow key={holding.symbol} holding={holding} state={state} />;
          })}
        </div>
      )}
    </div>
  );
}
