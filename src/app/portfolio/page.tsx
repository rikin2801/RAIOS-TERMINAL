"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoldingForm } from "@/components/portfolio/holding-form";
import { useToast } from "@/hooks/use-toast";
import { usePortfolio, ALL_PORTFOLIOS_ID } from "@/contexts/portfolio-context";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/utils";
import type { Holding, HoldingWithMarket, ImportHistory } from "@/types";
import {
  Plus, Pencil, Trash2, Download, Upload,
  TrendingUp, TrendingDown, FileSpreadsheet, Brain,
  RefreshCw, ChevronDown, ChevronUp, PackageOpen,
  CheckCircle, AlertTriangle, XCircle, History,
} from "lucide-react";
import { StockChartModal } from "@/components/charts/stock-chart-modal";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const BROKER_OPTIONS = [
  { value: "AUTO", label: "Auto-detect" },
  { value: "ICICI_DIRECT", label: "ICICI Direct" },
  { value: "NJ_TRADING", label: "NJ Trading" },
  { value: "ZERODHA", label: "Zerodha" },
  { value: "RAIOS_CSV", label: "RAIOS CSV / Excel" },
] as const;

interface AISignal {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: number;
  investmentScore: number;
  targetPrice: number;
  stopLoss: number;
  entryZone: string;
  summary: string;
  indicators?: { rsi: number; trend: string; macdHistogram: number; sma50: number; sma200: number };
}

const signalColors = {
  BUY: "text-green-400 bg-green-400/10 border-green-400/30",
  HOLD: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  SELL: "text-red-400 bg-red-400/10 border-red-400/30",
};

export default function PortfolioPage() {
  const { activePortfolioId, activePortfolio, refreshPortfolios } = usePortfolio();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Holding | null>(null);
  const [aiSignals, setAiSignals] = useState<Record<string, AISignal>>({});
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analyzingSymbol, setAnalyzingSymbol] = useState<string | null>(null);
  const [expandedAI, setExpandedAI] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"holdings" | "import" | "history">("holdings");
  const [importBroker, setImportBroker] = useState<string>("AUTO");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ holdings?: { symbol: string; name: string; shares: number; avgCost: number }[]; errors: string[]; warnings: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [chartSymbol, setChartSymbol] = useState<{ symbol: string; exchange: string; name?: string } | null>(null);
  const { toast } = useToast();
  const brokerFileRef = useRef<HTMLInputElement>(null);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    try {
      if (activePortfolioId === ALL_PORTFOLIOS_ID) {
        // Fetch all holdings across every portfolio and merge duplicates by weighted avg cost
        const res = await fetch("/api/holdings?portfolioId=__ALL__");
        const all: Holding[] = await res.json();
        const merged = new Map<string, Holding>();
        for (const h of all) {
          const existing = merged.get(h.symbol);
          if (!existing) {
            merged.set(h.symbol, { ...h });
          } else {
            const totalShares = existing.shares + h.shares;
            const avgCost = (existing.avgCost * existing.shares + h.avgCost * h.shares) / totalShares;
            merged.set(h.symbol, { ...existing, shares: totalShares, avgCost });
          }
        }
        setHoldings(Array.from(merged.values()));
      } else {
        const pid = activePortfolioId ?? "";
        const url = pid ? `/api/holdings?portfolioId=${pid}` : "/api/holdings";
        const res = await fetch(url);
        const data = await res.json();
        setHoldings(data);
      }
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId]);

  const fetchImportHistory = useCallback(async () => {
    if (!activePortfolioId) return;
    const res = await fetch(`/api/portfolios/${activePortfolioId}/import`);
    if (res.ok) {
      const json = await res.json();
      setImportHistory(Array.isArray(json) ? json : []);
    }
  }, [activePortfolioId]);

  const handleBrokerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    // Auto-preview
    const fd = new FormData();
    fd.append("file", file);
    fd.append("broker", importBroker);
    fd.append("preview", "true");
    try {
      const res = await fetch(`/api/portfolios/${activePortfolioId ?? "default-portfolio"}/import`, { method: "POST", body: fd });
      const data = await res.json();
      // API wraps result in { parseResult, preview: true } — unwrap it
      setImportPreview(data.parseResult ?? data);
    } catch {
      setImportPreview({ errors: ["Failed to parse file. Check format."], warnings: [] });
    }
  };

  const handleBrokerImport = async () => {
    if (!importFile || !activePortfolioId) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("broker", importBroker);
    fd.append("skipDuplicates", "true");
    try {
      const res = await fetch(`/api/portfolios/${activePortfolioId}/import`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: data.error ?? "Unknown error", variant: "destructive" });
      } else {
        const imported = (data.holdingsImported ?? 0) + (data.transactionsImported ?? 0);
        const skipped = data.warnings?.filter((w: string) => w.includes("skipped")).length ?? 0;
        toast({ title: `Imported ${imported} holdings`, description: skipped ? `${skipped} duplicate(s) skipped` : undefined });
        setImportFile(null);
        setImportPreview(null);
        fetchHoldings();
        fetchImportHistory();
        refreshPortfolios();
        setActiveTab("holdings");
      }
    } catch {
      toast({ title: "Import error", variant: "destructive" });
    }
    setImporting(false);
  };

  const fetchQuotes = useCallback(async (syms: Holding[]) => {
    const results = await Promise.allSettled(
      syms.map((h) =>
        fetch(`/api/market/${h.symbol}?exchange=${h.exchange ?? "NSE"}`).then((r) => r.json())
      )
    );
    const map: typeof quotes = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.price) {
        map[syms[i].symbol] = {
          price: r.value.price,
          change: r.value.change,
          changePercent: r.value.changePercent,
        };
      }
    });
    setQuotes(map);
  }, []);

  const analyzeHolding = useCallback(async (h: Holding) => {
    setAnalyzingSymbol(h.symbol);
    try {
      const res = await fetch(`/api/analysis/${h.symbol}?exchange=${h.exchange ?? "NSE"}`);
      if (!res.ok) return;
      const data = await res.json();
      setAiSignals((prev) => ({
        ...prev,
        [h.symbol]: {
          signal: data.signal,
          confidence: data.confidence,
          investmentScore: data.investmentScore,
          targetPrice: data.targetPrice,
          stopLoss: data.stopLoss,
          entryZone: data.entryZone,
          summary: data.summary,
          indicators: data.indicators ? {
            rsi: data.indicators.rsi,
            trend: data.indicators.trend,
            macdHistogram: data.indicators.macdHistogram,
            sma50: data.indicators.sma50,
            sma200: data.indicators.sma200,
          } : undefined,
        },
      }));
      setExpandedAI((prev) => ({ ...prev, [h.symbol]: true }));
    } catch {}
    setAnalyzingSymbol(null);
  }, []);

  const analyzeAll = useCallback(async () => {
    if (!holdings.length) return;
    setAnalyzingAll(true);
    for (const h of holdings) {
      setAnalyzingSymbol(h.symbol);
      try {
        const res = await fetch(`/api/analysis/${h.symbol}?exchange=${h.exchange ?? "NSE"}`);
        if (res.ok) {
          const data = await res.json();
          setAiSignals((prev) => ({
            ...prev,
            [h.symbol]: {
              signal: data.signal, confidence: data.confidence,
              investmentScore: data.investmentScore, targetPrice: data.targetPrice,
              stopLoss: data.stopLoss, entryZone: data.entryZone, summary: data.summary,
              indicators: data.indicators ? {
                rsi: data.indicators.rsi, trend: data.indicators.trend,
                macdHistogram: data.indicators.macdHistogram,
                sma50: data.indicators.sma50, sma200: data.indicators.sma200,
              } : undefined,
            },
          }));
          setExpandedAI((prev) => ({ ...prev, [h.symbol]: true }));
        }
      } catch {}
    }
    setAnalyzingSymbol(null);
    setAnalyzingAll(false);
    toast({ title: "AI analysis complete for all holdings" });
  }, [holdings, toast]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  useEffect(() => {
    if (holdings.length > 0) fetchQuotes(holdings);
  }, [holdings, fetchQuotes]);

  useEffect(() => {
    if (activeTab === "history") fetchImportHistory();
  }, [activeTab, fetchImportHistory]);

  const enriched: HoldingWithMarket[] = holdings.map((h) => {
    const q = quotes[h.symbol];
    const currentPrice = q?.price ?? h.avgCost;
    const currentValue = currentPrice * h.shares;
    const totalCost = h.avgCost * h.shares;
    const gainLoss = currentValue - totalCost;
    const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0;
    const dayChange = (q?.change ?? 0) * h.shares;
    const dayChangePercent = q?.changePercent ?? 0;
    return { ...h, currentPrice, currentValue, totalCost, gainLoss, gainLossPercent, dayChange, dayChangePercent };
  });

  const totalValue = enriched.reduce((s, h) => s + h.currentValue, 0);
  const totalCost = enriched.reduce((s, h) => s + h.totalCost, 0);
  const totalGL = totalValue - totalCost;
  const totalGLPct = totalCost > 0 ? (totalGL / totalCost) * 100 : 0;

  const handleAdd = async (data: Partial<Holding>) => {
    const res = await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to add");
    toast({ title: "Holding added" });
    fetchHoldings();
  };

  const handleEdit = async (data: Partial<Holding>) => {
    if (!editTarget) return;
    const res = await fetch(`/api/holdings/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update");
    toast({ title: "Holding updated" });
    setEditTarget(null);
    fetchHoldings();
  };

  const handleDelete = async (id: string, symbol: string) => {
    if (!confirm(`Remove ${symbol} from portfolio?`)) return;
    await fetch(`/api/holdings/${id}`, { method: "DELETE" });
    toast({ title: `${symbol} removed` });
    fetchHoldings();
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(
      holdings.map((h) => ({
        Symbol: h.symbol,
        Name: h.name,
        Shares: h.shares,
        "Avg Cost": h.avgCost,
        Exchange: h.exchange ?? "NSE",
        Sector: h.sector ?? "",
        Broker: h.broker ?? "",
        "Purchase Date": h.purchaseDate ?? "",
        Notes: h.notes ?? "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const rows = holdings.map((h) => ({
      Symbol: h.symbol,
      Name: h.name,
      Shares: h.shares,
      "Avg Cost (₹)": h.avgCost,
      Exchange: h.exchange ?? "NSE",
      Sector: h.sector ?? "",
      Broker: h.broker ?? "",
      "Purchase Date": h.purchaseDate ?? "",
      Notes: h.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio");
    XLSX.writeFile(wb, "portfolio.xlsx");
  };

  const handleDownloadTemplate = () => {
    const sample = [
      { Symbol: "RELIANCE", Name: "Reliance Industries", Shares: 10, "Avg Cost (₹)": 2500, Exchange: "NSE", Sector: "Energy", Broker: "Zerodha", "Purchase Date": "2024-01-15", Notes: "" },
      { Symbol: "TCS", Name: "Tata Consultancy Services", Shares: 5, "Avg Cost (₹)": 3800, Exchange: "NSE", Sector: "IT", Broker: "Zerodha", "Purchase Date": "2024-02-20", Notes: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio");
    XLSX.writeFile(wb, "portfolio_template.xlsx");
  };

  // Convert Excel serial date number → "YYYY-MM-DD" string
  const excelDateToString = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number" && val > 40000) {
      // Excel date serial: days since 1900-01-01 (with 1900 leap year bug)
      const d = new Date((val - 25569) * 86400000);
      return d.toISOString().split("T")[0];
    }
    return String(val);
  };

  // Aggregate trade rows by symbol using FIFO lot tracking (matches ICICI Direct avg cost)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregateRows = (rows: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lots = new Map<string, { shares: number; price: number }[]>();

    for (const row of rows) {
      const symbol = String(row["Symbol"] || row["symbol"] || "").trim().toUpperCase();
      const name = String(row["Name"] || row["name"] || "").trim();
      if (!symbol || !name) continue;

      const shares = parseFloat(String(row["Shares"] || row["shares"] || row["Qty"] || row["Quantity"] || "0"));
      const price = parseFloat(String(row["Avg Cost"] || row["Avg Cost (₹)"] || row["avg_cost"] || row["avgCost"] || row["Price"] || row["Rate"] || "0"));
      if (!shares || !price) continue;

      const isSell = String(row["Notes"] || row["notes"] || "").toLowerCase() === "sell";

      if (!meta.has(symbol)) {
        meta.set(symbol, {
          symbol, name,
          exchange: String(row["Exchange"] || row["exchange"] || "NSE").toUpperCase(),
          sector: row["Sector"] || row["sector"] || null,
          broker: row["Broker"] || row["broker"] || null,
          purchaseDate: excelDateToString(row["Purchase Date"] || row["purchase_date"]),
        });
        lots.set(symbol, []);
      }

      if (isSell) {
        // FIFO: consume earliest lots first
        let remaining = shares;
        const queue = lots.get(symbol)!;
        while (remaining > 0 && queue.length > 0) {
          if (queue[0].shares <= remaining) {
            remaining -= queue[0].shares;
            queue.shift();
          } else {
            queue[0].shares -= remaining;
            remaining = 0;
          }
        }
      } else {
        lots.get(symbol)!.push({ shares, price });
      }
    }

    return Array.from(meta.entries()).map(([symbol, info]) => {
      const remaining = lots.get(symbol) ?? [];
      const totalShares = remaining.reduce((s, l) => s + l.shares, 0);
      const totalCost = remaining.reduce((s, l) => s + l.shares * l.price, 0);
      return {
        ...info,
        shares: parseFloat(totalShares.toFixed(4)),
        avgCost: totalShares > 0 ? parseFloat((totalCost / totalShares).toFixed(2)) : 0,
      };
    }).filter((h) => h.shares > 0 && h.avgCost > 0);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const importRows = async (rows: any[]) => {
    // If rows have multiple entries per symbol (trade log), aggregate them
    const symbols = rows.map((r) => String(r["Symbol"] || r["symbol"] || "").trim().toUpperCase()).filter(Boolean);
    const hasDuplicates = symbols.length !== new Set(symbols).size;
    const processed = hasDuplicates ? aggregateRows(rows) : rows.map((row) => ({
      symbol: String(row["Symbol"] || row["symbol"] || "").trim().toUpperCase(),
      name: String(row["Name"] || row["name"] || "").trim(),
      shares: parseFloat(String(row["Shares"] || row["shares"] || "0")),
      avgCost: parseFloat(String(row["Avg Cost"] || row["Avg Cost (₹)"] || row["avg_cost"] || row["avgCost"] || "0")),
      exchange: String(row["Exchange"] || "NSE").toUpperCase(),
      sector: row["Sector"] || row["sector"] || null,
      broker: row["Broker"] || row["broker"] || null,
      purchaseDate: excelDateToString(row["Purchase Date"] || row["purchase_date"]),
      notes: row["Notes"] || row["notes"] || null,
    }));

    let added = 0;
    for (const h of processed) {
      if (!h.symbol || !h.name || !h.shares || !h.avgCost) continue;
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: h.symbol,
          name: h.name,
          shares: h.shares,
          avgCost: h.avgCost,
          exchange: h.exchange,
          sector: h.sector || undefined,
          broker: h.broker || undefined,
          purchaseDate: h.purchaseDate || undefined,
          notes: h.notes || undefined,
        }),
      });
      if (res.ok) added++;
    }
    return added;
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      complete: async (results) => {
        const added = await importRows(results.data);
        toast({ title: `Imported ${added} holdings` });
        fetchHoldings();
      },
    });
    e.target.value = "";
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
      const added = await importRows(rows);
      toast({ title: `Imported ${added} holdings from Excel` });
      fetchHoldings();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const alertedSymbols = useRef<Set<string>>(new Set());

  // Fire a toast when any holding moves ±3% intraday
  useEffect(() => {
    if (!quotes || Object.keys(quotes).length === 0) return;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      if (!q) continue;
      const pct = q.changePercent;
      if (Math.abs(pct) < 3) continue;
      const key = `${h.symbol}_${pct > 0 ? "up" : "down"}`;
      if (alertedSymbols.current.has(key)) continue;
      alertedSymbols.current.add(key);
      const dir = pct > 0 ? "UP" : "DOWN";
      toast({
        title: `${h.symbol} ${dir} ${Math.abs(pct).toFixed(2)}% today`,
        description: `${h.name} · Current: ${formatCurrency(q.price)}`,
        variant: pct < 0 ? "destructive" : "default",
      });
    }
  }, [quotes, holdings, toast]);

  const csvRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const statusIcon = (s: string) => {
    if (s === "SUCCESS") return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (s === "PARTIAL") return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {activePortfolioId === ALL_PORTFOLIOS_ID
              ? `All Portfolios · ${holdings.length} holdings (merged) · NSE/BSE`
              : `${activePortfolio?.name ?? "Default"} · ${holdings.length} holdings · NSE/BSE`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "holdings" && activePortfolioId !== ALL_PORTFOLIOS_ID && (
            <>
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
              <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
              {/* Collapsed Import / Export dropdown */}
              <ImportExportMenu
                onTemplate={handleDownloadTemplate}
                onImportCSV={() => csvRef.current?.click()}
                onImportExcel={() => xlsxRef.current?.click()}
                onExportCSV={handleExportCSV}
                onExportExcel={handleExportExcel}
                hasHoldings={holdings.length > 0}
              />
              <Button variant="outline" size="sm" onClick={analyzeAll} disabled={analyzingAll || holdings.length === 0}>
                {analyzingAll ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {analyzingAll ? (analyzingSymbol ? `${analyzingSymbol}…` : "Analyzing…") : "AI Analyse All"}
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Holding
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Portfolio Value", value: formatCurrencyCompact(totalValue) },
          { label: "Total Cost", value: formatCurrencyCompact(totalCost) },
          { label: "Total Gain/Loss", value: formatCurrencyCompact(totalGL), pct: formatPercent(totalGLPct), positive: totalGL >= 0 },
          { label: "Holdings", value: holdings.length.toString() },
        ].map(({ label, value, pct, positive }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="metric-label">{label}</p>
            <p className={`metric-value ${pct !== undefined ? (positive ? "gain" : "loss") : ""}`}>
              {value}
            </p>
            {pct && <p className={`text-sm ${positive ? "gain" : "loss"}`}>{pct}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {(activePortfolioId === ALL_PORTFOLIOS_ID
          ? ["holdings"] as const
          : ["holdings", "import", "history"] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "import" ? (
              <span className="flex items-center gap-1.5"><PackageOpen className="h-3.5 w-3.5" />Broker Import</span>
            ) : tab === "history" ? (
              <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Import History</span>
            ) : "Holdings"}
          </button>
        ))}
        {activePortfolioId === ALL_PORTFOLIOS_ID && (
          <span className="ml-auto self-center text-[10px] text-muted-foreground px-2">
            Read-only · duplicate stocks merged by weighted avg cost
          </span>
        )}
      </div>

      {/* Tab: Holdings */}
      {activeTab === "holdings" && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Avg Cost</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Day</th>
                  <th className="text-right">Total G/L</th>
                  <th>AI Signal</th>
                  <th>Sector</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                ) : enriched.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12 text-muted-foreground">No holdings yet. Add your first NSE/BSE position or import a file.</td></tr>
                ) : (
                  enriched.flatMap((h) => {
                    const hasLivePrice = !!quotes[h.symbol]?.price;
                    const ai = aiSignals[h.symbol];
                    const isAnalyzing = analyzingSymbol === h.symbol;
                    const expanded = expandedAI[h.symbol];
                    const rows = [
                      <tr key={h.id}>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setChartSymbol({ symbol: h.symbol, exchange: h.exchange ?? "NSE", name: h.name })}
                              className="font-mono font-semibold text-primary hover:underline cursor-pointer"
                            >
                              {h.symbol}
                            </button>
                            <Badge variant="outline" className="text-xs py-0 px-1">{h.exchange ?? "NSE"}</Badge>
                          </div>
                        </td>
                        <td className="text-muted-foreground max-w-[140px] truncate">{h.name}</td>
                        <td className="text-right">{h.shares.toFixed(2)}</td>
                        <td className="text-right">{formatCurrency(h.avgCost)}</td>
                        <td className="text-right font-mono">
                          {hasLivePrice ? formatCurrency(h.currentPrice) : (
                            <span className="text-muted-foreground text-xs" title="Live price unavailable">—</span>
                          )}
                        </td>
                        <td className="text-right font-semibold">{formatCurrency(h.currentValue)}</td>
                        <td className={`text-right ${hasLivePrice ? (h.dayChangePercent >= 0 ? "gain" : "loss") : "text-muted-foreground"}`}>
                          {hasLivePrice ? (
                            <>{h.dayChangePercent >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}{formatPercent(h.dayChangePercent)}</>
                          ) : <span className="text-xs">—</span>}
                        </td>
                        <td className={`text-right ${hasLivePrice ? (h.gainLoss >= 0 ? "gain" : "loss") : "text-muted-foreground"}`}>
                          {hasLivePrice ? (
                            <><div>{formatCurrency(h.gainLoss)}</div><div className="text-xs">{formatPercent(h.gainLossPercent)}</div></>
                          ) : <span className="text-xs">—</span>}
                        </td>
                        <td>
                          {isAnalyzing ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />…</span>
                          ) : ai ? (
                            <button onClick={() => setExpandedAI((prev) => ({ ...prev, [h.symbol]: !prev[h.symbol] }))} className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${signalColors[ai.signal]}`}>{ai.signal}</span>
                              <span className="text-xs text-muted-foreground">{ai.confidence}%</span>
                              {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                            </button>
                          ) : (
                            <button onClick={() => analyzeHolding(h)} className="text-xs text-primary hover:underline flex items-center gap-1">
                              <Brain className="h-3 w-3" /> Analyze
                            </button>
                          )}
                        </td>
                        <td>
                          {h.sector && <Badge variant="outline" className="text-xs">{h.sector}</Badge>}
                        </td>
                        <td className="text-right">
                          {activePortfolioId !== ALL_PORTFOLIOS_ID && (
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(h)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => handleDelete(h.id, h.symbol)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>,
                    ];
                    if (ai && expanded) {
                      rows.push(
                        <tr key={`${h.id}-ai`} className="bg-secondary/20">
                          <td colSpan={12} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs mb-2">
                              <div><p className="text-muted-foreground">AI Score</p><p className="font-mono font-bold text-primary">{ai.investmentScore.toFixed(1)}/10</p></div>
                              <div><p className="text-muted-foreground">Target Price</p><p className="font-mono font-bold text-green-400">{formatCurrency(ai.targetPrice)}</p></div>
                              <div><p className="text-muted-foreground">Stop Loss</p><p className="font-mono font-bold text-red-400">{formatCurrency(ai.stopLoss)}</p></div>
                              {ai.indicators && (
                                <>
                                  <div><p className="text-muted-foreground">RSI</p><p className="font-mono font-bold">{ai.indicators.rsi.toFixed(1)}</p></div>
                                  <div><p className="text-muted-foreground">Trend</p><p className={`font-mono font-bold ${ai.indicators.trend === "UPTREND" ? "text-green-400" : ai.indicators.trend === "DOWNTREND" ? "text-red-400" : "text-yellow-400"}`}>{ai.indicators.trend}</p></div>
                                  <div><p className="text-muted-foreground">MACD</p><p className={`font-mono font-bold ${ai.indicators.macdHistogram > 0 ? "text-green-400" : "text-red-400"}`}>{ai.indicators.macdHistogram > 0 ? "Bullish" : "Bearish"}</p></div>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{ai.summary}</p>
                          </td>
                        </tr>
                      );
                    }
                    return rows;
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Broker Import */}
      {activeTab === "import" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold mb-1">Broker Import Engine</h2>
              <p className="text-sm text-muted-foreground">Import directly from ICICI Direct, Zerodha, NJ Trading or upload a RAIOS-formatted CSV/Excel.</p>
            </div>

            {/* Broker selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Broker Format</label>
              <div className="flex flex-wrap gap-2">
                {BROKER_OPTIONS.map((b) => (
                  <button
                    key={b.value}
                    onClick={() => { setImportBroker(b.value); setImportPreview(null); setImportFile(null); }}
                    className={`px-3 py-1.5 rounded border text-sm transition-colors ${
                      importBroker === b.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* File upload */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Upload File</label>
              <div
                onClick={() => brokerFileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <PackageOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                {importFile ? (
                  <p className="text-sm font-medium">{importFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Click to choose a file</p>
                    <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv supported</p>
                  </>
                )}
              </div>
              <input ref={brokerFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBrokerFileChange} />
            </div>

            {/* Broker hints */}
            <div className="rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
              {importBroker === "ICICI_DIRECT" && <p>Export from ICICI Direct → Portfolio → Equity Summary → Download as Excel. The parser maps proprietary codes (ASHLEY→ASHOKLEY, TATCOV→TATAMOTORS, etc.).</p>}
              {importBroker === "ZERODHA" && <p>Export from Zerodha Console → Holdings. The file should have an &quot;Instrument&quot; column with NSE:SYMBOL format.</p>}
              {importBroker === "NJ_TRADING" && <p>Export from NJ Wealth portal → My Portfolio. Upload the Excel/CSV as downloaded.</p>}
              {importBroker === "RAIOS_CSV" && <p>Use the RAIOS template format (Symbol, Name, Shares, Avg Cost columns). Download the template from the Holdings tab.</p>}
              {importBroker === "AUTO" && <p>Auto-detect reads the file header to identify the broker. Works for ICICI Direct, Zerodha, and NJ Trading exports.</p>}
            </div>
          </div>

          {/* Preview */}
          {importPreview && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold">Preview — {importPreview.holdings?.length ?? 0} holdings parsed</h3>
                <div className="flex gap-2">
                  {importPreview.errors.length > 0 && (
                    <span className="text-xs text-red-400 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />{importPreview.errors.length} error{importPreview.errors.length > 1 ? "s" : ""}</span>
                  )}
                  {importPreview.warnings.length > 0 && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{importPreview.warnings.length} warning{importPreview.warnings.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              {(importPreview.errors.length > 0 || importPreview.warnings.length > 0) && (
                <div className="px-4 py-3 border-b border-border space-y-1">
                  {importPreview.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400 flex items-start gap-1.5"><XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{e}</p>
                  ))}
                  {importPreview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-400 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{w}</p>
                  ))}
                </div>
              )}

              {importPreview.holdings && importPreview.holdings.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th className="text-right">Shares</th>
                        <th className="text-right">Avg Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.holdings.map((h, i) => (
                        <tr key={i}>
                          <td className="font-mono font-semibold text-primary">{h.symbol}</td>
                          <td className="text-muted-foreground">{h.name}</td>
                          <td className="text-right">{h.shares}</td>
                          <td className="text-right">{formatCurrency(h.avgCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Duplicates will be skipped automatically.</p>
                <Button
                  size="sm"
                  onClick={handleBrokerImport}
                  disabled={importing || !importFile || (importPreview.holdings?.length ?? 0) === 0}
                >
                  {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {importing ? "Importing…" : `Import ${importPreview.holdings?.length ?? 0} Holdings`}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Import History */}
      {activeTab === "history" && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {importHistory.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No imports yet for this portfolio.</p>
              <p className="text-xs mt-1">Use Broker Import to bring in holdings from ICICI Direct, Zerodha, or NJ Trading.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Broker</th>
                    <th>File</th>
                    <th className="text-right">Rows</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {importHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="text-muted-foreground text-xs">{new Date(h.importedAt).toLocaleString("en-IN")}</td>
                      <td><Badge variant="outline" className="text-xs">{h.broker}</Badge></td>
                      <td className="font-mono text-xs max-w-[180px] truncate">{h.fileName}</td>
                      <td className="text-right">{h.rowCount}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {statusIcon(h.status)}
                          <span className="text-xs capitalize">{h.status.toLowerCase()}</span>
                        </div>
                      </td>
                      <td className="text-xs text-muted-foreground max-w-[200px] truncate">{h.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <HoldingForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleAdd}
        title="Add Holding"
      />
      {editTarget && (
        <HoldingForm
          open={true}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          initial={editTarget}
          title="Edit Holding"
        />
      )}

      {chartSymbol && (
        <StockChartModal
          symbol={chartSymbol.symbol}
          exchange={chartSymbol.exchange}
          name={chartSymbol.name}
          onClose={() => setChartSymbol(null)}
        />
      )}
    </div>
  );
}

function ImportExportMenu({
  onTemplate, onImportCSV, onImportExcel, onExportCSV, onExportExcel, hasHoldings,
}: {
  onTemplate: () => void;
  onImportCSV: () => void;
  onImportExcel: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  hasHoldings: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(v => !v)}>
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Import / Export
        <ChevronDown className="h-3 w-3 ml-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-border bg-card shadow-lg py-1 text-xs">
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Import</p>
            <button onClick={() => { onTemplate(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left">
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" /> Download Template
            </button>
            <button onClick={() => { onImportCSV(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left">
              <Upload className="h-3.5 w-3.5 text-muted-foreground" /> Import CSV
            </button>
            <button onClick={() => { onImportExcel(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left">
              <Upload className="h-3.5 w-3.5 text-muted-foreground" /> Import Excel
            </button>
            <div className="my-1 border-t border-border" />
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Export</p>
            <button onClick={() => { onExportCSV(); setOpen(false); }} disabled={!hasHoldings} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left disabled:opacity-40">
              <Download className="h-3.5 w-3.5 text-muted-foreground" /> Export CSV
            </button>
            <button onClick={() => { onExportExcel(); setOpen(false); }} disabled={!hasHoldings} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left disabled:opacity-40">
              <Download className="h-3.5 w-3.5 text-muted-foreground" /> Export Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
