"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import {
  Brain, Search, RefreshCw, TrendingUp, TrendingDown,
  Shield, Target, AlertTriangle, CheckCircle, XCircle,
  MessageSquare, Send, Loader2, Zap, Star, BarChart2,
  Calendar, Sparkles, TrendingDown as ThumbDown, ArrowRight,
  Crosshair,
} from "lucide-react";
import type { DailyBrief } from "@/app/api/ai/brief/route";
import type { OpportunitiesData } from "@/app/api/ai/opportunities/route";
import type { DecisionData } from "@/app/api/ai/decision/route";
import type { ForecastData } from "@/app/api/ai/forecast/route";
import { resolveSearchSymbol } from "@/lib/india";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";


// ──────────────────────────── DAILY BRIEF ────────────────────────────
function BriefTab({ portfolioId }: { portfolioId: string }) {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchBrief = async () => {
    setLoading(true);
    setError("");
    try {
      const url = portfolioId ? `/api/ai/brief?portfolioId=${portfolioId}` : "/api/ai/brief";
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to generate brief");
      }
      setBrief(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
    setLoading(false);
  };

  useEffect(() => { fetchBrief(); }, [portfolioId]);

  const actionColor = (action: string) => {
    if (["BUY", "ACCUMULATE"].includes(action)) return "text-green-400 bg-green-400/10 border-green-400/30";
    if (["SELL", "REDUCE"].includes(action)) return "text-red-400 bg-red-400/10 border-red-400/30";
    if (action === "WATCH") return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  };

  const sentimentColor = brief?.marketSentiment.overall === "BULLISH" ? "text-green-400" : brief?.marketSentiment.overall === "BEARISH" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Daily AI Investment Brief</h2>
          {brief?.date && <p className="text-xs text-muted-foreground">{brief.date}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={fetchBrief} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Brain className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">AI is analyzing your portfolio…</p>
        </div>
      )}

      {brief && !loading && (
        <>
          {/* Health + Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Portfolio Health</p>
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16">
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                    <circle cx="32" cy="32" r="26" fill="none"
                      stroke={brief.portfolioHealth.score >= 70 ? "#22c55e" : brief.portfolioHealth.score >= 40 ? "#eab308" : "#ef4444"}
                      strokeWidth="6"
                      strokeDasharray={`${(brief.portfolioHealth.score / 100) * 163.4} 163.4`}
                      strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{brief.portfolioHealth.score}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{brief.portfolioHealth.grade}</p>
                  <p className="text-xs text-muted-foreground">Portfolio Grade</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{brief.portfolioHealth.summary}</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Market Sentiment</p>
              <p className={`text-2xl font-bold ${sentimentColor}`}>{brief.marketSentiment.overall}</p>
              <p className="text-xs mt-2 leading-relaxed">{brief.marketSentiment.india}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{brief.marketSentiment.global}</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-2">Key Theme This Week</p>
              <p className="text-sm leading-relaxed">{brief.keyTheme}</p>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Sector Rotation</p>
                <p className="text-xs mt-1 leading-relaxed">{brief.sectorRotation}</p>
              </div>
            </div>
          </div>

          {/* Today's Actions */}
          {brief.todayActions.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Today&apos;s Actions</h3>
              <div className="grid gap-2">
                {brief.todayActions.map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${actionColor(a.action)}`}>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono border ${actionColor(a.action)}`}>{a.action}</span>
                    <div className="flex-1">
                      <span className="font-mono font-bold">{a.symbol}</span>
                      <p className="text-xs mt-0.5 opacity-80">{a.reason}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${a.urgency === "HIGH" ? "border-red-500 text-red-400" : a.urgency === "MEDIUM" ? "border-yellow-500 text-yellow-400" : "border-border"}`}>
                      {a.urgency}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Opportunity + Highest Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-green-900/40 bg-green-900/10 p-4">
              <h3 className="font-semibold text-green-400 flex items-center gap-2 mb-3"><Star className="h-4 w-4" /> Top Opportunity</h3>
              <p className="font-mono font-bold text-lg">{brief.topOpportunity.symbol}</p>
              <p className="text-sm mt-1 leading-relaxed">{brief.topOpportunity.why}</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div><p className="text-muted-foreground">Entry</p><p className="font-mono">{brief.topOpportunity.entryRange}</p></div>
                <div><p className="text-muted-foreground">Target</p><p className="font-mono text-green-400">{brief.topOpportunity.target}</p></div>
                <div><p className="text-muted-foreground">Risk</p><p className="font-mono text-xs opacity-70">{brief.topOpportunity.risk.slice(0, 20)}…</p></div>
              </div>
            </div>

            <div className="rounded-lg border border-red-900/40 bg-red-900/10 p-4">
              <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4" /> Highest Risk Holding</h3>
              <p className="font-mono font-bold text-lg">{brief.highestRisk.symbol}</p>
              <p className="text-sm mt-1 leading-relaxed">{brief.highestRisk.risk}</p>
              <div className="mt-3 pt-3 border-t border-red-900/30">
                <p className="text-xs text-muted-foreground">Recommended Action</p>
                <p className="text-xs mt-1">{brief.highestRisk.action}</p>
              </div>
            </div>
          </div>

          {/* Other insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-2 text-sm">Cash Deployment</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{brief.cashDeployment}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-2 text-sm">Rebalancing Insight</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{brief.rebalancingSuggestion}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">{brief.disclaimer}</p>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── OPPORTUNITIES ────────────────────────────
function OpportunitiesTab({ portfolioId }: { portfolioId: string }) {
  const [data, setData] = useState<OpportunitiesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetch_ = async () => {
    setLoading(true);
    setError("");
    try {
      const url = portfolioId ? `/api/ai/opportunities?portfolioId=${portfolioId}` : "/api/ai/opportunities";
      const res = await fetch(url);
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? "Gemini API rate limit reached. Please wait a few minutes and try again.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      setError("Failed to load opportunities. Check your connection.");
    }
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, [portfolioId]);

  const convictionColor = (c: string) => c === "HIGH" ? "text-green-400 border-green-500/40 bg-green-500/10" : c === "MEDIUM" ? "text-yellow-400 border-yellow-500/40 bg-yellow-500/10" : "text-muted-foreground border-border bg-secondary/50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Opportunity Engine</h2>
          {data?.generatedAt && <p className="text-xs text-muted-foreground">{data.generatedAt}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={fetch_} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Sparkles className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">Scanning market for opportunities…</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Top Buys */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-400"><TrendingUp className="h-4 w-4" /> Top Buy Opportunities</h3>
            <div className="grid gap-3">
              {data.topBuys.map((s) => (
                <div key={s.symbol} className="rounded-lg border border-border bg-card p-4 flex gap-4">
                  <div className="flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-lg">
                    {s.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-primary text-lg">{s.symbol}</span>
                      <span className="text-sm text-muted-foreground">{s.name}</span>
                      <Badge variant="outline" className={`ml-auto text-xs ${convictionColor(s.conviction)}`}>{s.conviction} CONVICTION</Badge>
                    </div>
                    <p className="text-sm mt-1 leading-relaxed">{s.why}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs">
                      <span><span className="text-muted-foreground">Price:</span> <span className="font-mono">{s.price}</span></span>
                      <span><span className="text-muted-foreground">Target:</span> <span className="font-mono text-green-400">{s.target}</span></span>
                      <span><span className="text-muted-foreground">Upside:</span> <span className="font-mono text-green-400">{s.upside}</span></span>
                      <span><span className="text-muted-foreground">Timeframe:</span> <span className="font-mono">{s.timeframe}</span></span>
                    </div>
                    <p className="text-xs text-red-400/80 mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Risk: {s.risk}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Swing Trades + Momentum + Gems in 3 cols */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Swing Trades */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-400 text-sm"><BarChart2 className="h-4 w-4" /> Swing Trades</h3>
              <div className="space-y-3">
                {data.swingTrades.map((s) => (
                  <div key={s.symbol} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">{s.symbol}</span>
                      <span className="text-xs text-muted-foreground">{s.duration}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.name}</p>
                    <p className="text-xs mt-1 leading-relaxed">{s.why}</p>
                    <div className="text-xs mt-1.5 flex gap-3">
                      <span><span className="text-muted-foreground">Entry:</span> <span className="font-mono">{s.entry}</span></span>
                    </div>
                    <div className="text-xs flex gap-3">
                      <span className="text-green-400">Target: {s.target}</span>
                      <span className="text-red-400">SL: {s.stopLoss}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Momentum Leaders */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-yellow-400 text-sm"><Zap className="h-4 w-4" /> Momentum Leaders</h3>
              <div className="space-y-3">
                {data.momentumLeaders.map((s) => (
                  <div key={s.symbol} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-primary">{s.symbol}</span>
                      <span className="text-xs text-yellow-400 font-mono">{s.momentum}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.name}</p>
                    <p className="text-xs mt-1 leading-relaxed">{s.why}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden Gems + Avoid */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-400 text-sm"><Star className="h-4 w-4" /> Hidden Gems</h3>
                <div className="space-y-3">
                  {data.hiddenGems.map((s) => (
                    <div key={s.symbol} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <span className="font-mono font-bold text-primary">{s.symbol}</span>
                      <p className="text-xs text-muted-foreground">{s.name}</p>
                      <p className="text-xs mt-1 leading-relaxed">{s.why}</p>
                      <p className="text-xs text-purple-400 mt-0.5">Catalyst: {s.catalyst}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-red-900/40 bg-red-900/5 p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-400 text-sm"><ThumbDown className="h-4 w-4" /> Avoid Now</h3>
                <div className="space-y-2">
                  {data.avoidList.map((s) => (
                    <div key={s.symbol}>
                      <span className="font-mono font-bold text-red-400">{s.symbol}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Market Outlook */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold mb-2 text-sm flex items-center gap-2"><ArrowRight className="h-4 w-4 text-primary" /> Market Outlook</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{data.marketOutlook}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── CHAT ────────────────────────────
function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Namaste! I'm your AI Investment Advisor for the Indian market. Ask me anything:\n\n• \"Should I buy Reliance?\"\n• \"Where should I invest ₹5,00,000?\"\n• \"Review my portfolio\"\n• \"What are the top IT stocks on NSE?\"\n• \"How is RBI policy affecting banks?\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const QUICK_PROMPTS = [
    "Review my portfolio",
    "Best Nifty 50 stocks to buy now",
    "Where to invest ₹1,00,000?",
    "Top IT stocks on NSE",
    "How is inflation affecting markets?",
    "Explain SEBI regulations for retail investors",
  ];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? data.error ?? "Sorry, I could not process that.", timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error. Please try again.", timestamp: new Date() }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-lg border border-border bg-card">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Brain className="h-3 w-3 text-primary" />
                  <span className="text-xs font-semibold text-primary">Gemini AI</span>
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 overflow-x-auto py-2">
        {QUICK_PROMPTS.map((p) => (
          <button key={p} onClick={() => sendMessage(p)} disabled={loading} className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors whitespace-nowrap disabled:opacity-50">{p}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Ask about Indian stocks, portfolio, market trends…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={loading} className="flex-1" />
        <Button onClick={() => sendMessage()} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}



// ──────────────────────────── DECISION DASHBOARD ────────────────────────────
function DecisionTab({ portfolioId }: { portfolioId: string }) {
  const [data, setData] = useState<DecisionData | null>(null);
  const [source, setSource] = useState<"rule-based" | "ai" | "ai-cached" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // NEW SCHEMA — no cost-based fields, pure technical

  const baseUrl = portfolioId ? `/api/ai/decision?portfolioId=${portfolioId}` : "/api/ai/decision";

  const fetchQuick = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${baseUrl}&quick=1`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      const json = await res.json();
      setData(json); setSource(json.source ?? "rule-based");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    setLoading(false);
  };

  const fetchAI = async () => {
    setAiLoading(true); setError("");
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      const json = await res.json();
      setData(json); setSource(json.source ?? "rule-based");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    setAiLoading(false);
  };

  useEffect(() => { fetchQuick(); }, [portfolioId]);

  const actionColor = (a: string) => {
    if (["BUY", "ACCUMULATE"].includes(a)) return "text-green-400 bg-green-400/10 border-green-400/30";
    if (["SELL", "REDUCE_POSITION"].includes(a)) return "text-red-400 bg-red-400/10 border-red-400/30";
    if (["BOOK_PARTIAL_PROFITS"].includes(a)) return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    if (["WAIT_AND_WATCH", "AVOID"].includes(a)) return "text-blue-400 bg-blue-400/10 border-blue-400/30";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
  };
  const confidenceBar = (c: number) => c >= 75 ? "bg-green-400" : c >= 55 ? "bg-yellow-400" : "bg-red-400";
  const healthColor = (s: number) => s >= 80 ? "text-green-400" : s >= 65 ? "text-yellow-400" : "text-red-400";
  const trendColor = (t: string) => t === "Bullish" ? "text-green-400" : t === "Bearish" ? "text-red-400" : "text-yellow-400";
  const trendBg = (t: string) => t === "Bullish" ? "bg-green-400/10 border-green-400/30" : t === "Bearish" ? "bg-red-400/10 border-red-400/30" : "bg-yellow-400/10 border-yellow-400/30";
  const sentimentColor = (s: string) => s === "BULLISH" ? "text-green-400" : s === "BEARISH" ? "text-red-400" : "text-yellow-400";

  const sourceLabel = source === "ai" ? "AI-Powered · Gemini 2.5 Flash"
    : source === "ai-cached" ? "AI-Powered · Cached" : "Rule-Based Analysis";
  const sourceDot = source === "ai" || source === "ai-cached" ? "bg-primary" : "bg-yellow-400";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Crosshair className="h-5 w-5 text-primary" /> AI Decision Engine</h2>
          <p className="text-xs text-muted-foreground">Technical-only decisions · No cost basis logic · Click any stock for full analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {source && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${sourceDot}`} />
              {sourceLabel}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchQuick} disabled={loading || aiLoading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="default" size="sm" onClick={fetchAI} disabled={loading || aiLoading}>
            <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${aiLoading ? "animate-spin" : ""}`} />
            {aiLoading ? "Thinking…" : "AI Analysis"}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">{error}</div>}
      {aiLoading && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          Gemini 2.5 Flash is running deep analysis across all holdings… ~30 seconds. Results will replace current view when ready.
        </div>
      )}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Crosshair className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">Fetching live prices and computing decisions…</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Market Context + Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{data.date}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                  data.marketSentiment === "BULLISH" ? "text-green-400 bg-green-400/10 border-green-400/30" :
                  data.marketSentiment === "BEARISH" ? "text-red-400 bg-red-400/10 border-red-400/30" :
                  "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                }`}>{data.marketSentiment}</span>
              </div>
              <p className="text-sm leading-relaxed mb-3">{data.marketContext}</p>
              {data.marketReasons.length > 0 && (
                <ul className="space-y-1">
                  {data.marketReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className={`shrink-0 mt-0.5 ${sentimentColor(data.marketSentiment)}`}>•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-center items-center">
              <p className="text-xs text-muted-foreground mb-2">Portfolio Health</p>
              <span className={`text-4xl font-black font-mono ${healthColor(data.portfolioHealthScore)}`}>
                {data.portfolioHealthScore}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.portfolioHealthScore >= 80 ? "bg-green-400" :
                    data.portfolioHealthScore >= 65 ? "bg-yellow-400" : "bg-red-400"
                  }`}
                  style={{ width: `${data.portfolioHealthScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top Opportunity + Biggest Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.topOpportunity && (
              <div className="rounded-lg border border-green-900/40 bg-green-900/10 p-4">
                <p className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1"><Star className="h-3 w-3" /> TOP OPPORTUNITY</p>
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-mono font-bold text-lg">{data.topOpportunity.symbol}</p>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${actionColor(data.topOpportunity.action)}`}>{data.topOpportunity.action}</span>
                  <span className="ml-auto text-xs font-mono text-green-400">{data.topOpportunity.confidence}%</span>
                </div>
                <ul className="space-y-1">
                  {data.topOpportunity.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0 text-green-400 mt-0.5">▲</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.biggestRisk && (
              <div className="rounded-lg border border-red-900/40 bg-red-900/10 p-4">
                <p className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> BIGGEST RISK</p>
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-mono font-bold text-lg">{data.biggestRisk.symbol}</p>
                  <span className="ml-auto text-xs font-mono text-red-400">{data.biggestRisk.confidence}% risk</span>
                </div>
                <ul className="space-y-1">
                  {data.biggestRisk.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0 text-red-400 mt-0.5">▼</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Attention Required */}
          {data.attentionRequired.length > 0 && (
            <div className="rounded-lg border border-orange-900/40 bg-orange-900/5 p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3 text-orange-400">
                <AlertTriangle className="h-4 w-4" /> Requires Attention ({data.attentionRequired.length})
              </h3>
              <div className="space-y-2">
                {data.attentionRequired.map((a) => (
                  <div key={a.symbol} className="rounded-lg border border-orange-900/30 bg-orange-900/10 p-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${actionColor(a.action)}`}>{a.action.replace(/_/g, " ")}</span>
                      <span className="font-mono font-bold">{a.symbol}</span>
                      <Badge variant="outline" className={`shrink-0 text-xs ml-auto ${a.urgency === "URGENT" ? "border-red-500 text-red-400" : "border-orange-500 text-orange-400"}`}>{a.urgency}</Badge>
                    </div>
                    <ul className="space-y-0.5">
                      {a.reasons.slice(0, 2).map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="shrink-0 text-orange-400 mt-0.5">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Decisions — expandable cards */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" /> Stock-by-Stock Decisions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Click any row to see full technical breakdown</p>
            </div>
            <div className="divide-y divide-border">
              {data.todayDecisions.map((d) => {
                const isOpen = expanded[d.symbol];
                const isEntry = ["BUY", "ACCUMULATE"].includes(d.action);
                const isExit = ["SELL", "REDUCE_POSITION", "BOOK_PARTIAL_PROFITS"].includes(d.action);
                return (
                  <div key={d.symbol}>
                    <button
                      className="w-full text-left px-4 py-3 hover:bg-accent/30 transition-colors"
                      onClick={() => setExpanded(p => ({ ...p, [d.symbol]: !p[d.symbol] }))}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border font-mono whitespace-nowrap ${actionColor(d.action)}`}>
                          {d.action.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono font-bold text-sm">{d.symbol}</span>
                        <span className="flex-1" />
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${confidenceBar(d.confidence)}`} style={{ width: `${d.confidence}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">{d.confidence}%</span>
                        </div>
                        <Badge variant="outline" className={`shrink-0 text-xs ${d.urgency === "URGENT" || d.urgency === "HIGH" ? "border-red-500 text-red-400" : d.urgency === "MEDIUM" ? "border-yellow-500 text-yellow-400" : "border-border"}`}>
                          {d.urgency}
                        </Badge>
                        <span className={`text-[10px] shrink-0 ${isOpen ? "rotate-180" : ""} transition-transform text-muted-foreground`}>▼</span>
                      </div>
                      <p className="text-sm font-medium text-foreground/90 mt-1.5 leading-relaxed line-clamp-2">{d.finalVerdict}</p>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-5 bg-accent/20 border-t border-border/50 space-y-4 pt-4">
                        {/* Final Verdict */}
                        <div className={`rounded-lg border-l-4 p-4 ${
                          isEntry ? "border-l-green-500 bg-green-900/10 border border-green-900/30"
                          : isExit ? "border-l-red-500 bg-red-900/10 border border-red-900/30"
                          : "border-l-primary bg-primary/5 border border-primary/20"
                        }`}>
                          <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${isEntry ? "text-green-400" : isExit ? "text-red-400" : "text-primary"}`}>
                            <Crosshair className="h-3 w-3" /> Final Decision
                          </p>
                          <p className="text-base font-semibold leading-relaxed">{d.finalVerdict}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                            <span>Confidence</span>
                            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${confidenceBar(d.confidence)}`} style={{ width: `${d.confidence}%` }} />
                            </div>
                            <span className="font-mono font-bold">{d.confidence}%</span>
                          </div>
                        </div>

                        {/* Technical Snapshot */}
                        <div className="rounded-lg border border-border bg-card/60 p-3">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Technical Signals</p>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            {[
                              { label: "Daily Trend", val: d.technical.dailyTrend },
                              { label: "Weekly Trend", val: d.technical.weeklyTrend },
                              { label: "Monthly Trend", val: d.technical.monthlyTrend },
                            ].map(({ label, val }) => (
                              <div key={label} className={`rounded p-2 border ${trendBg(val)} text-center`}>
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className={`text-xs font-bold mt-0.5 ${trendColor(val)}`}>{val}</p>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: "RSI", val: `${d.technical.rsi}` },
                              { label: "MACD", val: d.technical.macd },
                              { label: "Stochastic", val: d.technical.stochastic },
                              { label: "Volume", val: d.technical.volume },
                              { label: "Momentum", val: d.technical.momentum },
                              { label: "vs SMA50", val: d.technical.aboveSma50 ? "Above ✓" : "Below ✗" },
                              { label: "vs SMA200", val: d.technical.aboveSma200 ? "Above ✓" : "Below ✗" },
                              ...(d.technical.support ? [{ label: "Support", val: `₹${d.technical.support.toFixed(0)}` }] : []),
                            ].map(({ label, val }) => (
                              <div key={label} className="rounded p-2 bg-secondary/40">
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className={`text-xs font-bold mt-0.5 ${
                                  val.includes("✓") || val === "Bullish" || val === "Positive" || val === "Strong" ? "text-green-400" :
                                  val.includes("✗") || val === "Bearish" || val === "Negative" || val === "Weak" ? "text-red-400" :
                                  "text-foreground"
                                }`}>{val}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Reasons */}
                        <div className="rounded-lg border border-border bg-card/60 p-3">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Why This Decision</p>
                          <ul className="space-y-1.5">
                            {d.reasons.map((r, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                                <span className={`shrink-0 mt-0.5 ${isEntry ? "text-green-400" : isExit ? "text-red-400" : "text-primary"}`}>•</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Risks + Watch For */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border border-red-900/30 bg-red-900/5 p-3">
                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-2">Risks to Watch</p>
                            <ul className="space-y-1">
                              {d.risks.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="shrink-0 text-red-400 mt-0.5">!</span>{r}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-2">Watch For</p>
                            <ul className="space-y-1">
                              {d.watchFor.map((w, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="shrink-0 text-primary mt-0.5">→</span>{w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── FORECAST ────────────────────────────
function ForecastTab() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [inputVal, setInputVal] = useState("RELIANCE");
  const [exchange, setExchange] = useState("NSE");
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchForecast = async (sym: string, ex: string) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/ai/forecast?symbol=${sym}&exchange=${ex}`);
      if (!res.ok) throw new Error("Forecast failed");
      setData(await res.json());
    } catch { setError(`Could not forecast "${sym}". Check symbol and try again.`); }
    setLoading(false);
  };

  useEffect(() => { fetchForecast(symbol, exchange); }, []);

  const handleSearch = () => {
    const s = resolveSearchSymbol(inputVal.trim());
    if (s) { setSymbol(s); setInputVal(s); fetchForecast(s, exchange); }
  };

  const biasColor = (b: string) => b.includes("BULLISH") ? "text-green-400" : b.includes("BEARISH") ? "text-red-400" : "text-yellow-400";

  const TF_LABELS: Record<string, string> = { "1M": "1 Month", "3M": "3 Months", "6M": "6 Months", "1Y": "1 Year" };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Target Forecast Engine</h2>
        {data?.generatedAt && <p className="text-xs text-muted-foreground">{data.generatedAt}</p>}
      </div>

      <div className="flex gap-2 max-w-sm items-center">
        <Input placeholder="NSE symbol (RELIANCE, TCS…)" value={inputVal} onChange={(e) => setInputVal(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="font-mono" />
        <select value={exchange} onChange={(e) => setExchange(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="NSE">NSE</option>
          <option value="BSE">BSE</option>
        </select>
        <Button onClick={handleSearch} disabled={loading}><Search className="h-4 w-4" /></Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <TrendingUp className="h-12 w-12 text-primary animate-pulse" />
          <p className="text-muted-foreground">AI computing multi-timeframe forecasts…</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <h2 className="text-xl font-bold font-mono">{data.symbol}</h2>
              <p className="text-sm text-muted-foreground">{data.name}</p>
            </div>
            <div>
              <p className="text-xl font-mono font-bold">₹{data.currentPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Current Price</p>
            </div>
            <div className="ml-auto">
              <p className={`text-xl font-bold ${biasColor(data.technicalBias)}`}>{data.technicalBias.replace(/_/g, " ")}</p>
              <p className="text-xs text-muted-foreground">Technical Bias</p>
            </div>
          </div>

          {/* Timeframe Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.forecasts.map((f) => (
              <div key={f.timeframe} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
                <div className="bg-secondary/60 px-4 py-2.5 border-b border-border">
                  <p className="font-bold text-primary">{TF_LABELS[f.timeframe] ?? f.timeframe}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.catalyst}</p>
                </div>
                <div className="p-3 space-y-2.5 flex-1">
                  {/* Bull */}
                  <div className="rounded-md border border-green-900/40 bg-green-900/10 p-2.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-bold text-green-400">BULL</span>
                      <span className="text-xs text-green-400">{f.bull.probability}%</span>
                    </div>
                    <p className="font-mono font-bold text-green-400 text-sm">₹{f.bull.price.toFixed(0)}</p>
                    <p className="text-xs text-green-400">+{f.bull.changePercent.toFixed(1)}%</p>
                    <div className="mt-1.5 h-1 bg-green-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${f.bull.probability}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-tight">{f.bull.rationale}</p>
                  </div>
                  {/* Base */}
                  <div className="rounded-md border border-yellow-900/40 bg-yellow-900/10 p-2.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-bold text-yellow-400">BASE</span>
                      <span className="text-xs text-yellow-400">{f.base.probability}%</span>
                    </div>
                    <p className="font-mono font-bold text-yellow-400 text-sm">₹{f.base.price.toFixed(0)}</p>
                    <p className="text-xs text-yellow-400">{f.base.changePercent >= 0 ? "+" : ""}{f.base.changePercent.toFixed(1)}%</p>
                    <div className="mt-1.5 h-1 bg-yellow-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${f.base.probability}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-tight">{f.base.rationale}</p>
                  </div>
                  {/* Bear */}
                  <div className="rounded-md border border-red-900/40 bg-red-900/10 p-2.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-bold text-red-400">BEAR</span>
                      <span className="text-xs text-red-400">{f.bear.probability}%</span>
                    </div>
                    <p className="font-mono font-bold text-red-400 text-sm">₹{f.bear.price.toFixed(0)}</p>
                    <p className="text-xs text-red-400">{f.bear.changePercent.toFixed(1)}%</p>
                    <div className="mt-1.5 h-1 bg-red-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${f.bear.probability}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-tight">{f.bear.rationale}</p>
                  </div>
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Key Level:</span> {f.keyLevel}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Technical Summary + Risks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold mb-3 text-sm">Technical Summary</h3>
              <div className="space-y-2">
                {[
                  { label: "RSI(14)", value: `${data.technicalSummary.rsi.toFixed(1)}${data.technicalSummary.rsi > 70 ? " — Overbought" : data.technicalSummary.rsi < 30 ? " — Oversold" : " — Neutral"}` },
                  { label: "Trend", value: data.technicalSummary.trend },
                  { label: "MACD", value: data.technicalSummary.macdSignal },
                  { label: "Support", value: `₹${data.technicalSummary.support.toFixed(0)}` },
                  { label: "Resistance", value: `₹${data.technicalSummary.resistance.toFixed(0)}` },
                  { label: "Stochastic", value: data.technicalSummary.stochastic.toFixed(1) },
                  { label: "vs SMA50", value: data.technicalSummary.aboveSMA50 ? "Above ✓" : "Below ✗" },
                  { label: "vs SMA200", value: data.technicalSummary.aboveSMA200 ? "Above ✓" : "Below ✗" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium text-right max-w-[60%]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-yellow-900/30 bg-yellow-900/10 p-4">
              <h3 className="font-semibold text-yellow-400 flex items-center gap-2 mb-3 text-sm"><AlertTriangle className="h-4 w-4" /> Key Risks</h3>
              <ul className="space-y-2">
                {data.keyRisks.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="text-yellow-400 mt-0.5 shrink-0">!</span><span>{r}</span></li>)}
              </ul>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── MAIN ────────────────────────────
type Tab = "brief" | "opportunities" | "decision" | "forecast" | "chat";

function AIContent() {
  const [tab, setTab] = useState<Tab>("brief");
  const { activePortfolioId } = usePortfolio();
  const pid = activePortfolioId ?? "";

  const TABS = [
    { id: "brief" as Tab,             label: "Daily Brief",       icon: Calendar },
    { id: "opportunities" as Tab,     label: "Opportunities",     icon: Sparkles },
    { id: "decision" as Tab,          label: "Decisions",         icon: Crosshair },
    { id: "forecast" as Tab,          label: "Forecast",          icon: TrendingUp },
    { id: "chat" as Tab,              label: "AI Chat",           icon: MessageSquare },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Investment Advisor</h1>
          <p className="text-xs text-muted-foreground">Powered by Google Gemini · Indian Market Expert</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {(tab === "brief" || tab === "opportunities" || tab === "decision") && activePortfolioId === ALL_PORTFOLIOS_ID
        ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center max-w-lg mx-auto mt-4">
            <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-base font-semibold mb-1">Select a Portfolio</h2>
            <p className="text-sm text-muted-foreground">This tab analyses one portfolio at a time. Switch to a specific portfolio from the sidebar.</p>
          </div>
        )
        : (
          <>
            {tab === "brief"         && <BriefTab         portfolioId={pid} />}
            {tab === "opportunities" && <OpportunitiesTab portfolioId={pid} />}
            {tab === "decision"      && <DecisionTab      portfolioId={pid} />}
            {tab === "forecast"      && <ForecastTab />}
            {tab === "chat"          && <ChatTab />}
          </>
        )
      }
    </div>
  );
}

export default function AIPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <AIContent />
    </Suspense>
  );
}
