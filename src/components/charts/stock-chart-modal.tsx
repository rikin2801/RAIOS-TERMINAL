"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Newspaper, ExternalLink, BrainCircuit, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Phase1AnalysisResult } from "@/types";
import type { NewsItem } from "@/app/api/market/news/route";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
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
export type ChartInterval = "1m" | "30m" | "1h" | "1d" | "1wk";

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
  { label: "1W",  value: "1wk", validPeriods: ["1M", "3M", "1Y", "5Y"] },
];

const DEFAULT_INTERVAL: Record<ChartPeriod, ChartInterval> = {
  "1D": "30m", "5D": "30m", "1W": "1h",
  "1M": "1d", "3M": "1d", "1Y": "1d", "5Y": "1wk",
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

// ── Bollinger Bands ───────────────────────────────────────────────────────────

function calcBollingerBands(candles: Candle[], period = 20): { time: number; upper: number; middle: number; lower: number }[] {
  const result: { time: number; upper: number; middle: number; lower: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, c) => a + c.close, 0) / period;
    const variance = slice.reduce((a, c) => a + (c.close - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    result.push({ time: candles[i].time, upper: mean + 2 * std, middle: mean, lower: mean - 2 * std });
  }
  return result;
}

// ── Technical Signal Computation ──────────────────────────────────────────────

type SignalVerdict = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";

function computeSignal(indData: IndicatorRow[], quote: QuoteInfo | null): {
  verdict: SignalVerdict;
  rsi: number | null;
  stochK: number | null;
  macdHist: number | null;
  macdBull: boolean | null;
  macdDir: "RISING" | "FALLING" | null;
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
  // MACD direction: is histogram growing or shrinking?
  let macdDir: "RISING" | "FALLING" | null = null;
  if (hist !== null && prevHist !== null) {
    macdDir = hist >= prevHist ? "RISING" : "FALLING";
    // Bonus: MACD crossover is stronger signal
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

  return { verdict, rsi, stochK, macdHist: hist, macdBull, macdDir, range52pct };
}

function formatTime(unix: number, interval: ChartInterval): string {
  const d = new Date(unix * 1000);
  if (interval === "1m" || interval === "30m" || interval === "1h") {
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  if (interval === "1wk") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Phase 1 Card ──────────────────────────────────────────────────────────────

function Phase1Card({
  data,
  trendColor,
  trendBg,
  healthColor,
  attractColor,
  phase1DecisionColor,
}: {
  data: Phase1AnalysisResult;
  trendColor: (t: string) => string;
  trendBg: (t: string) => string;
  healthColor: (h: string) => string;
  attractColor: (a: string) => string;
  phase1DecisionColor: Record<string, string>;
}) {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const fmtRange = (r: { low: number; high: number }) => `${fmt(r.low)}–${fmt(r.high)}`;

  const trendPeriods = [
    { label: "1Y", val: data.trend.oneYear },
    { label: "6M", val: data.trend.sixMonths },
    { label: "3M", val: data.trend.threeMonths },
    { label: "1M", val: data.trend.oneMonth },
  ] as const;

  const consensusLabel: Record<string, string> = {
    strong_buy: "STRONG BUY", buy: "BUY", hold: "HOLD", sell: "SELL", strong_sell: "STRONG SELL",
  };

  const TrendIcon = ({ t }: { t: string }) =>
    t === "UPTREND" ? <TrendingUp className="h-3 w-3" /> :
    t === "DOWNTREND" ? <TrendingDown className="h-3 w-3" /> :
    <Minus className="h-3 w-3" />;

  return (
    <div className="space-y-3 text-sm">

      {/* ── Decision header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-sm font-bold px-3 py-1.5 rounded border ${phase1DecisionColor[data.decision] ?? ""}`}>
          {data.decision.replace("_", " ")}
        </span>
        <span className="text-xs text-muted-foreground">{data.name} · {data.symbol}</span>
        {data.pe && <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">P/E {data.pe.toFixed(1)}</span>}
      </div>

      {/* ── Trend structure ── */}
      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Trend Structure (HH/HL)</p>
        <div className="flex gap-1.5 flex-wrap">
          {trendPeriods.map(({ label, val }) => (
            <span key={label} className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${trendBg(val.trend)} ${trendColor(val.trend)}`}>
              <TrendIcon t={val.trend} />
              {label} {val.trend === "UPTREND" ? "↑" : val.trend === "DOWNTREND" ? "↓" : "→"}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{data.trend.oneYear.evidence}</p>
      </div>

      {/* ── 3-pillar row: Business | Price | What Changed ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Business</p>
          <p className={`text-xs font-bold ${healthColor(data.businessHealth)}`}>{data.businessHealth}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{data.businessSummary}</p>
        </div>
        <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Price</p>
          <p className={`text-xs font-bold ${attractColor(data.priceAttractiveness)}`}>
            {data.priceAttractiveness.replace("_", " ")}
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{data.priceSummary}</p>
        </div>
        <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What Changed</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-4">{data.whatChanged}</p>
        </div>
      </div>

      {/* ── Entry zone + Analyst row ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Entry Zone</p>
          <p className="text-xs font-mono font-semibold text-foreground">{fmtRange(data.entryZone)}</p>
          <p className="text-[10px] text-muted-foreground">Confirmation above {fmt(data.confirmationLevel)}</p>
          <div className="text-[10px] text-muted-foreground/70">
            S: {fmt(data.support)} · R: {fmt(data.resistance)}
          </div>
        </div>
        {data.analystTarget && (
          <div className="rounded-lg border border-border/50 p-2.5 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Analyst Consensus</p>
            {data.analystConsensus && (
              <p className="text-xs font-bold text-green-400">{consensusLabel[data.analystConsensus] ?? data.analystConsensus.toUpperCase()}</p>
            )}
            <p className="text-xs font-mono text-foreground">Avg target {fmt(data.analystTarget)}</p>
            {data.analystCount && <p className="text-[10px] text-muted-foreground">{data.analystCount} analysts</p>}
          </div>
        )}
      </div>

      {/* ── Target ranges ── */}
      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Price Targets</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "1M", range: data.targets.oneMonth },
            { label: "3M", range: data.targets.threeMonths },
            { label: "6M", range: data.targets.sixMonths },
            { label: "1Y", range: data.targets.oneYear },
          ].map(({ label, range }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
              <p className="text-[10px] font-mono text-foreground mt-0.5">{fmt(range.low)}</p>
              <p className="text-[10px] text-muted-foreground">–</p>
              <p className="text-[10px] font-mono text-foreground">{fmt(range.high)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Why decision ── */}
      <div className="rounded-lg border border-border/50 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Why {data.decision.replace("_", " ")}?</p>
        <ol className="space-y-1">
          {data.whyDecision.map((reason, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-foreground/90 leading-relaxed">
              <span className="text-muted-foreground shrink-0 tabular-nums">{i + 1}.</span>
              <span>{reason}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── What would change ── */}
      <div className="rounded-lg border border-border/50 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">What Would Change This?</p>
        <ul className="space-y-1">
          {data.whatWouldChange.map((cond, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
              <span className="text-yellow-500/70 shrink-0">•</span>
              <span>{cond}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Supporting technical context ── */}
      <div className="rounded-lg border border-dashed border-border/40 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Supporting Technical Context <span className="normal-case font-normal">(not decision drivers)</span>
        </p>
        {(["weekly", "daily", "hourly"] as const).map((tf) => {
          const d = tf === "weekly" ? data.weekly : tf === "daily" ? data.daily : data.hourly;
          if (!d) return null;
          const label = tf === "weekly" ? "Weekly" : tf === "daily" ? "Daily" : "Hourly";
          return (
            <div key={tf} className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="col-span-2 text-[10px] text-muted-foreground/60 mb-0.5">{label}</div>
              <span className="text-muted-foreground">RSI <span className={`font-mono font-semibold ${d.rsi > 70 ? "text-red-400" : d.rsi < 30 ? "text-green-400" : "text-foreground"}`}>{d.rsi.toFixed(0)}</span></span>
              <span className="text-muted-foreground">
                MACD{" "}
                <span className={`font-semibold ${d.macdBullish ? "text-green-400" : "text-red-400"}`}>
                  {d.macdBullish ? "↑" : "↓"} {d.macdHist.toFixed(2)}
                </span>
                {" "}
                <span className={`text-[10px] ${d.macdDir === "RISING" ? "text-green-400/70" : "text-orange-400/70"}`}>
                  {d.macdDir === "RISING" ? "▲Rising" : "▼Falling"}
                </span>
              </span>
              <span className="text-muted-foreground">Stoch <span className={`font-mono font-semibold ${d.stochK > 80 ? "text-red-400" : d.stochK < 20 ? "text-green-400" : "text-foreground"}`}>{d.stochK.toFixed(0)}</span></span>
            </div>
          );
        })}
      </div>

    </div>
  );
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
  const [showBB, setShowBB] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [dailyCandles, setDailyCandles] = useState<Candle[]>([]);

  const [showAI, setShowAI] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<Phase1AnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiFetched = useRef(false);

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
      const [res, dailyRes] = await Promise.all([
        fetch(`/api/market/${symbol}?include=chart&period=${period}&interval=${interval}&exchange=${exchange}`),
        fetch(`/api/market/${symbol}?include=chart&period=1Y&interval=1d&exchange=${exchange}`),
      ]);
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
      if (dailyRes.ok) {
        const dailyData = await dailyRes.json();
        setDailyCandles(dailyData.candles ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, [symbol, exchange, period, interval]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch news once per symbol (cached 15 min server-side)
  useEffect(() => {
    let cancelled = false;
    setNewsLoading(true);
    fetch(`/api/market/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name ?? symbol)}`)
      .then((r) => r.json())
      .then((data: NewsItem[]) => { if (!cancelled) setNewsItems(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, name]);

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

    // DMA: use 1Y daily closes when available so the calculation is always
    // based on real daily closing prices, regardless of the current interval.
    // For daily-interval charts with enough candles we use those directly.
    const dmaSource =
      interval === "1d" && candles.length >= 200
        ? candles
        : dailyCandles.length >= 50
        ? dailyCandles
        : candles;
    const dmaCloses = dmaSource.map((c) => c.close);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dmaTimes = dmaSource.map((c) => c.time as any);
    const makeDailySMA = (p: number) =>
      Array.from({ length: dmaCloses.length - p + 1 }, (_, i) => ({
        time: dmaTimes[i + p - 1],
        value: dmaCloses.slice(i, i + p).reduce((a, b) => a + b, 0) / p,
      }));
    const firstTime = candles[0]?.time ?? 0;

    if (interval === "1d") {
      // Trend lines for daily charts, trimmed to the visible date range
      if (dmaCloses.length >= 50) {
        const dma50 = chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        dma50.setData(makeDailySMA(50).filter((p) => (p.time as number) >= firstTime));
      }
      if (dmaCloses.length >= 200) {
        const dma200 = chart.addSeries(LineSeries, { color: "#f97316", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        dma200.setData(makeDailySMA(200).filter((p) => (p.time as number) >= firstTime));
      }
    } else {
      // Intraday: show current DMA level as horizontal reference lines
      if (dmaCloses.length >= 50) {
        const val50 = dmaCloses.slice(-50).reduce((a, b) => a + b, 0) / 50;
        candleSeries.createPriceLine({ price: val50, color: "#38bdf8", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "50 DMA" });
      }
      if (dmaCloses.length >= 200) {
        const val200 = dmaCloses.slice(-200).reduce((a, b) => a + b, 0) / 200;
        candleSeries.createPriceLine({ price: val200, color: "#f97316", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "200 DMA" });
      }
    }

    // ── Bollinger Bands (on main price chart) ─────────────────────────────────
    if (showBB && candles.length >= 20) {
      const bbData = calcBollingerBands(candles);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bbUpper = chart.addSeries(LineSeries, { color: "rgba(147,51,234,0.7)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      bbUpper.setData(bbData.map((b) => ({ time: b.time as any, value: b.upper })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bbMiddle = chart.addSeries(LineSeries, { color: "rgba(147,51,234,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
      bbMiddle.setData(bbData.map((b) => ({ time: b.time as any, value: b.middle })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bbLower = chart.addSeries(LineSeries, { color: "rgba(147,51,234,0.7)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      bbLower.setData(bbData.map((b) => ({ time: b.time as any, value: b.lower })));
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
  }, [candles, dailyCandles, interval, showBB]);

  const handlePeriodChange = (p: ChartPeriod) => {
    setPeriod(p);
    const validForPeriod = INTERVALS.filter((opt) => opt.validPeriods.includes(p));
    if (!validForPeriod.find((opt) => opt.value === interval)) {
      setInterval(DEFAULT_INTERVAL[p]);
    }
  };

  const fetchAIAnalysis = useCallback(async () => {
    if (aiFetched.current) return;
    aiFetched.current = true;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/analysis/${symbol}?exchange=${exchange}`);
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      if (data.phase1) setAiAnalysis(data.phase1 as Phase1AnalysisResult);
      else throw new Error("No Phase 1 data");
    } catch {
      setAiError("Could not load AI analysis. Try again.");
    } finally {
      setAiLoading(false);
    }
  }, [symbol, exchange]);

  useEffect(() => {
    if (showAI && !aiFetched.current) fetchAIAnalysis();
  }, [showAI, fetchAIAnalysis]);

  // For daily interval use 1Y daily candles as indicator source so MACD always
  // has enough bars (1M only gives ~22 daily bars, too few for MACD's 35-bar need).
  const indicatorSource =
    interval === "1d" && dailyCandles.length >= 35 ? dailyCandles : candles;
  const rawIndicatorData = indicatorSource.length > 0 ? buildIndicatorData(indicatorSource) : [];
  // Trim to the visible period range when using extended source
  const firstCandleTime = candles[0]?.time ?? 0;
  const indicatorData =
    indicatorSource === dailyCandles && firstCandleTime > 0
      ? rawIndicatorData.filter((d) => d.time >= firstCandleTime)
      : rawIndicatorData;
  const signal = indicatorData.length > 0 ? computeSignal(indicatorData, quote) : null;
  const changeColor = (quote?.changePercent ?? 0) >= 0 ? "#22c55e" : "#ef4444";

  const verdictColor: Record<SignalVerdict, string> = {
    "STRONG BUY":  "bg-green-500 text-white",
    "BUY":         "bg-green-700 text-green-100",
    "HOLD":        "bg-yellow-600 text-yellow-100",
    "SELL":        "bg-red-700 text-red-100",
    "STRONG SELL": "bg-red-500 text-white",
  };

  const phase1DecisionColor: Record<string, string> = {
    BUY:          "bg-green-500/15 text-green-400 border-green-500/30",
    WAIT:         "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    HOLD:         "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    BOOK_PROFITS: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    SELL:         "bg-red-500/15 text-red-400 border-red-500/30",
  };

  const trendColor = (t: string) =>
    t === "UPTREND" ? "text-green-400" : t === "DOWNTREND" ? "text-red-400" : "text-yellow-400";
  const trendBg = (t: string) =>
    t === "UPTREND" ? "bg-green-500/10 border-green-500/20" : t === "DOWNTREND" ? "bg-red-500/10 border-red-500/20" : "bg-yellow-500/10 border-yellow-500/20";
  const healthColor = (h: string) =>
    h === "STRONG" ? "text-green-400" : h === "WEAK" ? "text-red-400" : "text-blue-400";
  const attractColor = (a: string) =>
    a === "ATTRACTIVE" ? "text-green-400" : a === "EXPENSIVE" ? "text-red-400" : "text-yellow-400";

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
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded bg-sky-400" /> 50 DMA</span>
            <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded bg-orange-500" /> 200 DMA</span>
            {showBB && <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded bg-purple-500" /> BB (20)</span>}
          </div>
        </div>

        {/* ── Signal / AI Banner ── */}
        {!loading && (signal || aiAnalysis) && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-card/50 flex-wrap">
            {/* Phase 1 badge when AI loaded */}
            {aiAnalysis ? (
              <span className={`text-xs font-bold px-2.5 py-1 rounded border ${phase1DecisionColor[aiAnalysis.decision] ?? ""}`}>
                {aiAnalysis.decision.replace("_", " ")}
              </span>
            ) : null}
            {/* Technical context numbers — always shown as plain values */}
            {signal && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {signal.rsi !== null && <span>RSI {signal.rsi.toFixed(0)}</span>}
                {signal.macdBull !== null && (
                  <span className={signal.macdBull ? "text-green-400/70" : "text-red-400/70"}>
                    MACD {signal.macdBull ? "↑+" : "↓−"}
                    {signal.macdDir && (
                      <span className={signal.macdDir === "RISING" ? "text-green-400/60" : "text-orange-400/60"}>
                        {" "}{signal.macdDir === "RISING" ? "▲Upward" : "▼Downward"}
                      </span>
                    )}
                  </span>
                )}
                {signal.stochK !== null && <span>Stoch {signal.stochK.toFixed(0)}</span>}
                {signal.range52pct !== null && quote?.fiftyTwoWeekLow && quote?.fiftyTwoWeekHigh && (
                  <span className="flex items-center gap-1.5">
                    52W
                    <span className="relative inline-block w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <span className="absolute left-0 top-0 h-full bg-primary rounded-full" style={{ width: `${signal.range52pct}%` }} />
                    </span>
                    <span className="tabular-nums">{signal.range52pct.toFixed(0)}%</span>
                    <span className="text-[10px]">(₹{quote.fiftyTwoWeekLow.toFixed(0)}–₹{quote.fiftyTwoWeekHigh.toFixed(0)})</span>
                  </span>
                )}
              </div>
            )}
            {!aiAnalysis && (
              <button
                onClick={() => { setShowAI(true); setShowRSI(false); setShowMACD(false); setShowStoch(false); setShowNews(false); }}
                className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <BrainCircuit className="h-3 w-3" />
                AI Analysis
              </button>
            )}
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
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0 flex-wrap">
              <span className="text-xs text-muted-foreground">Indicators</span>
              {[
                { label: "RSI (14)", active: showRSI && !showNews && !showAI,  toggle: () => { setShowNews(false); setShowAI(false); setShowRSI((v) => !v); } },
                { label: "MACD",     active: showMACD && !showNews && !showAI,  toggle: () => { setShowNews(false); setShowAI(false); setShowMACD((v) => !v); } },
                { label: "Stoch",    active: showStoch && !showNews && !showAI, toggle: () => { setShowNews(false); setShowAI(false); setShowStoch((v) => !v); } },
                { label: "BB (20)",  active: showBB,                            toggle: () => setShowBB((v) => !v) },
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
              <div className="w-px h-4 bg-border mx-1" />
              <button
                onClick={() => setShowNews((v) => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                  showNews
                    ? "border-amber-500 text-amber-400 bg-amber-500/10"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <Newspaper className="h-3 w-3" />
                News
                {newsItems.length > 0 && (
                  <span className="ml-0.5 bg-amber-500/20 text-amber-400 text-[10px] px-1 rounded-full">
                    {newsItems.length}
                  </span>
                )}
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button
                onClick={() => {
                  const next = !showAI;
                  setShowAI(next);
                  if (next) { setShowNews(false); setShowRSI(false); setShowMACD(false); setShowStoch(false); }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded border transition-colors ${
                  showAI
                    ? "border-violet-500 text-violet-400 bg-violet-500/10"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <BrainCircuit className="h-3 w-3" />
                AI Analysis
                {aiAnalysis && <span className="ml-0.5 text-[10px]">✓</span>}
              </button>
              {!showNews && !showAI && <span className="ml-auto text-[10px] text-muted-foreground">Scroll ↓ for all</span>}
            </div>

            {/* Scrollable indicator charts / news */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* ── AI Analysis Panel ── */}
              {showAI && (
                <div className="px-4 py-3">
                  {aiLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Running Phase 1 Analysis</p>
                        <p className="text-xs mt-0.5">Trend · Business · Price · News</p>
                      </div>
                    </div>
                  )}
                  {aiError && !aiLoading && (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                      <p className="text-sm">{aiError}</p>
                      <button onClick={() => { aiFetched.current = false; fetchAIAnalysis(); }} className="text-xs text-primary hover:underline">Retry</button>
                    </div>
                  )}
                  {aiAnalysis && !aiLoading && <Phase1Card data={aiAnalysis} trendColor={trendColor} trendBg={trendBg} healthColor={healthColor} attractColor={attractColor} phase1DecisionColor={phase1DecisionColor} />}
                </div>
              )}

              {/* ── News Panel ── */}
              {showNews && (
                <div className="px-4 py-3 space-y-2">
                  {newsLoading && newsItems.length === 0 ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading news…</span>
                    </div>
                  ) : newsItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Newspaper className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No recent news found</p>
                    </div>
                  ) : (
                    newsItems.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-2.5 rounded-lg border border-border/50 hover:border-border hover:bg-accent/40 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[140px]">
                              {item.source}
                            </span>
                            {item.ago && (
                              <span className="text-[10px] text-muted-foreground/60">{item.ago}</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                      </a>
                    ))
                  )}
                </div>
              )}

              {/* ── Indicator Charts ── */}
              {!showNews && !showAI && indicatorData.length > 0 && (showRSI || showMACD || showStoch) ? (
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
                            {signal?.macdBull ? "↑ Positive" : "↓ Negative"}
                          </span>
                        )}
                        {signal?.macdDir && (
                          <span className={`text-xs font-semibold ${signal.macdDir === "RISING" ? "text-green-400/70" : "text-orange-400/70"}`}>
                            {signal.macdDir === "RISING" ? "▲ Momentum Upward" : "▼ Momentum Downward"}
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
              ) : !showNews && !showAI && !loading && indicatorData.length === 0 ? (
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
