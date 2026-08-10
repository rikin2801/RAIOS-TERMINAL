"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import type { MarketQuote, TechnicalIndicators, FundamentalData } from "@/types";
import { Search, Brain, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { POPULAR_INDIAN_STOCKS, resolveSearchSymbol } from "@/lib/india";
import Link from "next/link";

function GaugeMeter({ value, label, min = 0, max = 100, zones }: {
  value: number;
  label: string;
  min?: number;
  max?: number;
  zones?: { up: number; label: string; color: string }[];
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const defaultZones = [
    { up: 30, label: "Oversold", color: "#22c55e" },
    { up: 70, label: "Neutral", color: "#eab308" },
    { up: 100, label: "Overbought", color: "#ef4444" },
  ];
  const z = zones ?? defaultZones;
  const activeZone = z.find((zone) => pct <= zone.up) ?? z[z.length - 1];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-12 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          {/* Track */}
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          {/* Fill */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={activeZone.color}
            strokeWidth="8"
            strokeDasharray={`${pct * 1.257} 125.7`}
          />
          {/* Needle */}
          <line
            x1="50" y1="50"
            x2={50 + 30 * Math.cos(Math.PI * (1 - pct / 100))}
            y2={50 - 30 * Math.sin(Math.PI * (1 - pct / 100))}
            stroke={activeZone.color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="3" fill={activeZone.color} />
        </svg>
      </div>
      <p className="font-mono font-bold text-lg" style={{ color: activeZone.color }}>{value.toFixed(1)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <Badge className="text-xs" style={{ backgroundColor: activeZone.color + "33", color: activeZone.color, border: "none" }}>
        {activeZone.label}
      </Badge>
    </div>
  );
}

function TechRow({ label, value, signal }: { label: string; value: string; signal?: "bullish" | "bearish" | "neutral" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-medium">{value}</span>
        {signal && (
          <Badge
            className="text-xs"
            style={{
              backgroundColor: signal === "bullish" ? "#22c55e22" : signal === "bearish" ? "#ef444422" : "#6b728022",
              color: signal === "bullish" ? "#22c55e" : signal === "bearish" ? "#ef4444" : "#9ca3af",
              border: "none",
            }}
          >
            {signal}
          </Badge>
        )}
      </div>
    </div>
  );
}

function FundRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium">{typeof value === "number" ? value.toFixed(2) : value}</span>
    </div>
  );
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [symbol, setSymbol] = useState<string>(() => {
    const url = searchParams.get("symbol");
    if (url) return url;
    if (typeof window !== "undefined") return localStorage.getItem("raios_last_analysis") ?? "";
    return "";
  });
  const [inputVal, setInputVal] = useState(symbol);
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalIndicators | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<typeof POPULAR_INDIAN_STOCKS>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fetchAnalysis = async (sym: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/market/${sym}?include=full`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setQuote(data.quote);
      setTechnicals(data.indicators);
      setFundamentals(data.fundamentals);
      router.replace(`/analysis?symbol=${sym}`);
      if (typeof window !== "undefined") localStorage.setItem("raios_last_analysis", sym);
    } catch {
      setError(`Could not load data for "${sym}". Check if the NSE ticker is correct.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (symbol) fetchAnalysis(symbol); }, [symbol]);

  const handleInputChange = (val: string) => {
    setInputVal(val);
    if (val.trim().length >= 2) {
      const words = val.trim().toLowerCase().split(/\s+/);
      const filtered = POPULAR_INDIAN_STOCKS.filter((s) => {
        const nameL = s.name.toLowerCase();
        const symL = s.symbol.toLowerCase();
        return words.every((w) => nameL.includes(w) || symL.includes(w));
      }).slice(0, 6);
      setSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setShowDropdown(false);
    }
  };

  const selectSuggestion = (s: typeof POPULAR_INDIAN_STOCKS[0]) => {
    setInputVal(s.symbol);
    setShowDropdown(false);
    setSymbol(s.symbol);
  };

  const handleSearch = () => {
    const raw = inputVal.trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const match = POPULAR_INDIAN_STOCKS.find(
      (s) => s.name.toLowerCase() === lower || s.symbol.toLowerCase() === lower
    );
    const sym = match ? match.symbol : resolveSearchSymbol(raw);
    setInputVal(sym);
    setShowDropdown(false);
    setSymbol(sym);
  };

  const rsiSignal = technicals
    ? technicals.rsi < 30 ? "bullish" : technicals.rsi > 70 ? "bearish" : "neutral"
    : "neutral";
  const macdSignal = technicals
    ? technicals.macd > technicals.macdSignal ? "bullish" : "bearish"
    : "neutral";
  const trendSignal = technicals
    ? technicals.trend === "UPTREND" ? "bullish" : technicals.trend === "DOWNTREND" ? "bearish" : "neutral"
    : "neutral";
  const stochSignal = technicals
    ? technicals.stochastic < 20 ? "bullish" : technicals.stochastic > 80 ? "bearish" : "neutral"
    : "neutral";

  return (
    <div className="p-6 space-y-6">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex gap-2 flex-1 max-w-sm" ref={dropdownRef}>
          <div className="relative flex-1">
            <Input
              placeholder="Search by name or ticker (e.g. Ashok, RELIANCE)..."
              value={inputVal}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); if (e.key === "Escape") setShowDropdown(false); }}
              onFocus={() => inputVal.length >= 2 && suggestions.length > 0 && setShowDropdown(true)}
            />
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2 text-sm"
                    onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  >
                    <div>
                      <span className="font-mono font-semibold text-primary">{s.symbol}</span>
                      <span className="ml-2 text-muted-foreground">{s.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{s.sector}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {quote && (
          <Link href={`/ai?symbol=${symbol}`}>
            <Button size="sm" className="gap-1">
              <Brain className="h-4 w-4" /> AI Analysis
            </Button>
          </Link>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && <p className="text-muted-foreground">Running analysis...</p>}

      {!symbol && !loading && !quote && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Activity className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">Search for any NSE/BSE stock</p>
          <p className="text-sm text-muted-foreground/60">Enter a ticker (RELIANCE, TCS, INFY) or company name above</p>
        </div>
      )}

      {quote && technicals && !loading && (
        <>
          {/* Quote Strip */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <h1 className="text-2xl font-bold font-mono">{quote.symbol}</h1>
              <p className="text-sm text-muted-foreground">{quote.name}</p>
            </div>
            <div className="ml-4">
              <p className="text-2xl font-mono font-bold">{formatCurrency(quote.price)}</p>
              <p className={`text-sm ${quote.change >= 0 ? "gain" : "loss"}`}>
                {quote.change >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                {formatCurrency(Math.abs(quote.change))} ({formatPercent(quote.changePercent)})
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Badge
                className="text-sm px-3 py-1"
                style={{
                  backgroundColor: trendSignal === "bullish" ? "#22c55e22" : trendSignal === "bearish" ? "#ef444422" : "#6b728022",
                  color: trendSignal === "bullish" ? "#22c55e" : trendSignal === "bearish" ? "#ef4444" : "#9ca3af",
                  border: "none",
                }}
              >
                <Activity className="h-3 w-3 mr-1 inline" />
                {technicals.trend}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Technical Analysis */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold mb-4">Oscillators</h2>
                <div className="grid grid-cols-3 gap-4">
                  <GaugeMeter
                    value={technicals.rsi}
                    label="RSI (14)"
                    zones={[
                      { up: 30, label: "Oversold", color: "#22c55e" },
                      { up: 70, label: "Neutral", color: "#eab308" },
                      { up: 100, label: "Overbought", color: "#ef4444" },
                    ]}
                  />
                  <GaugeMeter
                    value={technicals.stochastic}
                    label="Stochastic"
                    zones={[
                      { up: 20, label: "Oversold", color: "#22c55e" },
                      { up: 80, label: "Neutral", color: "#eab308" },
                      { up: 100, label: "Overbought", color: "#ef4444" },
                    ]}
                  />
                  <GaugeMeter
                    value={technicals.stochasticSignal}
                    label="Stoch D"
                    zones={[
                      { up: 20, label: "Oversold", color: "#22c55e" },
                      { up: 80, label: "Neutral", color: "#eab308" },
                      { up: 100, label: "Overbought", color: "#ef4444" },
                    ]}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold mb-3">Technical Indicators</h2>
                <TechRow label="RSI (14)" value={technicals.rsi.toFixed(2)} signal={rsiSignal} />
                <TechRow
                  label="MACD"
                  value={`${technicals.macd.toFixed(4)} / ${technicals.macdSignal.toFixed(4)}`}
                  signal={macdSignal}
                />
                <TechRow label="MACD Histogram" value={technicals.macdHistogram.toFixed(4)} signal={technicals.macdHistogram > 0 ? "bullish" : "bearish"} />
                <TechRow label="Stochastic %K" value={technicals.stochastic.toFixed(2)} signal={stochSignal} />
                <TechRow label="Stochastic %D" value={technicals.stochasticSignal.toFixed(2)} />
                <TechRow label="50 DMA" value={formatCurrency(technicals.sma50)} signal={quote.price > technicals.sma50 ? "bullish" : "bearish"} />
                <TechRow label="200 DMA" value={formatCurrency(technicals.sma200)} signal={quote.price > technicals.sma200 ? "bullish" : "bearish"} />
                <TechRow label="Trend" value={technicals.trend} signal={trendSignal} />
                <TechRow label="Support" value={formatCurrency(technicals.support)} />
                <TechRow label="Resistance" value={formatCurrency(technicals.resistance)} />
              </div>
            </div>

            {/* Fundamental Analysis */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold mb-3">Valuation</h2>
                <FundRow label="P/E Ratio (TTM)" value={fundamentals?.pe != null ? `${fundamentals.pe.toFixed(2)}x` : null} />
                <FundRow label="EPS (TTM)" value={fundamentals?.eps != null ? formatCurrency(fundamentals.eps) : null} />
                <FundRow label="Price/Book" value={fundamentals?.priceToBook != null ? `${fundamentals.priceToBook.toFixed(2)}x` : null} />
                <FundRow label="Book Value/Share" value={fundamentals?.bookValue != null ? formatCurrency(fundamentals.bookValue) : null} />
                <FundRow label="Beta" value={quote.beta != null ? quote.beta.toFixed(2) : null} />
                <FundRow label="Market Cap" value={quote.marketCap != null ? `₹${formatNumber(quote.marketCap)}` : null} />
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold mb-3">Profitability</h2>
                <FundRow label="Revenue" value={fundamentals?.revenue != null ? `₹${formatNumber(fundamentals.revenue)}` : null} />
                <FundRow label="Revenue Growth" value={fundamentals?.revenueGrowth != null ? formatPercent(fundamentals.revenueGrowth * 100) : null} />
                <FundRow label="Net Income" value={fundamentals?.netIncome != null ? `₹${formatNumber(fundamentals.netIncome)}` : null} />
                <FundRow label="Net Margin" value={fundamentals?.netMargin != null ? formatPercent(fundamentals.netMargin * 100) : null} />
                <FundRow label="ROE" value={fundamentals?.roe != null ? formatPercent(fundamentals.roe * 100) : null} />
                <FundRow label="Free Cash Flow" value={fundamentals?.freeCashFlow != null ? `₹${formatNumber(fundamentals.freeCashFlow)}` : null} />
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="font-semibold mb-3">Balance Sheet</h2>
                <FundRow label="Debt/Equity" value={fundamentals?.debtToEquity != null ? `${fundamentals.debtToEquity.toFixed(2)}x` : null} />
                <FundRow label="Current Ratio" value={fundamentals?.currentRatio != null ? fundamentals.currentRatio.toFixed(2) : null} />
                <FundRow label="Dividend Yield" value={fundamentals?.dividendYield != null ? formatPercent(fundamentals.dividendYield * 100) : null} />
                <FundRow label="Annual Dividend" value={quote.dividend != null ? formatCurrency(quote.dividend) : null} />
                <FundRow label="52W High" value={formatCurrency(quote.fiftyTwoWeekHigh)} />
                <FundRow label="52W Low" value={formatCurrency(quote.fiftyTwoWeekLow)} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}
