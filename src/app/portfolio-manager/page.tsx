"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";
import type { DecisionData } from "@/app/api/ai/decision/route";
import {
  Brain, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, BarChart2,
} from "lucide-react";

const ACTION_META: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
  BUY:                  { bg: "bg-green-500/10",   border: "border-green-500/30",   text: "text-green-400",   label: "BUY",           icon: "↑" },
  ACCUMULATE:           { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", label: "ACCUMULATE",    icon: "↗" },
  HOLD:                 { bg: "bg-blue-500/10",    border: "border-blue-500/30",    text: "text-blue-400",    label: "HOLD",          icon: "→" },
  BOOK_PARTIAL_PROFITS: { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400",   label: "BOOK PROFITS",  icon: "↓₊" },
  REDUCE_POSITION:      { bg: "bg-orange-500/10",  border: "border-orange-500/30",  text: "text-orange-400",  label: "REDUCE",        icon: "↓" },
  SELL:                 { bg: "bg-red-500/10",      border: "border-red-500/30",      text: "text-red-400",     label: "SELL",          icon: "✕" },
  AVOID:                { bg: "bg-red-500/10",      border: "border-red-500/30",      text: "text-red-400",     label: "AVOID",         icon: "✕" },
  WAIT_AND_WATCH:       { bg: "bg-sky-500/10",      border: "border-sky-500/30",      text: "text-sky-400",     label: "WATCH",         icon: "◎" },
};

const URGENCY_BADGE: Record<string, string> = {
  URGENT: "bg-red-500/20 text-red-400 border-red-500/40",
  HIGH:   "bg-orange-500/20 text-orange-400 border-orange-500/40",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  LOW:    "bg-muted/30 text-muted-foreground border-border",
};

const TREND_ICON = { Bullish: <TrendingUp className="h-3 w-3 text-green-400" />, Bearish: <TrendingDown className="h-3 w-3 text-red-400" />, Neutral: <Minus className="h-3 w-3 text-muted-foreground" /> };
const TREND_TEXT = { Bullish: "text-green-400", Bearish: "text-red-400", Neutral: "text-muted-foreground" };

function TechBadge({ label, value, positive }: { label: string; value: string | boolean; positive?: boolean }) {
  const isGood = typeof value === "boolean" ? value : positive;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-xs font-semibold ${isGood === undefined ? "text-foreground" : isGood ? "text-green-400" : "text-red-400"}`}>
        {typeof value === "boolean" ? (value ? "Above" : "Below") : value}
      </span>
    </div>
  );
}

function DecisionCard({ d }: { d: DecisionData["todayDecisions"][0] }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[d.action] ?? ACTION_META["HOLD"];
  const t = d.technical;

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden transition-all`}>
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${meta.bg} ${meta.border} ${meta.text} flex items-center gap-1.5`}>
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </div>
            <div>
              <p className="font-bold text-sm">{d.symbol}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${URGENCY_BADGE[d.urgency]}`}>
              {d.urgency}
            </span>
            <div className="text-right">
              <p className={`text-sm font-bold ${meta.text}`}>{d.confidence}%</p>
              <p className="text-[10px] text-muted-foreground">confidence</p>
            </div>
          </div>
        </div>

        {/* Reasons */}
        <ul className="space-y-1.5">
          {d.reasons.map((r, i) => (
            <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 font-bold ${meta.text}`}>›</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        {/* Final verdict */}
        <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed border-t border-white/5 pt-3">
          {d.finalVerdict}
        </p>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 border-t border-white/5 hover:bg-white/5 transition-colors text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <BarChart2 className="h-3 w-3" />
          Technical Details
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* Expanded technical section */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-white/5 space-y-4">
          {/* Multi-timeframe trend */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Trend Direction</p>
            <div className="grid grid-cols-3 gap-2">
              {(["Daily", "Weekly", "Monthly"] as const).map(tf => {
                const key = `${tf.toLowerCase()}Trend` as keyof typeof t;
                const val = t[key] as "Bullish" | "Bearish" | "Neutral";
                return (
                  <div key={tf} className="rounded-lg bg-background/50 border border-white/5 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">{tf}</p>
                    <div className="flex items-center justify-center gap-1">
                      {TREND_ICON[val]}
                      <span className={`text-xs font-bold ${TREND_TEXT[val]}`}>{val}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technical indicators */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Indicators</p>
            <div className="flex flex-wrap gap-2">
              <TechBadge label="RSI" value={t.rsi.toString()} positive={t.rsi > 50 && t.rsi < 70} />
              <TechBadge label="MACD" value={t.macd} positive={t.macd === "Positive"} />
              <TechBadge label="Stoch" value={t.stochastic} positive={t.stochastic === "Strong"} />
              <TechBadge label="Volume" value={t.volume} positive={t.volume === "Strong"} />
              <TechBadge label="Momentum" value={t.momentum} positive={t.momentum === "Strong"} />
              <TechBadge label="SMA 50" value={t.aboveSma50} />
              <TechBadge label="SMA 200" value={t.aboveSma200} />
            </div>
          </div>

          {/* Risks */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Risk Factors</p>
            <ul className="space-y-1">
              {d.risks.map((r, i) => (
                <li key={i} className="text-xs text-red-300/70 flex items-start gap-2">
                  <span className="shrink-0 text-red-400 mt-0.5">⚠</span>{r}
                </li>
              ))}
            </ul>
          </div>

          {/* Watch for */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Watch For</p>
            <ul className="space-y-1">
              {d.watchFor.map((w, i) => (
                <li key={i} className="text-xs text-sky-300/70 flex items-start gap-2">
                  <span className="shrink-0 text-sky-400 mt-0.5">◎</span>{w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioManagerPage() {
  const { activePortfolioId, activePortfolioLabel, loading: portfolioLoading } = usePortfolio();
  const [decision, setDecision]     = useState<DecisionData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [aiError, setAiError]       = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>("—");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"actions" | "attention" | "all">("actions");

  const refresh = useCallback(async (useCache = true) => {
    if (!activePortfolioId || activePortfolioId === ALL_PORTFOLIOS_ID) return;
    setLoading(true); setError(null);
    try {
      const url = `/api/ai/decision?portfolioId=${activePortfolioId}${useCache ? "&quick=0" : "&force=1"}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setDecision(d);
      setDataSource(d.source ?? "ai");
      setAiError(d.aiError ?? null);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI analysis.");
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId]);

  useEffect(() => { refresh(true); }, [refresh]);

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (activePortfolioId === ALL_PORTFOLIOS_ID) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <Brain className="h-10 w-10 text-primary mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-semibold mb-2">Select a Portfolio</h2>
          <p className="text-sm text-muted-foreground">AI Portfolio Manager analyses one portfolio at a time. Switch to a specific portfolio from the sidebar.</p>
        </div>
      </div>
    );
  }

  const urgencyOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = decision
    ? [...decision.todayDecisions].sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
    : [];

  const attentionList  = sorted.filter(d => d.urgency === "URGENT" || d.urgency === "HIGH");
  const actionList     = sorted.filter(d => ["BUY", "ACCUMULATE", "BOOK_PARTIAL_PROFITS", "REDUCE_POSITION", "SELL"].includes(d.action));
  const displayList    = activeTab === "attention" ? attentionList : activeTab === "actions" ? actionList : sorted;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">AI Portfolio Manager</h1>
            {decision && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                decision.portfolioHealthScore >= 70 ? "text-green-400 bg-green-500/10 border-green-500/30"
                : decision.portfolioHealthScore >= 45 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
                : "text-red-400 bg-red-500/10 border-red-500/30"
              }`}>
                Health {decision.portfolioHealthScore}/100
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{activePortfolioLabel} · {today}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
            dataSource === "ai" ? "text-green-400 border-green-400/30 bg-green-400/10"
            : dataSource === "ai-cached" ? "text-blue-400 border-blue-400/30 bg-blue-400/10"
            : "text-muted-foreground border-border bg-muted/30"
          }`}>
            {dataSource === "ai" ? "⚡ Gemini AI" : dataSource === "ai-cached" ? "⚡ AI (cached)" : "≈ Technical rules"}
          </span>
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={() => refresh(false)} disabled={loading}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors hover:bg-accent">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analysing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Market closed warning */}
      {(() => {
        const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
        const isOpen = day >= 1 && day <= 5 && (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
        return !isOpen ? (
          <div className="px-6 py-2 bg-orange-500/10 border-b border-orange-500/20 flex items-center gap-2 text-xs text-orange-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Market closed — technical signals based on last session. Updates at 9:15 AM IST.
          </div>
        ) : null;
      })()}

      {aiError && (
        <div className="px-6 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{aiError}
        </div>
      )}

      {/* Market outlook strip */}
      {decision && (
        <div className={`px-6 py-3 border-b border-border text-xs flex items-center gap-3 ${
          decision.marketSentiment === "BULLISH" ? "bg-green-500/5" :
          decision.marketSentiment === "BEARISH" ? "bg-red-500/5" : "bg-muted/20"
        }`}>
          <span className={`font-bold px-2 py-0.5 rounded border text-xs ${
            decision.marketSentiment === "BULLISH" ? "text-green-400 bg-green-500/10 border-green-500/30" :
            decision.marketSentiment === "BEARISH" ? "text-red-400 bg-red-500/10 border-red-500/30" :
            "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
          }`}>
            {decision.marketSentiment}
          </span>
          <span className="text-muted-foreground">{decision.marketContext}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="px-6 pt-3 border-b border-border flex gap-0">
        {([
          { id: "actions",   label: "Today's Actions", count: actionList.length },
          { id: "attention", label: "Attention",        count: attentionList.length },
          { id: "all",       label: "All Holdings",     count: sorted.length },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {(portfolioLoading || loading) && !decision ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Brain className="h-10 w-10 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">AI is analysing your portfolio…</p>
            <p className="text-xs text-muted-foreground">Fetching live prices and technical indicators</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-foreground">{error}</p>
            <button onClick={() => refresh(false)} className="text-xs text-primary hover:underline">Try again</button>
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground">
              {activeTab === "attention" ? "No urgent items — portfolio looks stable." : "No decisions to display."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
            {displayList.map(d => <DecisionCard key={d.symbol} d={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}
