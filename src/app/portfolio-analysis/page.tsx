"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/utils";
import type { Holding, HoldingWithMarket } from "@/types";
import { TrendingUp, TrendingDown, PieChart as PieIcon, BarChart2, Shield } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b",
];

function DiversificationScore({ holdings }: { holdings: HoldingWithMarket[] }) {
  if (holdings.length === 0) return null;
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const sectors = new Set(holdings.map((h) => h.sector ?? "Other")).size;
  const stocks = holdings.length;
  const topConcentration = totalValue > 0
    ? (Math.max(...holdings.map((h) => h.currentValue)) / totalValue) * 100
    : 100;

  let score = 50;
  score += Math.min(sectors * 5, 25);
  score += Math.min(stocks * 2, 20);
  score -= topConcentration > 50 ? 20 : topConcentration > 30 ? 10 : 0;
  score = Math.min(Math.max(Math.round(score), 0), 100);

  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#eab308" : "#ef4444";
  const label = score >= 70 ? "Well Diversified" : score >= 40 ? "Moderate" : "Concentrated";

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-semibold mb-4 flex items-center gap-2">
        <Shield className="h-4 w-4" /> Diversification Score
      </h2>
      <div className="flex items-center gap-6">
        <div className="relative h-24 w-24">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
            <circle cx="48" cy="48" r="40" fill="none" stroke={color} strokeWidth="8"
              strokeDasharray={`${(score / 100) * 251.3} 251.3`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold" style={{ color }}>{score}</span>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold" style={{ color }}>{label}</p>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{stocks} stocks · {sectors} sectors</p>
            <p>Top holding: {topConcentration.toFixed(1)}% of portfolio</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioAnalysisPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/holdings");
    const data = await res.json();
    setHoldings(data);
    setLoading(false);
  }, []);

  const fetchQuotes = useCallback(async (hs: Holding[]) => {
    const results = await Promise.allSettled(
      hs.map((h) => fetch(`/api/market/${h.symbol}?exchange=${h.exchange ?? "NSE"}`).then((r) => r.json()))
    );
    const map: typeof quotes = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.price) {
        map[hs[i].symbol] = { price: r.value.price, change: r.value.change, changePercent: r.value.changePercent };
      }
    });
    setQuotes(map);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (holdings.length > 0) fetchQuotes(holdings); }, [holdings, fetchQuotes]);

  const enriched: HoldingWithMarket[] = holdings.map((h) => {
    const q = quotes[h.symbol];
    const currentPrice = q?.price ?? h.avgCost;
    const currentValue = currentPrice * h.shares;
    const totalCost = h.avgCost * h.shares;
    const gainLoss = currentValue - totalCost;
    const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
    return { ...h, currentPrice, currentValue, totalCost, gainLoss, gainLossPercent, dayChange: 0, dayChangePercent: q?.changePercent ?? 0 };
  });

  const totalValue = enriched.reduce((s, h) => s + h.currentValue, 0);

  // Sector data
  const sectorMap: Record<string, number> = {};
  enriched.forEach((h) => {
    const s = h.sector ?? "Other";
    sectorMap[s] = (sectorMap[s] ?? 0) + h.currentValue;
  });
  const sectorData = Object.entries(sectorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name, value,
      pct: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0",
      color: COLORS[i % COLORS.length],
    }));

  // Stock allocation
  const stockData = [...enriched]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 10)
    .map((h, i) => ({
      name: h.symbol,
      value: h.currentValue,
      pct: totalValue > 0 ? ((h.currentValue / totalValue) * 100).toFixed(1) : "0",
      color: COLORS[i % COLORS.length],
    }));

  // Performance bars
  const performanceData = [...enriched]
    .sort((a, b) => b.gainLossPercent - a.gainLossPercent)
    .slice(0, 10)
    .map((h) => ({
      symbol: h.symbol,
      gain: parseFloat(h.gainLossPercent.toFixed(2)),
    }));

  const best = enriched.length > 0 ? [...enriched].sort((a, b) => b.gainLossPercent - a.gainLossPercent)[0] : null;
  const worst = enriched.length > 0 ? [...enriched].sort((a, b) => a.gainLossPercent - b.gainLossPercent)[0] : null;

  if (loading) return <div className="p-6 text-muted-foreground">Loading analysis...</div>;

  if (enriched.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Portfolio Analysis</h1>
        <p className="text-muted-foreground">Add holdings to your portfolio to see analysis.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio Analysis</h1>
        <p className="text-sm text-muted-foreground">Deep-dive into allocation, risk, and performance</p>
      </div>

      {/* Diversification Score */}
      <DiversificationScore holdings={enriched} />

      {/* Best / Worst */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {best && (
          <div className="rounded-lg border border-green-500/30 bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 gain" /> Best Performer
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono font-bold text-primary text-lg">{best.symbol}</p>
                <p className="text-xs text-muted-foreground">{best.name}</p>
              </div>
              <div className="text-right">
                <p className="gain font-semibold">{formatPercent(best.gainLossPercent)}</p>
                <p className="text-sm">{formatCurrencyCompact(best.gainLoss)}</p>
              </div>
            </div>
          </div>
        )}
        {worst && (
          <div className="rounded-lg border border-red-500/30 bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3 loss" /> Worst Performer
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono font-bold text-primary text-lg">{worst.symbol}</p>
                <p className="text-xs text-muted-foreground">{worst.name}</p>
              </div>
              <div className="text-right">
                <p className="loss font-semibold">{formatPercent(worst.gainLossPercent)}</p>
                <p className="text-sm">{formatCurrencyCompact(worst.gainLoss)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <PieIcon className="h-4 w-4" /> Sector Allocation
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sectorData} cx="50%" cy="50%" outerRadius={90} paddingAngle={2} dataKey="value">
                {sectorData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v: unknown) => formatCurrencyCompact(v as number)} />
              <Legend formatter={(v) => {
                const s = sectorData.find((d) => d.name === v);
                return `${v} (${s?.pct}%)`;
              }} iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4" /> Stock Allocation
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stockData} cx="50%" cy="50%" outerRadius={90} paddingAngle={2} dataKey="value">
                {stockData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v: unknown) => formatCurrencyCompact(v as number)} />
              <Legend formatter={(v) => {
                const s = stockData.find((d) => d.name === v);
                return `${v} (${s?.pct}%)`;
              }} iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Bar */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold mb-3">Performance Ranking</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={performanceData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="symbol" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, "Gain/Loss"]} />
            <Bar dataKey="gain" radius={[3, 3, 0, 0]}>
              {performanceData.map((entry, i) => (
                <Cell key={i} fill={entry.gain >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold">Holdings Detail</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Sector</th>
                <th className="text-right">Value</th>
                <th className="text-right">Weight</th>
                <th className="text-right">Avg Cost</th>
                <th className="text-right">Current</th>
                <th className="text-right">G/L</th>
                <th className="text-right">G/L %</th>
              </tr>
            </thead>
            <tbody>
              {[...enriched].sort((a, b) => b.currentValue - a.currentValue).map((h) => (
                <tr key={h.id}>
                  <td>
                    <p className="font-mono font-semibold text-primary">{h.symbol}</p>
                    <p className="text-xs text-muted-foreground">{h.exchange ?? "NSE"}</p>
                  </td>
                  <td className="text-muted-foreground text-sm">{h.sector ?? "—"}</td>
                  <td className="text-right">{formatCurrencyCompact(h.currentValue)}</td>
                  <td className="text-right text-sm">
                    {totalValue > 0 ? ((h.currentValue / totalValue) * 100).toFixed(1) : "0"}%
                  </td>
                  <td className="text-right">{formatCurrency(h.avgCost)}</td>
                  <td className="text-right font-mono">{formatCurrency(h.currentPrice)}</td>
                  <td className={`text-right ${h.gainLoss >= 0 ? "gain" : "loss"}`}>
                    {formatCurrencyCompact(h.gainLoss)}
                  </td>
                  <td className={`text-right ${h.gainLossPercent >= 0 ? "gain" : "loss"}`}>
                    {formatPercent(h.gainLossPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
