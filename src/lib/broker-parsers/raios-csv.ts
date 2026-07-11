import type { ParseResult, ParsedHolding } from "./types";

// Parser for RAIOS's own internal CSV/Excel format (Symbol, Name, Shares, Avg Cost, ...)
// This is the format used by the existing portfolio import feature.
// Also handles FIFO aggregation when multiple rows exist for the same symbol.

function excelDateToISO(serial: number | string): string {
  if (typeof serial === "string") {
    if (serial.includes("-") || serial.includes("/")) return serial.slice(0, 10);
    serial = parseFloat(serial);
  }
  if (isNaN(serial as number)) return "";
  const date = new Date(((serial as number) - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

export function parseRAIOSFormat(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw: ParsedHolding[] = [];

  const headerIdx = rows.findIndex((r) => {
    const j = (r as string[]).join(",").toUpperCase();
    return j.includes("SYMBOL") && (j.includes("SHARES") || j.includes("QTY"));
  });

  if (headerIdx === -1) {
    errors.push("Cannot detect RAIOS CSV format. Expected: Symbol, Name, Shares/Qty, Avg Cost");
    return { broker: "RAIOS_CSV", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toUpperCase().trim());
  const col = (n: string) => header.findIndex((h) => h.includes(n));

  const symCol    = col("SYMBOL");
  const nameCol   = col("NAME");
  const sharesCol = col("SHARES") !== -1 ? col("SHARES") : col("QTY");
  const costCol   = col("AVG COST") !== -1 ? col("AVG COST") : col("AVERAGE") !== -1 ? col("AVERAGE") : col("COST");
  const exchCol   = col("EXCHANGE");
  const sectorCol = col("SECTOR");
  const noteCol   = col("NOTE") !== -1 ? col("NOTE") : col("NOTES");
  const brokerCol = col("BROKER");

  if (symCol === -1 || sharesCol === -1 || costCol === -1) {
    errors.push(`Missing required columns. Found: ${header.join(", ")}`);
    return { broker: "RAIOS_CSV", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];
    const sym = String(row[symCol] ?? "").toUpperCase().trim();
    if (!sym) continue;

    const shares = parseFloat(String(row[sharesCol]));
    const cost   = parseFloat(String(row[costCol]));
    if (isNaN(shares) || shares === 0 || isNaN(cost)) continue;

    const exchRaw = exchCol !== -1 ? String(row[exchCol] ?? "").toUpperCase().trim() : "NSE";
    const note = noteCol !== -1 ? String(row[noteCol] ?? "").toUpperCase().trim() : "";

    // Negative shares or "SELL" note means this is a sell transaction — skip for holdings
    if (shares < 0 || note === "SELL") continue;

    raw.push({
      symbol: sym,
      name: nameCol !== -1 ? String(row[nameCol] ?? sym).trim() : sym,
      shares,
      avgCost: cost,
      exchange: exchRaw === "BSE" ? "BSE" : "NSE",
      sector: sectorCol !== -1 && row[sectorCol] ? String(row[sectorCol]).trim() : undefined,
    });
  }

  // FIFO aggregation: combine multiple buy rows for the same symbol
  const map = new Map<string, ParsedHolding>();
  for (const h of raw) {
    if (map.has(h.symbol)) {
      const ex = map.get(h.symbol)!;
      const totalShares = ex.shares + h.shares;
      const totalCost   = ex.avgCost * ex.shares + h.avgCost * h.shares;
      ex.shares  = totalShares;
      ex.avgCost = totalCost / totalShares;
      if (h.sector && !ex.sector) ex.sector = h.sector;
    } else {
      map.set(h.symbol, { ...h });
    }
  }

  const holdings = Array.from(map.values()).filter((h) => h.shares > 0.001);

  if (holdings.length === 0) {
    errors.push("No valid holdings after parsing and aggregation.");
  }

  return { broker: "RAIOS_CSV", fileType: "portfolio_summary", holdings, errors, warnings, rawRowCount: rows.length - headerIdx - 1 };
}
