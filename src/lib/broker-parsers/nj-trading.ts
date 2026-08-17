import type { ParseResult, ParsedHolding } from "./types";

// NJ Trading long company name → NSE symbol
const NJ_NAME_TO_NSE: Record<string, string> = {
  // ETFs – Nippon
  "NIPPON INDIA ETF GOLD BEES": "GOLDBEES",
  "NIPPON INDIA ETF NIFTY BEES": "NIFTYBEES",
  "NIPPON INDIA ETF BANK BEES": "BANKBEES",
  "NIPPON INDIA ETF JUNIOR BEES": "JUNIORBEES",
  "NIPPONAMC - NETFSILVER": "SILVERBEES",
  "NIPPON INDIA ETF SILVER": "SILVERBEES",
  "NIPPON INDIA ETF NIFTY MIDCAP 150": "MIDCAP150",
  // ETFs – SBI / HDFC / ICICI
  "SBI - ETF NIFTY 50": "SETFNIF50",
  "SBI - ETF SENSEX": "SETFSN50",
  "HDFC NIFTY 50 ETF": "HDFCNIFTY",
  "ICICI PRUDENTIAL NIFTY 50 ETF": "ICICIN50",
  // InvITs / REITs
  "POWERGRID INFRASTRUCTURE INVESTMENT TRUST": "PGINVIT",
  "INDIA GRID TRUST": "INDIGRID",
  "INDIGRID": "INDIGRID",
  "EMBASSY OFFICE PARKS REIT": "EMBASSY",
  "MINDSPACE BUSINESS PARKS REIT": "MINDSPACE",
  "BROOKFIELD INDIA REAL ESTATE TRUST": "BIRET",
  // Common equities
  "HINDUSTAN COPPER LIMITED": "HINDCOPPER",
  "REC LIMITED": "RECLTD",
  "POWER FINANCE CORPORATION LIMITED": "PFC",
  "POWER FINANCE CORPORATION": "PFC",
  "NTPC LIMITED": "NTPC",
  "COAL INDIA LIMITED": "COALINDIA",
  "OIL AND NATURAL GAS CORPORATION LIMITED": "ONGC",
  "BHARAT PETROLEUM CORPORATION LIMITED": "BPCL",
  "INDIAN OIL CORPORATION LIMITED": "IOC",
  "GAIL (INDIA) LIMITED": "GAIL",
  "RELIANCE INDUSTRIES LIMITED": "RELIANCE",
  "TATA CONSULTANCY SERVICES LIMITED": "TCS",
  "INFOSYS LIMITED": "INFY",
  "WIPRO LIMITED": "WIPRO",
  "HCL TECHNOLOGIES LIMITED": "HCLTECH",
  "HDFC BANK LIMITED": "HDFCBANK",
  "ICICI BANK LIMITED": "ICICIBANK",
  "STATE BANK OF INDIA": "SBIN",
  "AXIS BANK LIMITED": "AXISBANK",
  "KOTAK MAHINDRA BANK LIMITED": "KOTAKBANK",
  "BAJAJ FINANCE LIMITED": "BAJFINANCE",
  "BAJAJ FINSERV LIMITED": "BAJAJFINSV",
  "LARSEN AND TOUBRO LIMITED": "LT",
  "LARSEN & TOUBRO LIMITED": "LT",
  "TATA MOTORS LIMITED": "TMCV",
  "TATA MOTORS COMMERCIAL VEHICLES LIMITED": "TMCV",
  "TATA MOTORS PASSENGER VEHICLES LIMITED": "TMPV",
  "TATA MOTORS PASS VEH LTD": "TMPV",
  "TATA STEEL LIMITED": "TATASTEEL",
  "TATA POWER CO LTD": "TATAPOWER",
  "MARUTI SUZUKI INDIA LIMITED": "MARUTI",
  "SUN PHARMACEUTICAL INDUSTRIES LIMITED": "SUNPHARMA",
  "DR. REDDY'S LABORATORIES LIMITED": "DRREDDY",
  "CIPLA LIMITED": "CIPLA",
  "ADANI PORTS AND SPECIAL ECONOMIC ZONE LIMITED": "ADANIPORTS",
  "ADANI ENTERPRISES LIMITED": "ADANIENT",
  "ITC LIMITED": "ITC",
  "HINDUSTAN UNILEVER LIMITED": "HINDUNILVR",
  "ASIAN PAINTS LIMITED": "ASIANPAINT",
  "TITAN COMPANY LIMITED": "TITAN",
  "BRITANNIA INDUSTRIES LIMITED": "BRITANNIA",
  "NESTLE INDIA LIMITED": "NESTLEIND",
  "BHARTI AIRTEL LIMITED": "BHARTIARTL",
  "ULTRATECH CEMENT LIMITED": "ULTRACEMCO",
  "DIVI'S LABORATORIES LIMITED": "DIVISLAB",
  "APOLLO HOSPITALS ENTERPRISE LIMITED": "APOLLOHOSP",
  "SIEMENS LIMITED": "SIEMENS",
  "ABB INDIA LIMITED": "ABB",
  "HAVELLS INDIA LIMITED": "HAVELLS",
  "VOLTAS LIMITED": "VOLTAS",
  "DLF LIMITED": "DLF",
  "ZOMATO LIMITED": "ZOMATO",
  "VEDANTA LIMITED": "VEDL",
  "HINDALCO INDUSTRIES LIMITED": "HINDALCO",
  "JSW STEEL LIMITED": "JSWSTEEL",
  "MUTHOOT FINANCE LIMITED": "MUTHOOTFIN",
  "CHOLAMANDALAM INVESTMENT AND FINANCE COMPANY LIMITED": "CHOLAFIN",
  "ASHOK LEYLAND LIMITED": "ASHOKLEY",
  "SUZLON ENERGY LIMITED": "SUZLON",
  "VODAFONE IDEA LIMITED": "IDEA",
  "AMARA RAJA ENERGY & MOBILITY LIMITED": "AMARAJABAT",
};

function resolveSymbol(name: string): { symbol: string; mapped: boolean } {
  const upper = name.toUpperCase().trim();

  // Exact match
  if (NJ_NAME_TO_NSE[upper]) return { symbol: NJ_NAME_TO_NSE[upper], mapped: true };

  // Partial / keyword match — longest match wins
  let best = "";
  let bestLen = 0;
  for (const [key, sym] of Object.entries(NJ_NAME_TO_NSE)) {
    if (upper.includes(key) && key.length > bestLen) {
      best = sym;
      bestLen = key.length;
    }
  }
  if (best) return { symbol: best, mapped: true };

  // Fallback: strip common suffixes and take first 12 alpha-numeric chars
  const cleaned = upper
    .replace(/\bLIMITED\b|\bLTD\.?\b|\bPVT\.?\b|\bINDIA\b|\bCO\.?\b|\bINDUSTRIES\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  return { symbol: cleaned || upper.replace(/[^A-Z0-9]/g, "").slice(0, 8), mapped: false };
}

export function parseNJTrading(rows: unknown[][]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const holdings: ParsedHolding[] = [];

  // Find the data header row — NJ files have several title rows before the actual table
  // The header row contains "Scrip Name" (or SCRIPT/STOCK/SCHEME) and "Quantity"
  const headerIdx = rows.findIndex((r) => {
    const j = (r as string[]).join(",").toUpperCase();
    return (
      (j.includes("SCRIP") || j.includes("SCRIPT") || j.includes("STOCK") || j.includes("SCHEME")) &&
      (j.includes("QTY") || j.includes("QUANTITY") || j.includes("UNIT"))
    );
  });

  if (headerIdx === -1) {
    errors.push(
      "Cannot detect NJ Trading format. Expected a header row with 'Scrip Name' and 'Quantity' columns."
    );
    return { broker: "NJ_TRADING", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  const header = (rows[headerIdx] as string[]).map((h) => String(h).toUpperCase().trim());
  const col = (n: string) => header.findIndex((h) => h.includes(n));

  // Column indices
  const nameCol  = col("SCRIP") !== -1 ? col("SCRIP") : col("SCRIPT") !== -1 ? col("SCRIPT") : col("STOCK") !== -1 ? col("STOCK") : col("SCHEME");
  const isinCol  = col("ISIN");
  const exchCol  = col("EXCHANGE");
  const qtyCol   = col("QTY") !== -1 ? col("QTY") : col("QUANTITY") !== -1 ? col("QUANTITY") : col("UNIT");
  // Prefer avg purchase price over current price
  const priceCol = col("AVG. PURCHASE") !== -1 ? col("AVG. PURCHASE")
                 : col("AVG PURCHASE")  !== -1 ? col("AVG PURCHASE")
                 : col("PURCHASE RATE") !== -1 ? col("PURCHASE RATE")
                 : col("RATE")          !== -1 ? col("RATE")
                 : col("AVG")           !== -1 ? col("AVG")
                 : col("PRICE")         !== -1 ? col("PRICE")
                 : col("NAV");
  const symCol   = col("SYMBOL") !== -1 ? col("SYMBOL") : -1;

  if (nameCol === -1 || qtyCol === -1) {
    errors.push(`Missing required columns. Found: ${header.join(", ")}`);
    return { broker: "NJ_TRADING", fileType: "portfolio_summary", errors, warnings, rawRowCount: rows.length };
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number)[];

    // Skip investor name rows, sub-totals, totals, notes, empty rows
    const firstCell = String(row[0] ?? "").trim();
    const srNo = parseFloat(firstCell);
    // Data rows have a numeric Sr. No. in column 0; all other rows are metadata
    if (isNaN(srNo)) continue;

    const name = String(row[nameCol] ?? "").trim();
    if (!name) continue;

    const qty   = parseFloat(String(row[qtyCol]));
    const price = priceCol !== -1 ? parseFloat(String(row[priceCol])) : NaN;

    if (isNaN(qty) || qty <= 0) {
      warnings.push(`Row ${i + 1}: Skipped "${name}" — invalid quantity (${row[qtyCol]})`);
      continue;
    }

    const isin    = isinCol !== -1 ? String(row[isinCol] ?? "").trim() : undefined;
    const exchRaw = exchCol !== -1 ? String(row[exchCol] ?? "").toUpperCase().trim() : "NSE";
    const exchange: "NSE" | "BSE" = exchRaw === "BSE" ? "BSE" : "NSE";

    // Use explicit symbol column if available, else resolve from name
    let symbol: string;
    let mapped = true;
    if (symCol !== -1 && String(row[symCol] ?? "").trim()) {
      symbol = String(row[symCol]).trim().toUpperCase();
    } else {
      const resolved = resolveSymbol(name);
      symbol = resolved.symbol;
      mapped = resolved.mapped;
    }

    if (!mapped) {
      warnings.push(`Row ${i + 1}: "${name}" — could not find NSE symbol, imported as "${symbol}". Please verify and update manually.`);
    }

    const avgCost = isNaN(price) || price <= 0 ? 0 : price;
    if (avgCost === 0) {
      warnings.push(`Row ${i + 1}: ${symbol} — average purchase price not found, set to 0. Please update manually.`);
    }

    holdings.push({
      symbol,
      name,
      shares: qty,
      avgCost,
      exchange,
      isin: isin || undefined,
    });
  }

  if (holdings.length === 0) {
    errors.push("No valid holdings found in NJ Trading file. Check that the file is a Current Holdings report.");
  }

  return {
    broker: "NJ_TRADING",
    fileType: "portfolio_summary",
    holdings,
    errors,
    warnings,
    rawRowCount: rows.length - headerIdx - 1,
  };
}
