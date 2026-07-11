import type { ParseResult, ParsedHolding, ParsedTransaction } from "./types";

// Zerodha Holdings CSV format:
// Instrument,Qty.,Avg. cost,LTP,Cur. val,P&L,Net chg.,Day chg.
// NSE:INFY,100,1500.00,...
//
// Zerodha Trade Book format:
// trade_date,exchange,tradingsymbol,trade_type,quantity,price,order_id,...

function parseExchangeSymbol(instrument: string): { symbol: string; exchange: "NSE" | "BSE" } {
  const parts = instrument.split(":");
  if (parts.length === 2) {
    return { symbol: parts[1].trim(), exchange: parts[0].toUpperCase() === "BSE" ? "BSE" : "NSE" };
  }
  return { symbol: instrument.trim(), exchange: "NSE" };
}

export function parseZerodhaHoldings(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const holdings: ParsedHolding[] = [];

  // Find header row
  const headerIdx = rows.findIndex((r) => {
    const j = (r as string[]).join(",").toUpperCase();
    return j.includes("INSTRUMENT") || j.includes("TRADINGSYMBOL");
  });

  if (headerIdx === -1) {
    errors.push("Cannot detect Zerodha holdings format. Expected 'Instrument' or 'Tradingsymbol' column.");
    return { broker: "ZERODHA", fileType: "holdings", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toUpperCase().trim().replace(/\./g, ""));
  const col = (n: string) => header.findIndex((h) => h.includes(n));

  const instrCol = col("INSTRUMENT") !== -1 ? col("INSTRUMENT") : col("TRADINGSYMBOL");
  const qtyCol   = col("QTY") !== -1 ? col("QTY") : col("QUANTITY");
  const costCol  = col("AVG COST") !== -1 ? col("AVG COST") : col("AVERAGE");

  if (instrCol === -1 || qtyCol === -1 || costCol === -1) {
    errors.push(`Missing required columns. Found: ${header.join(", ")}`);
    return { broker: "ZERODHA", fileType: "holdings", errors, warnings, rawRowCount: rows.length };
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];
    const rawInstr = String(row[instrCol] ?? "").trim();
    if (!rawInstr) continue;

    const qty = parseFloat(String(row[qtyCol]));
    const avgCost = parseFloat(String(row[costCol]));
    if (isNaN(qty) || qty <= 0 || isNaN(avgCost) || avgCost <= 0) {
      warnings.push(`Row ${i + 1}: Skipped ${rawInstr} — invalid qty or cost`);
      continue;
    }

    const { symbol, exchange } = parseExchangeSymbol(rawInstr);
    holdings.push({ symbol, name: symbol, shares: qty, avgCost, exchange });
  }

  if (holdings.length === 0) {
    errors.push("No valid holdings found. Check the file format.");
  }

  return { broker: "ZERODHA", fileType: "holdings", holdings, errors, warnings, rawRowCount: rows.length - headerIdx - 1 };
}

export function parseZerodhaTradeBook(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];

  const headerIdx = rows.findIndex((r) => {
    const j = (r as string[]).join(",").toLowerCase();
    return j.includes("trade_date") || (j.includes("tradingsymbol") && j.includes("trade_type"));
  });

  if (headerIdx === -1) {
    errors.push("Cannot detect Zerodha trade book format.");
    return { broker: "ZERODHA", fileType: "transaction_statement", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toLowerCase().trim());
  const col = (n: string) => header.findIndex((h) => h.includes(n));

  const dateCol  = col("trade_date") !== -1 ? col("trade_date") : col("date");
  const symCol   = col("tradingsymbol") !== -1 ? col("tradingsymbol") : col("symbol");
  const exchCol  = col("exchange");
  const typeCol  = col("trade_type") !== -1 ? col("trade_type") : col("type");
  const qtyCol   = col("quantity") !== -1 ? col("quantity") : col("qty");
  const priceCol = col("price");

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];
    const rawSym = String(row[symCol] ?? "").trim();
    if (!rawSym) continue;

    const qty   = parseFloat(String(row[qtyCol]));
    const price = parseFloat(String(row[priceCol]));
    if (isNaN(qty) || isNaN(price)) continue;

    const rawDate = String(row[dateCol] ?? "");
    const date = rawDate.split(" ")[0] || rawDate.slice(0, 10);
    const rawType = String(row[typeCol] ?? "").toUpperCase();
    const exchange = exchCol !== -1 && String(row[exchCol]).toUpperCase() === "BSE" ? "BSE" : "NSE" as "NSE";

    transactions.push({
      symbol: rawSym,
      name: rawSym,
      type: rawType.includes("SELL") ? "SELL" : "BUY",
      shares: qty,
      price,
      amount: qty * price,
      date,
      exchange,
    });
  }

  return { broker: "ZERODHA", fileType: "transaction_statement", transactions, errors, warnings, rawRowCount: rows.length - headerIdx - 1 };
}
