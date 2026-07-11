import type { ParseResult, ParsedHolding } from "./types";

// ICICI Direct uses short proprietary codes — this map covers common NSE stocks
// Format: ICICI_CODE → NSE_SYMBOL
const ICICI_TO_NSE: Record<string, string> = {
  // Auto
  ASHLEY: "ASHOKLEY", TATCOV: "TATAMOTORS", TMCV: "TATAMOTORS",
  MARUTI: "MARUTI", BAJAJ: "BAJAJ-AUTO", HERO: "HEROMOTOCO",
  EICHER: "EICHERMOT",
  // Banking
  HDFCBK: "HDFCBANK", ICICIBK: "ICICIBANK", SBININ: "SBIN",
  KOTAKB: "KOTAKBANK", AXISBK: "AXISBANK", PNBANK: "PNB",
  CANBK: "CANBK", BOBIN: "BANKBARODA", IDFCFB: "IDFCFIRSTB",
  FEDERL: "FEDERALBNK",
  // Finance
  BAJFIN: "BAJFINANCE", BAJFSV: "BAJAJFINSV", ADICAP: "ABCAPITAL",
  MUTHOT: "MUTHOOTFIN", CHOLFN: "CHOLAFIN", SHRFIN: "SHRIRAMFIN",
  HDFCLF: "HDFCLIFE", SBILFN: "SBILIFE", ICPRLI: "ICICIPRULI",
  // IT
  TCSLTD: "TCS", TCS: "TCS", INFY: "INFY", INFTEC: "INFY",
  WIPROC: "WIPRO", HCLTECH: "HCLTECH",
  TECHM: "TECHM", LTIMIN: "LTIM", PERSIST: "PERSISTENT", COFORG: "COFORGE",
  FRAANA: "FRACTAL", MPHASI: "MPHASIS",
  // FMCG
  HINDLV: "HINDUNILVR", ITCLTD: "ITC", NESTLEI: "NESTLEIND",
  TITAN: "TITAN", BRTANI: "BRITANNIA", DABUR: "DABUR", MARICO: "MARICO",
  COLPAL: "COLPAL", TATCON: "TATACONSUM",
  // Pharma
  SUNPHA: "SUNPHARMA", DRRDDY: "DRREDDY", CIPLA: "CIPLA",
  AUROPHM: "AUROPHARMA", LUPIN: "LUPIN", DIVISL: "DIVISLAB",
  APOLLH: "APOLLOHOSP",
  // Energy & Infra
  RELIND: "RELIANCE", ONGCLN: "ONGC", NTPCLM: "NTPC",
  PWRGRD: "POWERGRID", ADPRT: "ADANIPORTS", ADGRN: "ADANIGREEN",
  LARTOU: "LT", SIEMEN: "SIEMENS", ABBIND: "ABB", HAVELL: "HAVELLS",
  BHARTI: "BHARTIARTL", ADANIENT: "ADANIENT",
  TATPOW: "TATAPOWER", SUZENE: "SUZLON", IDECEL: "IDEA",
  // Metals
  TATSTE: "TATASTEEL", JSWSTL: "JSWSTEEL", HINDAL: "HINDALCO",
  COALIN: "COALINDIA", VEDLMT: "VEDL",
  // Consumer
  ASIAN: "ASIANPAINT", ULTCEM: "ULTRACEMCO", RAAINF: "RIIT",
  // ETFs
  GOLDEX: "GOLDBEES", NIPSIL: "SILVERBEES", NIFTBZ: "NIFTYBEES",
  JUNRBZ: "JUNIORBEES", BANKBZ: "BANKBEES",
  // Batteries / EV
  AMARAJ: "AMARAJABAT", EXIDEI: "EXIDEIND",
  // Others
  VOLTAS: "VOLTAS", DLFLTD: "DLF", ZOMATO: "ZOMATO",
  INDREL: "INDIGRID", EMBDEV: "EMBASSY",
};

// Try to map ICICI symbol to NSE symbol, else use company name guess
function mapSymbol(icicisym: string, companyName: string): { symbol: string; mapped: boolean } {
  const upper = icicisym.toUpperCase().trim();
  if (ICICI_TO_NSE[upper]) return { symbol: ICICI_TO_NSE[upper], mapped: true };

  // Try exact match (e.g. VOLTAS already maps to VOLTAS)
  // Use a normalized version of the company name to guess symbol
  const nameWords = companyName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return { symbol: upper, mapped: false };
  void nameWords;
}

// Excel date serial to YYYY-MM-DD (Excel epoch starts 1899-12-30)
function excelDateToISO(serial: number | string): string {
  if (typeof serial === "string") return serial;
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

export function parseICICIDirect(
  rows: unknown[][],
  fileName: string
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const holdings: ParsedHolding[] = [];

  // Detect portfolio summary: header row has "Stock Symbol" / "Company Name"
  const headerIdx = rows.findIndex((r) => {
    const joined = (r as string[]).join(",").toUpperCase();
    return joined.includes("STOCK SYMBOL") || joined.includes("QTY") || joined.includes("AVERAGE COST");
  });

  if (headerIdx === -1) {
    errors.push("Could not detect ICICI Direct format. Expected columns: Stock Symbol, Company Name, Qty, Average Cost Price.");
    return { broker: "ICICI_DIRECT", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toUpperCase().trim());
  const col = (name: string) => header.findIndex((h) => h.includes(name));

  const symCol   = col("STOCK SYMBOL") !== -1 ? col("STOCK SYMBOL") : col("SYMBOL");
  const nameCol  = col("COMPANY NAME") !== -1 ? col("COMPANY NAME") : col("NAME");
  const isinCol  = col("ISIN");
  const qtyCol   = col("QTY");
  const costCol  = col("AVERAGE COST");
  const exchCol  = col("EXCHANGE");

  if (symCol === -1 || qtyCol === -1 || costCol === -1) {
    errors.push(`Missing required columns. Found: ${header.join(", ")}`);
    return { broker: "ICICI_DIRECT", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];
    const icicisym = String(row[symCol] ?? "").trim();
    const compName = String(row[nameCol] ?? "").trim();

    if (!icicisym || icicisym.toUpperCase() === "TOTAL" || icicisym === "") continue;

    const qty = parseFloat(String(row[qtyCol]));
    const avgCost = parseFloat(String(row[costCol]));

    if (isNaN(qty) || qty <= 0 || isNaN(avgCost) || avgCost <= 0) {
      warnings.push(`Row ${i + 1}: Skipped ${icicisym} — invalid qty (${row[qtyCol]}) or cost (${row[costCol]})`);
      continue;
    }

    const isin = isinCol !== -1 ? String(row[isinCol] ?? "").trim() : undefined;
    const exchRaw = exchCol !== -1 ? String(row[exchCol] ?? "").toUpperCase().trim() : "NSE";
    const exchange: "NSE" | "BSE" = exchRaw === "BSE" ? "BSE" : "NSE";

    const { symbol, mapped } = mapSymbol(icicisym, compName);
    if (!mapped) {
      warnings.push(`Row ${i + 1}: ${icicisym} (${compName}) — symbol not in ICICI→NSE map, using as-is. Please verify.`);
    }

    holdings.push({
      symbol,
      name: compName || symbol,
      shares: qty,
      avgCost,
      exchange,
      isin: isin || undefined,
      originalSymbol: icicisym !== symbol ? icicisym : undefined,
    });
  }

  if (holdings.length === 0) {
    errors.push("No valid holdings found in file. Check that the file is a portfolio summary with Qty and Average Cost Price columns.");
  }

  return {
    broker: "ICICI_DIRECT",
    fileType: "portfolio_summary",
    holdings,
    errors,
    warnings,
    rawRowCount: rows.length - headerIdx - 1,
  };
}

// ICICI Transaction format detector + parser
export function parseICICITransactions(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const headerIdx = rows.findIndex((r) => {
    const j = (r as string[]).join(",").toUpperCase();
    return (j.includes("TRADE DATE") || j.includes("DATE")) && (j.includes("BUY") || j.includes("TRADE TYPE") || j.includes("QUANTITY"));
  });

  if (headerIdx === -1) {
    errors.push("Could not detect ICICI Direct transaction format.");
    return { broker: "ICICI_DIRECT", fileType: "transaction_statement", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toUpperCase().trim());
  const col = (n: string) => header.findIndex((h) => h.includes(n));

  const dateCol = col("TRADE DATE") !== -1 ? col("TRADE DATE") : col("DATE");
  const symCol  = col("SYMBOL") !== -1 ? col("SYMBOL") : col("SCRIPT");
  const nameCol = col("COMPANY NAME") !== -1 ? col("COMPANY NAME") : col("NAME");
  const typeCol = col("TRADE TYPE") !== -1 ? col("TRADE TYPE") : col("TYPE");
  const qtyCol  = col("QUANTITY") !== -1 ? col("QUANTITY") : col("QTY");
  const priceCol = col("PRICE") !== -1 ? col("PRICE") : col("RATE");
  const amtCol  = col("NET AMOUNT") !== -1 ? col("NET AMOUNT") : col("GROSS AMOUNT");

  if (dateCol === -1 || qtyCol === -1 || priceCol === -1) {
    errors.push(`Missing required columns. Found: ${header.join(", ")}`);
    return { broker: "ICICI_DIRECT", fileType: "transaction_statement", errors, warnings, rawRowCount: rows.length };
  }

  const transactions = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];
    const rawDate = row[dateCol];
    const rawSym  = String(row[symCol] ?? "").trim();
    const rawType = String(row[typeCol] ?? "").toUpperCase().trim();
    const qty  = parseFloat(String(row[qtyCol]));
    const price = parseFloat(String(row[priceCol]));

    if (!rawSym || isNaN(qty) || isNaN(price)) continue;

    const type = rawType.includes("BUY") ? "BUY" : rawType.includes("SELL") ? "SELL" : "BUY";
    const dateStr = typeof rawDate === "number"
      ? excelDateToISO(rawDate)
      : String(rawDate).slice(0, 10);

    const { symbol } = mapSymbol(rawSym, String(row[nameCol] ?? ""));
    const amount = amtCol !== -1 ? Math.abs(parseFloat(String(row[amtCol] ?? ""))) : qty * price;

    transactions.push({
      symbol,
      name: String(row[nameCol] ?? symbol).trim(),
      type: type as "BUY" | "SELL",
      shares: qty,
      price,
      amount: isNaN(amount) ? qty * price : amount,
      date: dateStr,
      exchange: "NSE" as const,
      originalSymbol: rawSym !== symbol ? rawSym : undefined,
    });
  }

  return {
    broker: "ICICI_DIRECT",
    fileType: "transaction_statement",
    transactions,
    errors,
    warnings,
    rawRowCount: rows.length - headerIdx - 1,
  };
}
