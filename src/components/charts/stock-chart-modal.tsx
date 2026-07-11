"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
} from "lightweight-charts";
import {
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChartPeriod = "1D" | "5D" | "1W" | "1M" | "3M" | "1Y" | "5Y";
export type ChartInterval = "1m" | "30m" | "1h" | "1d";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface QuoteInfo {
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  pe?: number;
}

interface Props {
  symbol: string;
  exchange?: string;
  name?: string;
  onClose: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: ChartPeriod }[] = [
  { label: "1D", value: "1D" },
  { label: "5D", value: "5D" },
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "1Y", value: "1Y" },
  { label: "5Y", value: "5Y" },
];

// 1d interval removed from "1D" period — a daily bar for a single day makes no sense
const INTERVALS: { label: string; value: ChartInterval; validPeriods: ChartPeriod[] }[] = [
  { label: "1m",  value: "1m",  validPeriods: ["1D"] },
  { label: "30m", value: "30m", validPeriods: ["1D", "5D", "1W", "1M", "3M"] },
  { label: "1h",  value: "1h",  validPeriods: ["1D", "5D", "1W", "1M", "3M", "1Y"] },
  { label: "1D",  value: "1d",  validPeriods: ["5D", "1W", "1M", "3M", "1Y", "5Y"] },
];

const DEFAULT_INTERVAL: Record<ChartPeriod, ChartInterval> = {
  "1D": "30m", "5D": "30m", "1W": "1h",
  "1M": "1d", "3M": "1d", "1Y": "1d", "5Y": "1d",
};

// ── Indicator Calculations ────────────────────────────────────────────────────

function calcEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [seed];
  for (let i = period; i < values.length; i++) {
    result.push(values[i] * k + result[result.length - 1] * (1 - k));
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number[] {
  if (closes.length <= period) return [];
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let avgG = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgL = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [];
  for (let i = period; i < gains.length; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    result.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  }
  return result;
}

function calcMACD(closes: number[]) {
  const e12 = calcEMA(closes, 12);
  const e26 = calcEMA(closes, 26);
  const offset = e12.length - e26.length;
  const macdLine = e26.map((v, i) => e12[i + offset] - v);
  const signal = calcEMA(macdLine, 9);
  const hOffset = macdLine.length - signal.length;
  const histogram = signal.map((v, i) => macdLine[i + hOffset] - v);
  return { macdLine: macdLine.slice(hOffset), signal, histogram };
}

function calcStochastic(candles: Candle[], kPeriod = 14, dPeriod = 3) {
  const k: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    k.push(hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100);
  }
  const d: number[] = [];
  for (let i = dPeriod - 1; i < k.length; i++) {
    d.push(k.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / dPeriod);
  }
  return { k: k.slice(dPeriod - 1), d };
}

interface IndicatorRow {
  time: number;
  rsi: number | null;
  macdLine: number | null;
  macdSig: number | null;
  macdHist: number | null;
  stochK: number | null;
  stochD: number | null;
}

function buildIndicatorData(candles: Candle[]): IndicatorRow[] {
  const closes = candles.map((c) => c.close);
  const rsiArr = calcRSI(closes);
  const { macdLine, signal, histogram } = calcMACD(closes);
  const { k: stochK, d: stochD } = calcStochastic(candles);

  return candles.map((c, i) => {
    const ri = i - (candles.length - rsiArr.length);
    const mi = i - (candles.length - macdLine.length);
    const si = i - (candles.length - stochK.length);
    return {
      time: c.time,
      rsi:      ri >= 0 ? rsiArr[ri]   : null,
      macdLine: mi >= 0 ? macdLine[mi] : null,
      macdSig:  mi >= 0 ? signal[mi]   : null,
      macdHist: mi >= 0 ? histogram[mi]: null,
      stochK:   si >= 0 ? stochK[si]   : null,
      stochD:   si >= 0 ? stochD[si]   : null,
    };
  });
}

// ── Technical Signal Computation ──────────────────────────────────────────────

type SignalVerdict = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

function computeSignal(indData: IndicatorRow[], quote: QuoteInfo | null): {
  verdict: SignalVerdict;
  rsi: number | null;
  stochK: number | null;
  macdHist: number | null;
  macdBull: boolean | null;
  range52pct: number | null;
} | null {
  if (indData.length === 0) return null;
  const last = indData[indData.length - 1];
  const prev = indData.length > 1 ? indData[indData.length - 2] : null;

  let buy = 0, sell = 0;

  const rsi = last.rsi;
  if (rsi !== null) {
    if (rsi < 35) buy++;
    else if (rsi > 65) sell++;
  }

  const hist = last.macdHist;
  let macdBull: boolean | null = null;
  if (hist !== null) {
    macdBull = hist > 0;
    if (macdBull) buy++; else sell++;
  }

  const stochK = last.stochK;
  if (stochK !== null) {
    if (stochK < 25) buy++;
    else if (stochK > 75) sell++;
  }

  const prevHist = prev?.macdHist ?? null;
  // Bonus: MACD crossover is stronger signal
  if (hist !== null && prevHist !== null) {
    if (hist > 0 && prevHist <= 0) buy++;
    else if (hist < 0 && prevHist >= 0) sell++;
  }

  let verdict: SignalVerdict;
  if (buy >= 3) verdict = "STRONG BUY";
  else if (buy > sell) verdict = "BUY";
  else if (sell >= 3) verdict = "STRONG SELL";
  else if (sell > buy) verdict = "SELL";
  else verdict = "HOLD";

  let range52pct: number | null = null;
  if (quote?.fiftyTwoWeekHigh && quote?.fiftyTwoWeekLow && quote.price) {
    const range = quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow;
    if (range > 0) range52pct = Math.max(0, Math.min(100, ((quote.price - quote.fiftyTwoWeekLow) / range) * 100));
  }

  return { verdict, rsi, stochK, macdHist: hist, macdBull, range52pct };
}

function formatTime(unix: number, interval: ChartInterval): string {
  const d = new Date(unix * 1000);
  if (interval === "1m" || interval === "30m" || interval === "1h") {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StockChartModal({ symbol, exchange = "NSE", name, onClose }: Props) {
  const [period, setPeriod] = useState<ChartPeriod>("1M");
  const [interval, setInterval] = useState<ChartInterval>("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<QuoteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRSI, setShowRSI] = useState(true);
  const [showMACD, setShowMACD] = useState(true);
  const [showStoch, setShowStoch] = useState(true);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/market/${symbol}?include=chart&period=${period}&interval=${interval}&exchange=${exchange}`
      );
      if (!res.ok) throw new Error("Failed to load chart data");
      const data = await res.json();
      setCandles(data.candles ?? []);
      if (data.quote) {
        setQuote({
          name: data.quote.name,
          price: data.quote.price,
          change: data.quote.change,
          changePercent: data.quote.changePercent,
          fiftyTwoWeekHigh: data.quote.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: data.quote.fiftyTwoWeekLow,
          pe: data.quote.pe,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange, period, interval]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: interval !== "1d",
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeries.setData(candles.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));

    const volSeries = chart.addSeries(HistogramSeries, {
      color: "#22c55e", priceFormat: { type: "volume" }, priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volSeries.setData(candles.map((c) => ({
      time: c.time as any, value: c.volume,
      color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    })));

    const closes = candles.map((c) => c.close);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const times = candles.map((c) => c.time as any);
    const makeSMA = (p: number) =>
      Array.from({ length: closes.length - p + 1 }, (_, i) => ({
        time: times[i + p - 1],
        value: closes.slice(i, i + p).reduce((a, b) => a + b, 0) / p,
      }));

    if (candles.length >= 50) {
      const sma50 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sma50.setData(makeSMA(50));
    }
    if (candles.length >= 200) {
      const sma200 = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sma200.setData(makeSMA(200));
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, interval]);

  const handlePeriodChange = (p: ChartPeriod) => {
    setPeriod(p);
    const validForPeriod = INTERVALS.filter((opt) => opt.validPeriods.includes(p));
    if (!validForPeriod.find((opt) => opt.value === interval)) {
      setInterval(DEFAULT_INTERVAL[p]);
    }
  };

  const indicatorData = candles.length > 0 ? buildIndicatorData(candles) : [];
  const signal = indicatorData.length > 0 ? computeSignal(indicatorData, quote) : null;
  const changeColor = (quote?.changePercent ?? 0) >= 0 ? "#22c55e" : "#ef4444";

  const verdictColor: Record<SignalVerdict, string> = {
    "STRONG BUY":  "bg-green-500 text-white",
    "BUY":         "bg-green-700 text-green-100",
    "HOLD":        "bg-yellow-600 text-yellow-100",
    "SELL":        "bg-red-700 text-red-100",
    "STRONG SELL": "bg-red-500 text-white",
  };

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    fontSize: 10,
    borderRadius: 4,
  };
  const tickStyle = { fontSize: 10 };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — full-screen minus 16px margin, flex column */}
      <div className="fixed inset-4 z-50 bg-[hsl(var(--card))] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base font-mono">{symbol}</span>
                <span className="text-xs text-muted-foreground border border-border rounded px-1">{exchange}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{quote?.name ?? name ?? symbol}</p>
            </div>
            {quote && (
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono">
                  ₹{quote.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-semibold" style={{ color: changeColor }}>
                  {quote.changePercent >= 0 ? "▲" : "▼"} {Math.abs(quote.changePercent).toFixed(2)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  ({quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)})
                </span>
                {quote.pe && (
                  <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    P/E {quote.pe.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Period + Interval Controls ── */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border shrink-0 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Period</span>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Interval</span>
            {INTERVALS.map((opt) => {
              const valid = opt.validPeriods.includes(period);
              return (
                <button
                  key={opt.value}
                  onClick={() => valid && setInterval(opt.value)}
                  disabled={!valid}
                  className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                    interval === opt.value && valid
                      ? "bg-primary text-primary-foreground"
                      : valid
                      ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                      : "text-muted-foreground/30 cursor-not-allowed"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-yellow-400" /> SMA50</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-violet-400" /> SMA200</span>
          </div>
        </div>

        {/* ── Decision Signal Banner ── */}
        {signal && !loading && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-card/50 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${verdictColor[signal.verdict]}`}>
              {signal.verdict}
            </span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {signal.rsi !== null && (
                <span className={signal.rsi < 35 ? "text-green-400" : signal.rsi > 65 ? "text-red-400" : ""}>
                  RSI {signal.rsi.toFixed(0)}{signal.rsi < 35 ? " ↓ Oversold" : signal.rsi > 65 ? " ↑ Overbought" : ""}
                </span>
              )}
              {signal.macdBull !== null && (
                <span className={signal.macdBull ? "text-green-400" : "text-red-400"}>
                  MACD {signal.macdBull ? "↑ Bullish" : "↓ Bearish"}
                </span>
              )}
              {signal.stochK !== null && (
                <span className={signal.stochK < 25 ? "text-green-400" : signal.stochK > 75 ? "text-red-400" : ""}>
                  Stoch {signal.stochK.toFixed(0)}{signal.stochK < 25 ? " ↓ Oversold" : signal.stochK > 75 ? " ↑ Overbought" : ""}
                </span>
              )}
              {signal.range52pct !== null && quote?.fiftyTwoWeekLow && quote?.fiftyTwoWeekHigh && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  52W
                  <span className="relative inline-block w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <span
                      className="absolute left-0 top-0 h-full bg-primary rounded-full"
                      style={{ width: `${signal.range52pct}%` }}
                    />
                  </span>
                  <span className="tabular-nums">{signal.range52pct.toFixed(0)}%</span>
                  <span className="text-[10px]">
                    (₹{quote.fiftyTwoWeekLow.toFixed(0)}–₹{quote.fiftyTwoWeekHigh.toFixed(0)})
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Content Area: chart + indicators split ── */}
        <div className="flex-1 min-h-0 flex flex-col">

          {/* Main candlestick chart — takes 45% of content area */}
          <div className="relative border-b border-border/50" style={{ flex: "0 0 45%", minHeight: 0 }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            )}
            {!loading && !error && candles.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <p className="text-sm text-muted-foreground">No data for this period/interval</p>
                <p className="text-xs text-muted-foreground/60">Try a different interval or period</p>
              </div>
            )}
            <div ref={chartContainerRef} className="w-full h-full" />
          </div>

          {/* Indicators section — takes 55% of content area */}
          <div className="flex flex-col" style={{ flex: "0 0 55%", minHeight: 0 }}>
            {/* Toggle bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0">
              <span className="text-xs text-muted-foreground">Indicators</span>
              {[
                { label: "RSI (14)", active: showRSI, toggle: () => setShowRSI((v) => !v) },
                { label: "MACD",     active: showMACD, toggle: () => setShowMACD((v) => !v) },
                { label: "Stoch",    active: showStoch, toggle: () => setShowStoch((v) => !v) },
              ].map((ind) => (
                <button
                  key={ind.label}
                  onClick={ind.toggle}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    ind.active
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {ind.label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground">Scroll ↓ for all</span>
            </div>

            {/* Scrollable indicator charts */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {indicatorData.length > 0 && (showRSI || showMACD || showStoch) ? (
                <>
                  {showRSI && (
                    <div className="px-2 pt-3 pb-1">
                      <div className="text-xs font-semibold text-muted-foreground pl-1 mb-1 flex items-center gap-2">
                        RSI (14)
                        {signal?.rsi !== null && signal?.rsi !== undefined && (
                          <span className={`text-xs font-bold ${(signal.rsi) < 35 ? "text-green-400" : (signal.rsi) > 65 ? "text-red-400" : "text-yellow-400"}`}>
                            {signal.rsi.toFixed(1)} {(signal.rsi) < 35 ? "— Oversold ✓" : (signal.rsi) > 65 ? "— Overbought ✗" : "— Neutral"}
                          </span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={indicatorData} margin={{ top: 4, right: 12, bottom: 4, left: -12 }}>
                          <XAxis dataKey="time" tickFormatter={(t) => formatTime(t as number, interval)} interval="preserveStartEnd" tick={tickStyle} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 100]} tick={tickStyle} tickLine={false} axisLine={false} width={36} ticks={[0, 30, 50, 70, 100]} />
                          <Tooltip formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(1) : "—")} labelFormatter={(t) => formatTime(Number(t), interval)} contentStyle={tooltipStyle} />
                          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 2" strokeOpacity={0.6} label={{ value: "OB", position: "right", fontSize: 9, fill: "#ef4444" }} />
                          <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 2" strokeOpacity={0.6} label={{ value: "OS", position: "right", fontSize: 9, fill: "#22c55e" }} />
                          <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" />
                          <Line type="monotone" dataKey="rsi" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {showMACD && (
                    <div className={`px-2 pt-3 pb-1 ${showRSI ? "border-t border-border/30" : ""}`}>
                      <div className="text-xs font-semibold text-muted-foreground pl-1 mb-1 flex items-center gap-2">
                        MACD (12,26,9)
                        {signal?.macdBull !== null && (
                          <span className={`text-xs font-bold ${signal?.macdBull ? "text-green-400" : "text-red-400"}`}>
                            {signal?.macdBull ? "↑ Bullish" : "↓ Bearish"}
                          </span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <ComposedChart data={indicatorData} margin={{ top: 4, right: 12, bottom: 4, left: -12 }}>
                          <XAxis dataKey="time" tickFormatter={(t) => formatTime(t as number, interval)} interval="preserveStartEnd" tick={tickStyle} tickLine={false} axisLine={false} />
                          <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={36} />
                          <Tooltip formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(3) : "—")} labelFormatter={(t) => formatTime(Number(t), interval)} contentStyle={tooltipStyle} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                          <Bar dataKey="macdHist" isAnimationActive={false}
                            fill="transparent"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            shape={(props: any) => {
                              const { x, y, width, height, value } = props;
                              const color = value >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)";
                              return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={color} />;
                            }}
                          />
                          <Line type="monotone" dataKey="macdLine" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="MACD" />
                          <Line type="monotone" dataKey="macdSig"  stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="Signal" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {showStoch && (
                    <div className={`px-2 pt-3 pb-1 ${showRSI || showMACD ? "border-t border-border/30" : ""}`}>
                      <div className="text-xs font-semibold text-muted-foreground pl-1 mb-1 flex items-center gap-2">
                        Stochastic (14,3)
                        {signal?.stochK !== null && signal?.stochK !== undefined && (
                          <span className={`text-xs font-bold ${(signal.stochK) < 25 ? "text-green-400" : (signal.stochK) > 75 ? "text-red-400" : "text-yellow-400"}`}>
                            %K {signal.stochK.toFixed(1)} {(signal.stochK) < 25 ? "— Oversold ✓" : (signal.stochK) > 75 ? "— Overbought ✗" : "— Neutral"}
                          </span>
                        )}
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={indicatorData} margin={{ top: 4, right: 12, bottom: 4, left: -12 }}>
                          <XAxis dataKey="time" tickFormatter={(t) => formatTime(t as number, interval)} interval="preserveStartEnd" tick={tickStyle} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 100]} tick={tickStyle} tickLine={false} axisLine={false} width={36} ticks={[0, 20, 50, 80, 100]} />
                          <Tooltip formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(1) : "—")} labelFormatter={(t) => formatTime(Number(t), interval)} contentStyle={tooltipStyle} />
                          <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 2" strokeOpacity={0.6} label={{ value: "OB", position: "right", fontSize: 9, fill: "#ef4444" }} />
                          <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 2" strokeOpacity={0.6} label={{ value: "OS", position: "right", fontSize: 9, fill: "#22c55e" }} />
                          <Line type="monotone" dataKey="stochK" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="%K" />
                          <Line type="monotone" dataKey="stochD" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="%D" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              ) : !loading && indicatorData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  Not enough data for indicators
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
