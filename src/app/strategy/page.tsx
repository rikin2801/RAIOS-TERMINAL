"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatCurrencyCompact } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, BarChart2, Activity, Zap,
  Star, ArrowUp, ArrowDown, AlertTriangle, Loader2,
  RefreshCw, ChevronRight, Target, Shield,
} from "lucide-react";
import Link from "next/link";

interface ScanResult {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  pe: number | null;
  volumeRatio: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  rsi?: number;
  macd?: number;
  macdHistogram?: number;
  sma50?: number;
  sma200?: number;
  trend?: string;
  support?: number;
  resistance?: number;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  scanType: string;
  theory: string;
  howItWorks: string;
  suitableFor: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  timeframe: string;
}

const STRATEGIES: Strategy[] = [
  {
    id: "momentum",
    name: "Momentum Leaders",
    description: "Stocks in strong uptrend with RSI 50-70 and positive MACD",
    icon: Zap,
    color: "#eab308",
    scanType: "momentum",
    theory: "Markets trend. Strong stocks tend to continue outperforming in the near-to-medium term.",
    howItWorks: "Identifies stocks with RSI between 50-72 (healthy momentum, not overbought), positive MACD histogram, and classified in UPTREND by the 50/200 DMA relationship.",
    suitableFor: "Medium-term investors (3-12 months) looking to ride existing trends.",
    risk: "MEDIUM",
    timeframe: "3-12 months",
  },
  {
    id: "golden-cross",
    name: "Golden Cross",
    description: "SMA50 has crossed above SMA200 — classic bullish signal",
    icon: Star,
    color: "#22c55e",
    scanType: "golden-cross",
    theory: "When the 50-day moving average crosses above the 200-day MA, it signals a shift from a bearish to bullish longer-term trend.",
    howItWorks: "Filters stocks where SMA50 > SMA200, indicating the medium-term trend has turned bullish relative to long-term.",
    suitableFor: "Swing to long-term investors looking for trend-following entries.",
    risk: "LOW",
    timeframe: "6-18 months",
  },
  {
    id: "rsi-oversold",
    name: "RSI Reversal",
    description: "Oversold stocks (RSI < 40) — potential bounce candidates",
    icon: ArrowDown,
    color: "#f97316",
    scanType: "rsi-oversold",
    theory: "When RSI falls below 40, the stock may be oversold, especially if fundamentals remain intact. A mean-reversion bounce often follows.",
    howItWorks: "Scans for stocks with RSI below 40. Lower RSI = more oversold. Best combined with support levels and improving volume.",
    suitableFor: "Contrarian and swing traders looking for short-term reversals.",
    risk: "HIGH",
    timeframe: "1-8 weeks",
  },
  {
    id: "volume-breakout",
    name: "Volume Breakouts",
    description: "Unusually high volume (> 1.5× average) signaling big moves",
    icon: BarChart2,
    color: "#3b82f6",
    scanType: "volume-breakout",
    theory: "Volume precedes price. A surge in volume (1.5-3× normal) often signals institutional activity and can precede a significant price move.",
    howItWorks: "Identifies stocks where today's volume exceeds 1.5× the 3-month average volume. Higher ratio = stronger signal.",
    suitableFor: "Active traders looking for short-term momentum opportunities.",
    risk: "HIGH",
    timeframe: "1-4 weeks",
  },
  {
    id: "52w-high",
    name: "52-Week Breakouts",
    description: "Stocks near or at 52-week highs — showing strength",
    icon: ArrowUp,
    color: "#22c55e",
    scanType: "52w-high",
    theory: "New highs attract momentum buyers. Stocks near 52-week highs are often in strong uptrends and tend to continue higher.",
    howItWorks: "Screens for stocks within 5% of their 52-week high. These are showing relative strength vs the broader market.",
    suitableFor: "Trend-following investors comfortable buying at highs.",
    risk: "MEDIUM",
    timeframe: "3-12 months",
  },
  {
    id: "52w-low",
    name: "Value Near Lows",
    description: "Stocks near 52-week lows — potential value plays",
    icon: Target,
    color: "#f59e0b",
    scanType: "52w-low",
    theory: "Stocks at 52-week lows can represent value opportunities IF the underlying business is still sound. High risk but potentially high reward.",
    howItWorks: "Identifies stocks within 12% of their 52-week low. Requires fundamental analysis to distinguish value traps from bargains.",
    suitableFor: "Value investors with patience and strong conviction in fundamentals.",
    risk: "HIGH",
    timeframe: "6-24 months",
  },
  {
    id: "macd-bullish",
    name: "MACD Crossovers",
    description: "Positive MACD histogram — bullish momentum building",
    icon: TrendingUp,
    color: "#06b6d4",
    scanType: "macd-bullish",
    theory: "When MACD crosses above its signal line (positive histogram), momentum is shifting bullish. Early signal before price moves significantly.",
    howItWorks: "Scans for stocks with a positive MACD histogram (MACD > Signal line). Larger histogram = stronger signal.",
    suitableFor: "Swing traders and technical traders looking for momentum entries.",
    risk: "MEDIUM",
    timeframe: "2-8 weeks",
  },
  {
    id: "rsi-overbought",
    name: "RSI Overbought",
    description: "RSI > 62 — strong upward momentum (watch for pullbacks)",
    icon: Activity,
    color: "#8b5cf6",
    scanType: "rsi-overbought",
    theory: "RSI above 62-70 signals strong momentum. Can continue in strong trends, but also signals potential near-term exhaustion.",
    howItWorks: "Identifies stocks with RSI > 62. In strong bull markets, overbought stocks can stay overbought. Use as a watchlist for pullback entries.",
    suitableFor: "Momentum traders in bull markets; use for position sizing caution.",
    risk: "MEDIUM",
    timeframe: "Watchlist / Near-term caution",
  },
  {
    id: "death-cross",
    name: "Death Cross Watch",
    description: "SMA50 below SMA200 — stocks showing weakness",
    icon: AlertTriangle,
    color: "#ef4444",
    scanType: "death-cross",
    theory: "When SMA50 falls below SMA200, it signals a shift to a longer-term downtrend. Avoid or reduce exposure.",
    howItWorks: "Flags stocks where SMA50 < SMA200. These stocks are in confirmed downtrends and should be avoided or used as short candidates.",
    suitableFor: "Risk management: identify holdings at risk. Exit signals.",
    risk: "HIGH",
    timeframe: "Risk management",
  },
];

function getRSIColor(rsi: number) {
  if (rsi < 30) return "#ef4444";
  if (rsi < 40) return "#f97316";
  if (rsi > 70) return "#8b5cf6";
  if (rsi > 60) return "#eab308";
  return "#22c55e";
}

function WhyQualifies({ stock, strategy }: { stock: ScanResult; strategy: Strategy }) {
  const reasons: string[] = [];

  switch (strategy.scanType) {
    case "momentum":
      if (stock.rsi) reasons.push(`RSI ${stock.rsi.toFixed(1)} — healthy momentum zone (50-72)`);
      if (stock.macdHistogram !== undefined && stock.macdHistogram > 0) reasons.push(`MACD histogram +${stock.macdHistogram.toFixed(4)} — bullish crossover`);
      if (stock.trend === "UPTREND") reasons.push("SMA50 > SMA200 — confirmed uptrend");
      if (stock.sma50 && stock.sma200) reasons.push(`SMA50 ₹${stock.sma50.toFixed(0)} vs SMA200 ₹${stock.sma200.toFixed(0)}`);
      break;
    case "golden-cross":
      if (stock.sma50 && stock.sma200) reasons.push(`SMA50 (₹${stock.sma50.toFixed(0)}) > SMA200 (₹${stock.sma200.toFixed(0)}) — golden cross confirmed`);
      if (stock.changePercent > 0) reasons.push(`Up ${stock.changePercent.toFixed(2)}% today — positive momentum`);
      break;
    case "rsi-oversold":
      if (stock.rsi) reasons.push(`RSI ${stock.rsi.toFixed(1)} — oversold (< 40), potential bounce`);
      if (stock.support) reasons.push(`Support at ₹${stock.support.toFixed(0)}`);
      break;
    case "volume-breakout":
      if (stock.volumeRatio) reasons.push(`Volume ${stock.volumeRatio}× above average — institutional activity likely`);
      if (stock.changePercent > 0) reasons.push(`Positive price reaction +${stock.changePercent.toFixed(2)}%`);
      break;
    case "52w-high":
      if (stock.pctFrom52wHigh !== null) reasons.push(`${Math.abs(stock.pctFrom52wHigh).toFixed(1)}% from 52-week high — near breakout zone`);
      break;
    case "52w-low":
      if (stock.pctFrom52wLow !== null) reasons.push(`+${stock.pctFrom52wLow.toFixed(1)}% from 52-week low — potential value zone`);
      break;
    case "macd-bullish":
      if (stock.macdHistogram !== undefined) reasons.push(`MACD histogram: +${stock.macdHistogram.toFixed(4)} — bullish signal`);
      if (stock.trend) reasons.push(`Trend: ${stock.trend}`);
      break;
    case "rsi-overbought":
      if (stock.rsi) reasons.push(`RSI ${stock.rsi.toFixed(1)} — strong momentum (> 62)`);
      break;
    case "death-cross":
      if (stock.sma50 && stock.sma200) reasons.push(`SMA50 (₹${stock.sma50.toFixed(0)}) < SMA200 (₹${stock.sma200.toFixed(0)}) — bearish death cross`);
      if (stock.changePercent < 0) reasons.push(`Down ${stock.changePercent.toFixed(2)}% today`);
      break;
  }

  if (stock.marketCap > 0) reasons.push(`Mkt Cap: ${formatCurrencyCompact(stock.marketCap)}`);

  return (
    <div className="mt-1.5 space-y-0.5">
      {reasons.map((r, i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
          <span className="text-primary mt-0.5 shrink-0">›</span>{r}
        </p>
      ))}
    </div>
  );
}

export default function StrategyPage() {
  const [activeStrategy, setActiveStrategy] = useState<Strategy>(STRATEGIES[0]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cacheAge, setCacheAge] = useState<number | null>(null);

  const fetchStrategy = useCallback(async (strategy: Strategy) => {
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`/api/market/scan?type=${strategy.scanType}&limit=20`);
      const data = await res.json();
      setResults(data.results ?? []);
      setCacheAge(data.cacheAge?.tech ?? data.cacheAge?.quotes ?? null);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStrategy(activeStrategy); }, [activeStrategy, fetchStrategy]);

  const riskColor = (r: string) => r === "LOW" ? "text-green-400 border-green-500/40 bg-green-500/10" : r === "MEDIUM" ? "text-yellow-400 border-yellow-500/40 bg-yellow-500/10" : "text-red-400 border-red-500/40 bg-red-500/10";

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Strategy sidebar */}
      <aside className="w-60 border-r border-border bg-card flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h1 className="font-bold text-base flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" /> Strategy Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Technical strategy scanners</p>
        </div>
        <nav className="p-2 space-y-0.5 flex-1">
          {STRATEGIES.map((s) => {
            const Icon = s.icon;
            const active = activeStrategy.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStrategy(s)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: active ? s.color : undefined }} />
                <span className="flex-1 leading-tight">{s.name}</span>
                {active && <ChevronRight className="h-3 w-3" />}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Strategy header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${activeStrategy.color}22` }}>
              <activeStrategy.icon className="h-5 w-5" style={{ color: activeStrategy.color }} />
            </div>
            <div>
              <h2 className="text-xl font-bold">{activeStrategy.name}</h2>
              <p className="text-sm text-muted-foreground">{activeStrategy.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${riskColor(activeStrategy.risk)}`}>
              <Shield className="h-3 w-3 mr-1" />{activeStrategy.risk} RISK
            </Badge>
            <Button variant="outline" size="sm" onClick={() => fetchStrategy(activeStrategy)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Strategy theory */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Theory</p>
            <p className="text-sm leading-relaxed">{activeStrategy.theory}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">How It Works</p>
            <p className="text-sm leading-relaxed">{activeStrategy.howItWorks}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Timeframe &amp; Suitability</p>
            <p className="text-sm font-mono text-primary">{activeStrategy.timeframe}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{activeStrategy.suitableFor}</p>
          </div>
        </div>

        {/* Results */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">{loading ? "Scanning…" : `${results.length} stock${results.length !== 1 ? "s" : ""} qualifying`}</h3>
            {cacheAge !== null && <p className="text-xs text-muted-foreground">Data: {cacheAge}s ago</p>}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">
                {activeStrategy.scanType.includes("rsi") || activeStrategy.scanType.includes("cross") || activeStrategy.scanType.includes("momentum") || activeStrategy.scanType.includes("macd")
                  ? "Computing technical indicators (first load ~8s)…"
                  : "Fetching market data…"}
              </p>
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <AlertTriangle className="h-8 w-8 opacity-30" />
              <p>No stocks found for this strategy right now.</p>
              <p className="text-xs">Market may be closed or filters too strict.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="grid gap-3">
              {results.map((stock, i) => (
                <div key={stock.symbol} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary text-base">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground truncate">{stock.name}</span>
                        <Badge variant="outline" className="text-xs py-0 ml-auto">{stock.sector}</Badge>
                      </div>

                      <WhyQualifies stock={stock} strategy={activeStrategy} />

                      <div className="flex items-center gap-4 mt-2">
                        <div>
                          <span className="text-sm font-mono font-bold">{formatCurrency(stock.price)}</span>
                          <span className={`ml-2 text-sm font-semibold ${stock.changePercent >= 0 ? "gain" : "loss"}`}>
                            {stock.changePercent >= 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                            {Math.abs(stock.changePercent).toFixed(2)}%
                          </span>
                        </div>
                        {stock.rsi !== undefined && (
                          <span className="text-xs">RSI: <span className="font-mono font-bold" style={{ color: getRSIColor(stock.rsi) }}>{stock.rsi.toFixed(1)}</span></span>
                        )}
                        {stock.trend && (
                          <Badge variant="outline" className={`text-xs ${stock.trend === "UPTREND" ? "border-green-600 text-green-400" : stock.trend === "DOWNTREND" ? "border-red-600 text-red-400" : "border-yellow-600 text-yellow-400"}`}>
                            {stock.trend}
                          </Badge>
                        )}
                        {stock.volumeRatio && stock.volumeRatio > 1.5 && (
                          <span className="text-xs text-blue-400 font-mono">Vol {stock.volumeRatio}×</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex flex-col gap-1.5">
                      <Link href={`/analysis?symbol=${stock.symbol}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs w-full">AI Analysis</Button>
                      </Link>
                      <Link href={`/market?symbol=${stock.symbol}&tab=chart`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs w-full">Chart</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4">
          Not financial advice. Technical strategies are based on historical patterns and do not guarantee future performance. Always do your own research.
        </p>
      </div>
    </div>
  );
}
