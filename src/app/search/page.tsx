"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { POPULAR_INDIAN_STOCKS } from "@/lib/india";
import { StockChartModal } from "@/components/charts/stock-chart-modal";
import { Search, TrendingUp, TrendingDown } from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  price?: number;
  changePercent?: number;
  sector?: string;
  exchange: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [chartStock, setChartStock] = useState<{ symbol: string; exchange: string; name?: string } | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setSearched(true);

    const matches = POPULAR_INDIAN_STOCKS.filter(
      (s) =>
        s.symbol.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q)
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
      } catch {
        setResults([]);
      }
      setLoading(false);
      return;
    }

    const quotes = await Promise.allSettled(
      matches.map((m) => fetch(`/api/market/${m.symbol}?exchange=NSE`).then((r) => r.json()))
    );

    const enriched: SearchResult[] = matches.map((m, i) => {
      const r = quotes[i];
      const q2 = r.status === "fulfilled" ? r.value : null;
      return {
        symbol: m.symbol,
        name: m.name,
        sector: m.sector,
        exchange: "NSE",
        price: q2?.price,
        changePercent: q2?.changePercent,
      };
    });

    setResults(enriched);
    setLoading(false);
  }, [query]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Search</h1>
        <p className="text-sm text-muted-foreground">Search by symbol, company name, or sector — click any result to view chart & signals</p>
      </div>

      <div className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="RELIANCE, Tata, IT, Banking..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
            {["IT", "Banking", "Energy", "Pharma", "FMCG", "Auto", "Finance", "Telecom"].map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); }}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-4 mb-3">Popular stocks — click to view chart</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_INDIAN_STOCKS.slice(0, 16).map((s) => (
              <button
                key={s.symbol}
                onClick={() => setChartStock({ symbol: s.symbol, exchange: "NSE", name: s.name })}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent hover:border-primary transition-colors font-mono"
              >
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && (
        <div>
          {results.length === 0 && !loading ? (
            <p className="text-muted-foreground">No results found for &quot;{query}&quot;.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => setChartStock({ symbol: r.symbol, exchange: r.exchange, name: r.name })}
                  className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-bold text-primary">{r.symbol}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{r.name}</p>
                      {r.sector && (
                        <Badge variant="outline" className="text-xs mt-2">{r.sector}</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      {r.price != null ? (
                        <>
                          <p className="font-mono font-semibold">{formatCurrency(r.price)}</p>
                          {r.changePercent != null && (
                            <p className={`text-sm flex items-center gap-0.5 justify-end ${r.changePercent >= 0 ? "gain" : "loss"}`}>
                              {r.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatPercent(r.changePercent)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Loading...</p>
                      )}
                      <Badge variant="outline" className="text-xs mt-1">{r.exchange}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
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
