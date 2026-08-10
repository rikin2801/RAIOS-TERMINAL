"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriceChart } from "@/components/charts/price-chart";
import { formatCurrency, formatPercent, formatNumber, formatCurrencyCompact } from "@/lib/utils";
import type { MarketQuote } from "@/types";
import {
  Search, TrendingUp, TrendingDown, BarChart2, Activity,
  Zap, Star, ArrowUp, ArrowDown, AlertTriangle, Loader2,
  RefreshCw, X, ChevronDown, ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { POPULAR_INDIAN_STOCKS } from "@/lib/india";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = (typeof PERIODS)[number];

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
  dividendYield: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volumeRatio: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  rsi?: number;
  macdHistogram?: number;
  sma50?: number;
  sma200?: number;
  trend?: string;
}

interface HistCandle { time: number; open: number; high: number; low: number; close: number; volume: number; }

const SCANNERS = [
  { id: "gainers",           label: "Gainers",       icon: TrendingUp,    color: "#22c55e", tech: false },
  { id: "losers",            label: "Losers",         icon: TrendingDown,  color: "#ef4444", tech: false },
  { id: "volume-breakout",   label: "Volume ↑",       icon: BarChart2,     color: "#3b82f6", tech: false },
  { id: "52w-high",          label: "52W High",       icon: ArrowUp,       color: "#22c55e", tech: false },
  { id: "52w-low",           label: "52W Low",        icon: ArrowDown,     color: "#f59e0b", tech: false },
  { id: "rsi-oversold",      label: "RSI: Low",       icon: Activity,      color: "#f97316", tech: true  },
  { id: "rsi-overbought",    label: "RSI: High",      icon: Activity,      color: "#8b5cf6", tech: true  },
  { id: "momentum",          label: "Momentum",       icon: Zap,           color: "#eab308", tech: true  },
  { id: "golden-cross",      label: "Golden ✕",       icon: Star,          color: "#22c55e", tech: true  },
  { id: "death-cross",       label: "Death ✕",        icon: AlertTriangle, color: "#ef4444", tech: true  },
  { id: "macd-bullish",      label: "MACD+",          icon: TrendingUp,    color: "#06b6d4", tech: true  },
] as const;

type ScannerType = (typeof SCANNERS)[number]["id"];

function getRSIColor(rsi: number) {
  if (rsi < 30) return "#ef4444";
  if (rsi < 40) return "#f97316";
  if (rsi > 70) return "#8b5cf6";
  if (rsi > 60) return "#eab308";
  return "#22c55e";
}

function ScannerTable({
  results, loading, scanType, onSelect, selectedSymbol,
}: {
  results: ScanResult[];
  loading: boolean;
  scanType: ScannerType;
  onSelect: (s: ScanResult) => void;
  selectedSymbol: string | null;
}) {
  if (loading) {
    const scanner = SCANNERS.find((s) => s.id === scanType);
    const isTech = scanner?.tech;
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {isTech ? "Computing technical indicators (first load ~8s)…" : "Fetching market data…"}
        </p>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <BarChart2 className="h-8 w-8 opacity-30" />
        <p>No stocks match this scan right now.</p>
        <p className="text-xs">Market may be closed or data unavailable.</p>
      </div>
    );
  }

  const ExtraCol = ({ s }: { s: ScanResult }) => {
    switch (scanType) {
      case "gainers":
      case "losers":
        return <td className="text-right font-mono text-xs text-muted-foreground">{s.volume > 0 ? formatNumber(s.volume) : "—"}</td>;
      case "volume-breakout":
        return <td className="text-right font-mono"><span className={`text-xs px-1.5 py-0.5 rounded ${(s.volumeRatio ?? 0) >= 2 ? "bg-blue-500/20 text-blue-400" : "bg-blue-500/10 text-blue-300"}`}>{s.volumeRatio !== null ? `${s.volumeRatio}×` : "—"}</span></td>;
      case "52w-high":
        return <td className="text-right font-mono text-xs"><span className="text-green-400">{s.pctFrom52wHigh !== null ? `${s.pctFrom52wHigh > 0 ? "+" : ""}${s.pctFrom52wHigh}%` : "—"}</span><p className="text-muted-foreground">{s.fiftyTwoWeekHigh > 0 ? formatCurrency(s.fiftyTwoWeekHigh) : "—"}</p></td>;
      case "52w-low":
        return <td className="text-right font-mono text-xs"><span className="text-yellow-400">+{s.pctFrom52wLow}%</span><p className="text-muted-foreground">{s.fiftyTwoWeekLow > 0 ? formatCurrency(s.fiftyTwoWeekLow) : "—"}</p></td>;
      case "rsi-oversold":
      case "rsi-overbought":
        return <td className="text-right"><span className="font-mono text-sm font-bold" style={{ color: getRSIColor(s.rsi ?? 50) }}>{s.rsi?.toFixed(1) ?? "—"}</span></td>;
      case "momentum":
      case "macd-bullish":
        return <td className="text-right text-xs">{s.trend ? <Badge variant="outline" className={`text-xs ${s.trend === "UPTREND" ? "border-green-600 text-green-400" : s.trend === "DOWNTREND" ? "border-red-600 text-red-400" : "border-yellow-600 text-yellow-400"}`}>{s.trend}</Badge> : "—"}</td>;
      case "golden-cross":
      case "death-cross":
        return <td className="text-right text-xs text-muted-foreground">{s.sma50 ? <span>{formatCurrency(s.sma50)} <span className="opacity-50">/</span> {formatCurrency(s.sma200 ?? 0)}</span> : "—"}</td>;
      default:
        return <td>—</td>;
    }
  };

  const extraHeader = {
    gainers: "Volume",
    losers: "Volume",
    "volume-breakout": "Vol Ratio",
    "52w-high": "vs 52W High",
    "52w-low": "vs 52W Low",
    "rsi-oversold": "RSI",
    "rsi-overbought": "RSI",
    momentum: "Trend",
    "golden-cross": "SMA50 / SMA200",
    "death-cross": "SMA50 / SMA200",
    "macd-bullish": "Trend",
  }[scanType];

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Symbol</th>
            <th>Company</th>
            <th>Sector</th>
            <th className="text-right">Price</th>
            <th className="text-right">Day %</th>
            {scanType !== "gainers" && scanType !== "losers" && <th className="text-right">Mkt Cap</th>}
            <th className="text-right">{extraHeader}</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {results.map((s, i) => (
            <tr
              key={s.symbol}
              className={`cursor-pointer transition-colors ${selectedSymbol === s.symbol ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/30"}`}
              onClick={() => onSelect(s)}
            >
              <td className="text-muted-foreground text-xs">{i + 1}</td>
              <td>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-primary">{s.symbol}</span>
                </div>
              </td>
              <td className="text-muted-foreground text-sm max-w-[160px] truncate">{s.name}</td>
              <td><Badge variant="outline" className="text-xs py-0">{s.sector}</Badge></td>
              <td className="text-right font-mono font-semibold">{formatCurrency(s.price)}</td>
              <td className={`text-right font-semibold ${s.changePercent >= 0 ? "gain" : "loss"}`}>
                {s.changePercent >= 0 ? "+" : ""}{s.changePercent.toFixed(2)}%
              </td>
              {scanType !== "gainers" && scanType !== "losers" && (
                <td className="text-right text-xs text-muted-foreground">{s.marketCap > 0 ? formatCurrencyCompact(s.marketCap) : "—"}</td>
              )}
              <ExtraCol s={s} />
              <td>
                {selectedSymbol === s.symbol ? (
                  <ChevronUp className="h-3 w-3 text-primary" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScannerView() {
  const [scanType, setScanType] = useState<ScannerType>("gainers");
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<ScanResult | null>(null);
  const [chartData, setChartData] = useState<HistCandle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<Period>("3mo");
  const [cacheAge, setCacheAge] = useState<{ quotes: number | null; tech: number | null } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const fetchScan = useCallback(async (type: ScannerType) => {
    setLoading(true);
    setSelectedStock(null);
    setChartData([]);
    try {
      const res = await fetch(`/api/market/scan?type=${type}&limit=25`);
      const data = await res.json();
      setResults(data.results ?? []);
      setCacheAge(data.cacheAge ?? null);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  const fetchChart = useCallback(async (symbol: string, period: Period) => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/market/${symbol}?include=historical&period=${period}`);
      const data = await res.json();
      setChartData(data.historical ?? []);
    } catch {
      setChartData([]);
    }
    setChartLoading(false);
  }, []);

  useEffect(() => { fetchScan(scanType); }, [scanType, fetchScan]);

  useEffect(() => {
    if (selectedStock) fetchChart(selectedStock.symbol, chartPeriod);
  }, [selectedStock, chartPeriod, fetchChart]);

  const handleSelectStock = (s: ScanResult) => {
    if (selectedStock?.symbol === s.symbol) {
      setSelectedStock(null);
      setChartData([]);
    } else {
      setSelectedStock(s);
      setTimeout(() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 150);
    }
  };

  return (
    <div className="space-y-4">
      {/* Scanner tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SCANNERS.map((sc) => {
          const Icon = sc.icon;
          const active = scanType === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => setScanType(sc.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                active
                  ? "text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-border"
              }`}
              style={active ? { backgroundColor: sc.color, borderColor: sc.color } : {}}
            >
              <Icon className="h-3.5 w-3.5" />
              {sc.label}
              {sc.tech && !active && <span className="text-[9px] opacity-60">AI</span>}
            </button>
          );
        })}
        <button
          onClick={() => fetchScan(scanType)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {cacheAge && (
        <p className="text-[11px] text-muted-foreground">
          Quotes: {cacheAge.quotes != null ? `${cacheAge.quotes}s ago` : "fresh"}
          {cacheAge.tech != null && ` · Technicals: ${cacheAge.tech}s ago`}
        </p>
      )}

      {/* Results table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <ScannerTable
          results={results}
          loading={loading}
          scanType={scanType}
          onSelect={handleSelectStock}
          selectedSymbol={selectedStock?.symbol ?? null}
        />
      </div>

      {/* Inline chart panel */}
      {selectedStock && (
        <div ref={chartRef} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-bold font-mono text-lg text-primary">{selectedStock.symbol}</h3>
                <p className="text-xs text-muted-foreground">{selectedStock.name}</p>
              </div>
              <div>
                <p className="text-xl font-mono font-bold">{formatCurrency(selectedStock.price)}</p>
                <p className={`text-sm font-semibold ${selectedStock.changePercent >= 0 ? "gain" : "loss"}`}>
                  {selectedStock.changePercent >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                  {selectedStock.changePercent >= 0 ? "+" : ""}{selectedStock.changePercent.toFixed(2)}%
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 ml-4">
                {selectedStock.rsi !== undefined && (
                  <p className="text-xs"><span className="text-muted-foreground">RSI:</span> <span className="font-mono font-bold" style={{ color: getRSIColor(selectedStock.rsi) }}>{selectedStock.rsi.toFixed(1)}</span></p>
                )}
                {selectedStock.trend && (
                  <p className="text-xs"><span className="text-muted-foreground">Trend:</span> <span className={`font-mono font-bold ${selectedStock.trend === "UPTREND" ? "text-green-400" : selectedStock.trend === "DOWNTREND" ? "text-red-400" : "text-yellow-400"}`}>{selectedStock.trend}</span></p>
                )}
                {selectedStock.volumeRatio !== null && selectedStock.volumeRatio !== undefined && (
                  <p className="text-xs"><span className="text-muted-foreground">Vol:</span> <span className="font-mono font-bold text-blue-400">{selectedStock.volumeRatio}×</span></p>
                )}
                {selectedStock.marketCap > 0 && (
                  <p className="text-xs"><span className="text-muted-foreground">MCap:</span> <span className="font-mono">{formatCurrencyCompact(selectedStock.marketCap)}</span></p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/analysis?symbol=${selectedStock.symbol}`}>
                <Button variant="outline" size="sm" className="text-xs h-7">AI Analysis</Button>
              </Link>
              <button onClick={() => { setSelectedStock(null); setChartData([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <Button key={p} variant={chartPeriod === p ? "default" : "ghost"} size="sm" className="h-6 px-2 text-xs" onClick={() => setChartPeriod(p)}>
                {p.toUpperCase()}
              </Button>
            ))}
          </div>

          {chartLoading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading chart…
            </div>
          ) : chartData.length > 0 ? (
            <PriceChart data={chartData} height={240} />
          ) : (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No chart data available</div>
          )}
        </div>
      )}
    </div>
  );
}

function ChartView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [symbol, setSymbol] = useState(searchParams.get("symbol") ?? "RELIANCE");
  const [inputVal, setInputVal] = useState(searchParams.get("symbol") ?? "RELIANCE");
  const [quote, setQuote] = useState<MarketQuote | null>(null);
  const [historical, setHistorical] = useState<HistCandle[]>([]);
  const [period, setPeriod] = useState<Period>("1y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<typeof POPULAR_INDIAN_STOCKS>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fetchData = useCallback(async (sym: string, p: Period) => {
    setLoading(true);
    setError("");
    try {
      const [qRes, hRes] = await Promise.all([
        fetch(`/api/market/${sym}`),
        fetch(`/api/market/${sym}?include=historical&period=${p}`),
      ]);
      if (!qRes.ok) throw new Error("Symbol not found");
      const [q, h] = await Promise.all([qRes.json(), hRes.json()]);
      setQuote(q);
      setHistorical(h.historical ?? []);
      router.replace(`/market?symbol=${sym}`);
    } catch {
      setError(`Could not load data for "${sym}". Check if the NSE ticker is correct.`);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchData(symbol, period); }, [symbol, period, fetchData]);

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

  const handleSearch = () => {
    const raw = inputVal.trim();
    if (!raw) return;
    const words = raw.toLowerCase().split(/\s+/);
    const match = POPULAR_INDIAN_STOCKS.find((s) =>
      words.every((w) => s.name.toLowerCase().includes(w) || s.symbol.toLowerCase().includes(w))
    );
    const sym = match ? match.symbol : raw.toUpperCase();
    setInputVal(sym);
    setShowDropdown(false);
    setSymbol(sym);
  };

  const StatBox = ({ label, value }: { label: string; value: string }) => (
    <div className="bg-secondary/50 rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold mt-0.5 text-sm">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex gap-2 flex-1 max-w-sm" ref={dropdownRef}>
          <div className="relative flex-1">
            <Input
              placeholder="Search name or ticker (e.g. Tata Consultancy, TCS)…"
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
                    onMouseDown={(e) => { e.preventDefault(); setInputVal(s.symbol); setShowDropdown(false); setSymbol(s.symbol); }}
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
          <Link href={`/analysis?symbol=${symbol}`}>
            <Button variant="outline" size="sm">
              <Activity className="h-4 w-4" /> AI Analysis
            </Button>
          </Link>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading && <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {quote && !loading && (
        <>
          <div className="flex items-start gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold font-mono">{quote.symbol}</h2>
                <Badge variant="outline">{quote.shortName ?? quote.name}</Badge>
              </div>
              <p className="text-muted-foreground text-sm mt-1">{quote.name}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-3xl font-bold font-mono">{formatCurrency(quote.price)}</p>
              <p className={`text-base font-semibold ${quote.changePercent >= 0 ? "gain" : "loss"}`}>
                {quote.changePercent >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                {formatCurrency(Math.abs(quote.change))} ({formatPercent(quote.changePercent)})
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              {PERIODS.map((p) => (
                <Button key={p} variant={period === p ? "default" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setPeriod(p)}>
                  {p.toUpperCase()}
                </Button>
              ))}
            </div>
            {historical.length > 0 ? <PriceChart data={historical} height={400} /> : (
              <div className="h-72 flex items-center justify-center text-muted-foreground">No chart data</div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatBox label="Open" value={formatCurrency(quote.open)} />
            <StatBox label="High" value={formatCurrency(quote.high)} />
            <StatBox label="Low" value={formatCurrency(quote.low)} />
            <StatBox label="Prev Close" value={formatCurrency(quote.previousClose)} />
            <StatBox label="Volume" value={formatNumber(quote.volume)} />
            <StatBox label="Avg Volume" value={quote.avgVolume ? formatNumber(quote.avgVolume) : "N/A"} />
            <StatBox label="52W High" value={formatCurrency(quote.fiftyTwoWeekHigh)} />
            <StatBox label="52W Low" value={formatCurrency(quote.fiftyTwoWeekLow)} />
            {quote.marketCap && <StatBox label="Market Cap" value={formatCurrencyCompact(quote.marketCap)} />}
            {quote.pe && <StatBox label="P/E Ratio" value={quote.pe.toFixed(2)} />}
            {quote.eps && <StatBox label="EPS (TTM)" value={formatCurrency(quote.eps)} />}
            {quote.beta && <StatBox label="Beta" value={quote.beta.toFixed(2)} />}
            {quote.dividend && <StatBox label="Dividend" value={formatCurrency(quote.dividend)} />}
            {quote.dividendYield && <StatBox label="Div Yield" value={formatPercent(quote.dividendYield * 100)} />}
          </div>
        </>
      )}
    </div>
  );
}

function MarketContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "chart" ? "chart" : "scanner";
  const [tab, setTab] = useState<"scanner" | "chart">(initialTab);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Market Explorer</h1>
          <p className="text-xs text-muted-foreground">NSE · BSE · Real-time market data</p>
        </div>
        <div className="flex gap-1 border border-border rounded-lg p-1 self-start">
          <button
            onClick={() => setTab("scanner")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "scanner" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart2 className="inline h-3.5 w-3.5 mr-1.5" />Scanner
          </button>
          <button
            onClick={() => setTab("chart")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "chart" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <TrendingUp className="inline h-3.5 w-3.5 mr-1.5" />Chart
          </button>
        </div>
      </div>

      {tab === "scanner" ? <ScannerView /> : <ChartView />}
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <MarketContent />
    </Suspense>
  );
}
