"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { POPULAR_INDIAN_STOCKS } from "@/lib/india";
import { StockChartModal } from "@/components/charts/stock-chart-modal";
import { Phase1CardBody, DEC } from "@/app/ai-analysis/page";
import type { Phase1AnalysisResult } from "@/types";
import { Search, TrendingUp, TrendingDown, BrainCircuit, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  price?: number;
  changePercent?: number;
  sector?: string;
  exchange: string;
}

interface Phase1State {
  status: "idle" | "loading" | "done" | "error";
  data?: Phase1AnalysisResult;
  error?: string;
}

// ── Single search result row ──────────────────────────────────────────────────

function ResultRow({
  r,
  onChart,
}: {
  r: SearchResult;
  onChart: () => void;
}) {
  const [open, setOpen]         = useState(false);
  const [p1, setP1]             = useState<Phase1State>({ status: "idle" });

  const fetchP1 = useCallback(async () => {
    if (p1.status === "loading" || p1.status === "done") return;
    setP1({ status: "loading" });
    try {
      const res  = await fetch(`/api/analysis/${r.symbol}?exchange=${r.exchange}`);
      const data = await res.json();
      if (data.phase1) {
        setP1({ status: "done", data: data.phase1 });
      } else {
        setP1({ status: "error", error: data.error || "No Phase 1 data" });
      }
    } catch {
      setP1({ status: "error", error: "Network error" });
    }
  }, [p1.status, r.symbol, r.exchange]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchP1();
  };

  const d = p1.data ? (DEC[p1.data.decision] ?? DEC.HOLD) : null;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden transition-colors ${d ? d.border : "border-border"}`}>
      {/* Summary row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Stock name — BIG, CAPS, BOLD */}
        <button onClick={handleToggle} className="flex-1 flex items-center gap-4 text-left min-w-0">
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black uppercase tracking-tight text-foreground leading-none">{r.symbol}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.name}</p>
            {r.sector && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{r.sector}</p>}
          </div>
        </button>

        {/* Price */}
        <div className="text-right shrink-0">
          {r.price != null ? (
            <>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(r.price)}</p>
              {r.changePercent != null && (
                <p className={`text-xs flex items-center gap-0.5 justify-end font-semibold ${r.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(r.changePercent)}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
        </div>

        {/* Decision badge (once loaded) */}
        {d && p1.data && (
          <span className={`shrink-0 text-sm font-black px-3 py-1.5 rounded ${d.summaryBadge}`}>{d.label}</span>
        )}
        {p1.status === "loading" && (
          <span className="shrink-0 text-[11px] text-muted-foreground animate-pulse px-3 py-1.5 rounded border border-border">Analysing…</span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggle}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-semibold"
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            {open ? "Collapse" : "Phase 1"}
          </button>
          <button
            onClick={onChart}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Chart
          </button>
        </div>
      </div>

      {/* Expanded Phase1CardBody */}
      {open && p1.status === "done" && p1.data && (
        <Phase1CardBody data={p1.data} holding={{ exchange: r.exchange, sector: r.sector }} />
      )}
      {open && p1.status === "loading" && (
        <div className="px-5 py-6 border-t border-border flex items-center gap-2 text-muted-foreground">
          <BrainCircuit className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Running Phase 1 Analysis for {r.symbol}…</span>
        </div>
      )}
      {open && p1.status === "error" && (
        <div className="px-5 py-4 border-t border-border text-sm text-red-400">{p1.error}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [chartStock, setChartStock] = useState<{ symbol: string; exchange: string; name?: string } | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setSearched(true);

    const matches = POPULAR_INDIAN_STOCKS.filter(
      s => s.symbol.includes(q) || s.name.toUpperCase().includes(q) || s.sector.toUpperCase().includes(q)
    ).slice(0, 12);

    if (matches.length === 0) {
      try {
        const res = await fetch(`/api/market/${q}?exchange=NSE`);
        if (res.ok) {
          const data = await res.json();
          setResults([{ symbol: data.symbol, name: data.name, price: data.price, changePercent: data.changePercent, exchange: "NSE" }]);
        } else {
          setResults([]);
        }
      } catch { setResults([]); }
      setLoading(false);
      return;
    }

    const quotes = await Promise.allSettled(
      matches.map(m => fetch(`/api/market/${m.symbol}?exchange=NSE`).then(r => r.json()))
    );

    setResults(matches.map((m, i) => {
      const r = quotes[i];
      const q2 = r.status === "fulfilled" ? r.value : null;
      return { symbol: m.symbol, name: m.name, sector: m.sector, exchange: "NSE", price: q2?.price, changePercent: q2?.changePercent };
    }));
    setLoading(false);
  }, [query]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Search</h1>
        <p className="text-sm text-muted-foreground">Search any stock — click <strong className="text-primary">Phase 1</strong> on any result to run the AI Decision Engine</p>
      </div>

      <div className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="RELIANCE, Tata, IT, Banking..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {!searched && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">Popular sectors</p>
          <div className="flex flex-wrap gap-2">
            {["IT", "Banking", "Energy", "Pharma", "FMCG", "Auto", "Finance", "Telecom"].map(s => (
              <button key={s} onClick={() => setQuery(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors">
                {s}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-4 mb-3">Popular stocks — click Phase 1 for AI analysis</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_INDIAN_STOCKS.slice(0, 16).map(s => (
              <button key={s.symbol}
                onClick={() => setChartStock({ symbol: s.symbol, exchange: "NSE", name: s.name })}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent hover:border-primary transition-colors font-mono">
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && (
        <div className="space-y-3">
          {results.length === 0 && !loading ? (
            <p className="text-muted-foreground">No results found for &quot;{query}&quot;.</p>
          ) : (
            results.map(r => (
              <ResultRow
                key={r.symbol}
                r={r}
                onChart={() => setChartStock({ symbol: r.symbol, exchange: r.exchange, name: r.name })}
              />
            ))
          )}
        </div>
      )}

      {chartStock && (
        <StockChartModal
          symbol={chartStock.symbol}
          exchange={chartStock.exchange}
          name={chartStock.name}
          onClose={() => setChartStock(null)}
        />
      )}
    </div>
  );
}
