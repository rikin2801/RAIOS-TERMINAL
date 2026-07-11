"use client";

import { useState, useCallback, useEffect } from "react";
import { usePortfolio } from "@/contexts/portfolio-context";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  Target, RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Shield, Zap, BarChart2, ArrowUpRight, ArrowDownRight,
  Minus, Brain, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import type { PortfolioManagerData } from "@/app/api/ai/portfolio-manager/route";
import type { DecisionData } from "@/app/api/ai/decision/route";

const ACTION_STYLES: Record<string, string> = {
  BUY_MORE:   "text-green-400 bg-green-400/10 border border-green-400/20",
  ACCUMULATE: "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20",
  HOLD:       "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20",
  REDUCE:     "text-orange-400 bg-orange-400/10 border border-orange-400/20",
  EXIT:       "text-red-400 bg-red-400/10 border border-red-400/20",
};

const ACTION_ICONS: Record<string, typeof ArrowUpRight> = {
  BUY_MORE:   ArrowUpRight,
  ACCUMULATE: ArrowUpRight,
  HOLD:       Minus,
  REDUCE:     ArrowDownRight,
  EXIT:       ArrowDownRight,
};


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

const URGENCY_BADGES: Record<string, string> = {
  HIGH:   "bg-red-400/15 text-red-400 border-red-400/30",
  MEDIUM: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30",
  LOW:    "bg-muted/40 text-muted-foreground border-border",
  URGENT: "bg-red-500/20 text-red-300 border-red-500/40",
};

const HEALTH_COLOR = (score: number) =>
  score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-red-400";

export default function PortfolioManagerPage() {
  const { activePortfolioId, activePortfolio, loading: portfolioLoading } = usePortfolio();
  const [pmData, setPmData] = useState<PortfolioManagerData | null>(null);
  const [decisionData, setDecisionData] = useState<DecisionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [expandedRecs, setExpandedRecs] = useState<Record<string, boolean>>({});
  const [expandedDecisions, setExpandedDecisions] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"portfolio" | "actions" | "risk" | "rebalance">("actions");
  const [timeframeFilter, setTimeframeFilter] = useState<"ALL" | "DAILY" | "WEEKLY" | "MONTHLY">("ALL");

  const refresh = useCallback(async (quick = true) => {
    if (!activePortfolioId) return;
    setLoading(true);
    setError(null);
    setAiError(null);
    try {
      const pmUrl = quick
        ? `/api/ai/portfolio-manager?portfolioId=${activePortfolioId}&quick=1`
        : `/api/ai/portfolio-manager?portfolioId=${activePortfolioId}`;
      const [pmRes, decisionRes] = await Promise.all([
        fetch(pmUrl),
        fetch(`/api/ai/decision?portfolioId=${activePortfolioId}&quick=1`),
      ]);
      if (pmRes.ok) {
        const pmJson = await pmRes.json();
        setPmData(pmJson);
        if (pmJson.aiError) setAiError(pmJson.aiError);
      } else { const e = await pmRes.json(); setError(e.error ?? "Failed to load portfolio analysis"); }
      if (decisionRes.ok) {
        const decisionJson = await decisionRes.json();
        setDecisionData(decisionJson);
      }
    } catch (e) {
      setError("Connection error. Make sure the dev server is running.");
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId]);

  useEffect(() => { refresh(); }, [refresh]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  if (error && !pmData) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Portfolio Analysis Unavailable</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={() => refresh()} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card/50 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">AI Portfolio Manager</h1>
            {pmData && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${HEALTH_COLOR(pmData.overallHealth.score)} bg-current/10`}>
                {pmData.overallHealth.status}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{activePortfolio?.name} · {today}</p>
        </div>
        <button
          onClick={() => refresh(false)}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors hover:bg-accent"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing…" : "Refresh All"}
        </button>
      </div>

      {/* AI Error Banner */}
      {aiError && (
        <div className="px-6 py-2.5 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* Portfolio Health Score Bar */}
      {pmData && (
        <div className="px-6 py-3 border-b border-border bg-card/30 flex items-center gap-6 overflow-x-auto">
          <div className="flex items-center gap-3 shrink-0">
            <div className={`text-3xl font-bold ${HEALTH_COLOR(pmData.overallHealth.score)}`}>
              {pmData.overallHealth.score}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Portfolio Health</p>
              <p className="text-xs text-muted-foreground">out of 100</p>
            </div>
          </div>
          <div className="h-2 flex-1 min-w-[120px] bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pmData.overallHealth.score >= 80 ? "bg-green-400" : pmData.overallHealth.score >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${pmData.overallHealth.score}%` }}
            />
          </div>
          <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground divide-x divide-border">
            <div className="text-center pr-4">
              <p className="font-semibold text-foreground">{pmData.riskAnalysis.diversificationScore.toFixed(1)}/10</p>
              <p>Diversity</p>
            </div>
            <div className="text-center px-4">
              <p className={`font-semibold ${pmData.riskAnalysis.overallRisk === "HIGH" ? "text-red-400" : pmData.riskAnalysis.overallRisk === "MEDIUM" ? "text-yellow-400" : "text-green-400"}`}>
                {pmData.riskAnalysis.overallRisk}
              </p>
              <p>Risk</p>
            </div>
            <div className="text-center px-4">
              <p className={`font-semibold ${pmData.riskAnalysis.volatilityProfile === "CONSERVATIVE" ? "text-green-400" : pmData.riskAnalysis.volatilityProfile === "AGGRESSIVE" ? "text-red-400" : "text-yellow-400"}`}>
                {pmData.riskAnalysis.volatilityProfile}
              </p>
              <p>Profile</p>
            </div>
            {decisionData && (
              <>
                <div className="text-center px-4">
                  <p className="font-semibold text-green-400">{decisionData.topOpportunity.symbol}</p>
                  <p>Top Opportunity</p>
                </div>
                <div className="text-center px-4">
                  <p className="font-semibold text-red-400">{decisionData.highestRisk.symbol}</p>
                  <p>Highest Risk</p>
                </div>
                <div className="text-center pl-4">
                  <p className="font-semibold text-yellow-400">{decisionData.highestConviction.symbol}</p>
                  <p>High Conviction</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="px-6 pt-3 border-b border-border flex gap-0">
        {(["portfolio", "actions", "risk", "rebalance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-xs font-semibold capitalize border-b-2 transition-colors ${
              activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "portfolio" ? "Holdings" : t === "actions" ? "Today's Actions" : t === "risk" ? "Risk" : "Rebalance"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {(portfolioLoading || loading || (!pmData && !error)) && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Brain className="h-10 w-10 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">AI is analyzing your portfolio…</p>
            <p className="text-xs text-muted-foreground">Fetching live prices and generating recommendations</p>
          </div>
        )}

        {/* HOLDINGS TAB */}
        {activeTab === "portfolio" && pmData && (
          <div className="space-y-3 max-w-4xl">
            <p className="text-xs text-muted-foreground">{pmData.overallHealth.summary}</p>
            {pmData.holdingRecommendations.map((rec) => {
              const Icon = ACTION_ICONS[rec.action] ?? Minus;
              const expanded = expandedRecs[rec.symbol];
              return (
                <div key={rec.symbol} className="bg-card border border-border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                    onClick={() => setExpandedRecs((p) => ({ ...p, [rec.symbol]: !p[rec.symbol] }))}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${ACTION_STYLES[rec.action].split(" ")[0]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{rec.symbol}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ACTION_STYLES[rec.action]}`}>{rec.action.replace("_", " ")}</span>
                        {rec.priority !== "LOW" && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${URGENCY_BADGES[rec.priority]}`}>{rec.priority}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                      <span>{rec.currentWeight.toFixed(1)}% → <span className="text-foreground font-medium">{rec.targetWeight.toFixed(1)}%</span></span>
                      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border">
                      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{rec.reason}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ACTIONS TAB */}
        {activeTab === "actions" && (
          <div className="space-y-4 max-w-4xl">
            {/* TODAY'S ACTION PLAN — from Decision Engine */}
            {decisionData ? (
              <>
                {/* 3-column highlight row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-card border border-green-400/20 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-green-400 mb-1">TOP OPPORTUNITY</p>
                    <p className="font-mono font-bold text-sm">{decisionData.topOpportunity.symbol}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{decisionData.topOpportunity.why}</p>
                    <p className="text-xs text-green-400 font-mono mt-1">{decisionData.topOpportunity.confidence}% confidence</p>
                  </div>
                  <div className="bg-card border border-red-400/20 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-red-400 mb-1">HIGHEST RISK</p>
                    <p className="font-mono font-bold text-sm">{decisionData.highestRisk.symbol}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{decisionData.highestRisk.why}</p>
                  </div>
                  <div className="bg-card border border-yellow-400/20 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-yellow-400 mb-1">HIGHEST CONVICTION</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-sm">{decisionData.highestConviction.symbol}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DECISION_ACTION_STYLES[decisionData.highestConviction.action] ?? "text-muted-foreground border-border"}`}>
                        {decisionData.highestConviction.action.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{decisionData.highestConviction.why}</p>
                  </div>
                </div>

                {/* Per-stock decisions */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Today&apos;s Action Plan
                      </h3>
                      <div className="flex gap-1">
                        {(["ALL", "DAILY", "WEEKLY", "MONTHLY"] as const).map(tf => (
                          <button
                            key={tf}
                            onClick={() => setTimeframeFilter(tf)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                              timeframeFilter === tf
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-foreground/40"
                            }`}
                          >
                            {tf}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{decisionData.date} · Click any stock for full reasoning</p>
                  </div>
                  <div className="divide-y divide-border">
                    {(timeframeFilter === "ALL"
                      ? decisionData.todayDecisions
                      : decisionData.todayDecisions.filter(d => d.analysisTimeframe === timeframeFilter)
                    ).map((d) => {
                      const isOpen = expandedDecisions[d.symbol];
                      return (
                        <div key={d.symbol}>
                          <button
                            className="w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors"
                            onClick={() => setExpandedDecisions(p => ({ ...p, [d.symbol]: !p[d.symbol] }))}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border font-mono whitespace-nowrap ${DECISION_ACTION_STYLES[d.action] ?? "text-muted-foreground border-border"}`}>
                                {d.action.replace(/_/g, " ")}
                              </span>
                              <span className="font-mono font-bold text-sm">{d.symbol}</span>
                              <span className="text-xs text-muted-foreground">{d.priceLevel}</span>
                              <div className="flex-1 mx-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 max-w-[60px] h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${(d.confidence ?? 60) >= 75 ? "bg-green-400" : (d.confidence ?? 60) >= 55 ? "bg-yellow-400" : "bg-red-400"}`}
                                      style={{ width: `${d.confidence ?? 60}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground font-mono">{d.confidence ?? 60}%</span>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${URGENCY_BADGES[d.urgency] ?? "border-border"}`}>{d.urgency}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
                                <Clock className="h-2.5 w-2.5" />{d.analysisTimeframe}
                              </span>
                              <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{d.reason}</p>
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4 bg-accent/10 border-t border-border/50 space-y-3">
                              <div className="pt-3">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Technical Signals</p>
                                <p className="text-xs font-mono leading-relaxed text-foreground/80">{d.technicalSignal}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-card border border-border rounded-lg p-3">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Your Position</p>
                                  <p className="text-xs">{d.portfolioContext}</p>
                                  {d.expectedReward && <p className="text-xs text-green-400 mt-1">{d.expectedReward}</p>}
                                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                                    <span>Risk: <span className={d.riskLevel === "HIGH" ? "text-red-400" : d.riskLevel === "MEDIUM" ? "text-yellow-400" : "text-green-400"}>{d.riskLevel}</span></span>
                                    <span>Hold: {d.holdingPeriod}</span>
                                  </div>
                                </div>
                                <div className="bg-card border border-border rounded-lg p-3">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Why Now?</p>
                                  <p className="text-xs leading-relaxed">{d.whyNow}</p>
                                </div>
                              </div>
                              <div className="bg-yellow-900/10 border border-yellow-900/30 rounded-lg p-3">
                                <p className="text-[10px] font-bold text-yellow-400 mb-1">What would change this?</p>
                                <p className="text-xs leading-relaxed">{d.whatCouldInvalidate}</p>
                              </div>
                              <div className="bg-primary/5 border border-primary/30 rounded-lg p-3">
                                <p className="text-[10px] font-bold text-primary mb-1">AI VERDICT</p>
                                <p className="text-sm font-medium">{d.finalVerdict}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Alerts */}
                {(decisionData.alerts.nearStopLoss.length > 0 || decisionData.alerts.nearTarget.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {decisionData.alerts.nearStopLoss.length > 0 && (
                      <div className="bg-card border border-red-400/20 rounded-lg p-4">
                        <p className="text-xs font-bold text-red-400 mb-3">⚠ NEAR STOP LOSS</p>
                        {decisionData.alerts.nearStopLoss.map(a => (
                          <div key={a.symbol} className="mb-2 last:mb-0">
                            <div className="flex justify-between text-sm">
                              <span className="font-mono font-bold text-red-400">{a.symbol}</span>
                              <span className="text-xs text-red-400">{a.distancePct.toFixed(1)}% above SL</span>
                            </div>
                            <p className="text-xs text-muted-foreground">₹{a.currentPrice.toFixed(0)} | SL ₹{a.stopLoss.toFixed(0)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {decisionData.alerts.nearTarget.length > 0 && (
                      <div className="bg-card border border-green-400/20 rounded-lg p-4">
                        <p className="text-xs font-bold text-green-400 mb-3">🎯 NEAR TARGET</p>
                        {decisionData.alerts.nearTarget.map(a => (
                          <div key={a.symbol} className="mb-2 last:mb-0">
                            <div className="flex justify-between text-sm">
                              <span className="font-mono font-bold text-green-400">{a.symbol}</span>
                              <span className="text-xs text-green-400">{a.distancePct.toFixed(1)}% to target</span>
                            </div>
                            <p className="text-xs text-muted-foreground">₹{a.currentPrice.toFixed(0)} → ₹{a.target.toFixed(0)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Weekly Plan */}
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">WEEKLY PLAN</p>
                  <p className="text-xs leading-relaxed">{decisionData.weeklyPlan}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-20">
                <p className="text-muted-foreground text-sm">Loading action plan…</p>
              </div>
            )}

            {pmData && (
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">REBALANCING NOTE</p>
                <p className="text-xs leading-relaxed">{pmData.cashDeployment.recommendation}</p>
                <p className="text-xs text-muted-foreground mt-2">{pmData.cashDeployment.timing}</p>
              </div>
            )}
          </div>
        )}

        {/* RISK TAB */}
        {activeTab === "risk" && pmData && (
          <div className="space-y-4 max-w-4xl">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">CONCENTRATION RISK</p>
                <p className="text-xs leading-relaxed mt-2">{pmData.riskAnalysis.concentrationRisk}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">SECTOR RISK</p>
                <p className="text-xs leading-relaxed mt-2">{pmData.riskAnalysis.sectorRisk}</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Sector Exposure</h3>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sector</th>
                    <th>Current</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {pmData.sectorExposure.map((s) => (
                    <tr key={s.sector}>
                      <td className="font-medium">{s.sector}</td>
                      <td className="font-mono">{s.currentPct.toFixed(1)}%</td>
                      <td className="font-mono text-muted-foreground">{s.targetPct.toFixed(1)}%</td>
                      <td>
                        <span className={`text-xs font-semibold ${s.action === "OVERWEIGHT" ? "text-red-400" : s.action === "UNDERWEIGHT" ? "text-yellow-400" : "text-green-400"}`}>
                          {s.action}
                        </span>
                      </td>
                      <td className="text-xs text-muted-foreground">{s.suggestion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REBALANCE TAB */}
        {activeTab === "rebalance" && pmData && (
          <div className="space-y-4 max-w-4xl">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">6-MONTH OUTLOOK</p>
              <p className="text-sm leading-relaxed">{pmData.sixMonthOutlook}</p>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Step-by-Step Rebalancing Plan</h3>
              </div>
              <div className="divide-y divide-border">
                {pmData.rebalancingPlan.map((step) => (
                  <div key={step.step} className="flex gap-4 px-4 py-4">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {step.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{step.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">CASH DEPLOYMENT</p>
              <p className="text-sm">{pmData.cashDeployment.recommendation}</p>
              <p className="text-xs text-muted-foreground mt-2">{pmData.cashDeployment.suggestedAllocation}</p>
              <p className="text-xs text-muted-foreground mt-1">{pmData.cashDeployment.timing}</p>
            </div>

            <p className="text-[10px] text-muted-foreground">{pmData.disclaimer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
