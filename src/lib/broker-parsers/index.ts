import * as XLSX from "xlsx";
import type { ParseResult } from "./types";
import { parseICICIDirect, parseICICITransactions } from "./icici-direct";
import { parseZerodhaHoldings, parseZerodhaTradeBook } from "./zerodha";
import { parseNJTrading } from "./nj-trading";
import { parseRAIOSFormat } from "./raios-csv";

export type BrokerHint = "ICICI_DIRECT" | "NJ_TRADING" | "ZERODHA" | "RAIOS_CSV" | "AUTO";

// Read an uploaded file buffer and return row arrays
function parseFileBuffer(buffer: Buffer, fileName: string): unknown[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

// Auto-detect broker format from header content
function detectBroker(rows: unknown[][]): BrokerHint {
  // Scan up to 20 rows — NJ files have a large title block before the data header
  const topText = rows.slice(0, 20).map((r) => (r as string[]).join(" ")).join(" ").toUpperCase();

  if (topText.includes("ICICI") || topText.includes("STOCK SYMBOL") ||
      (topText.includes("AVERAGE COST PRICE") && topText.includes("COMPANY NAME"))) {
    return "ICICI_DIRECT";
  }
  if (topText.includes("ZERODHA") || topText.includes("INSTRUMENT") ||
      topText.includes("TRADINGSYMBOL")) {
    return "ZERODHA";
  }
  if (
    topText.includes("NJ INDIA") || topText.includes("NJ MUTUAL") ||
    (topText.includes("SCHEME") && topText.includes("FOLIO")) ||
    (topText.includes("SCRIP") && topText.includes("AVG. PURCHASE")) ||
    topText.includes("SCRIP HOLDING") || topText.includes("CUR HOLDING")
  ) {
    return "NJ_TRADING";
  }
  if (topText.includes("SYMBOL") && (topText.includes("SHARES") || topText.includes("AVG COST"))) {
    return "RAIOS_CSV";
  }
  return "AUTO";
}

// Main parser entry-point
export async function parseBrokerFile(
  buffer: Buffer,
  fileName: string,
  hint: BrokerHint = "AUTO"
): Promise<ParseResult> {
  const rows = parseFileBuffer(buffer, fileName);
  if (rows.length === 0) {
    return {
      broker: "UNKNOWN",
      fileType: "portfolio_summary",
      errors: ["File appears to be empty"],
      warnings: [],
      rawRowCount: 0,
    };
  }

  const broker = hint === "AUTO" ? detectBroker(rows) : hint;

  switch (broker) {
    case "ICICI_DIRECT": {
      // Detect whether it's a portfolio summary or transaction statement
      const topText = rows.slice(0, 15).map((r) => (r as string[]).join(" ")).join(" ").toUpperCase();
      if (topText.includes("TRADE DATE") || topText.includes("TRADE TYPE") || topText.includes("LEDGER")) {
        return parseICICITransactions(rows);
      }
      return parseICICIDirect(rows, fileName);
    }
    case "ZERODHA": {
      const topText = rows.slice(0, 5).map((r) => (r as string[]).join(" ")).join(" ").toUpperCase();
      if (topText.includes("TRADE_DATE") || topText.includes("TRADE_TYPE")) {
        return parseZerodhaTradeBook(rows);
      }
      return parseZerodhaHoldings(rows);
    }
    case "NJ_TRADING":
      return parseNJTrading(rows);
    case "RAIOS_CSV":
      return parseRAIOSFormat(rows);
    default:
      // Try parsers in order of confidence
      const icicResult = parseICICIDirect(rows, fileName);
      if (icicResult.errors.length === 0) return icicResult;
      const zeroResult = parseZerodhaHoldings(rows);
      if (zeroResult.errors.length === 0) return zeroResult;
      const njResult = parseNJTrading(rows);
      if (njResult.errors.length === 0) return njResult;
      const raiosResult = parseRAIOSFormat(rows);
      if (raiosResult.errors.length === 0) return raiosResult;
      return {
        broker: "UNKNOWN",
        fileType: "portfolio_summary",
        errors: ["Could not detect broker format. Please select the broker manually."],
        warnings: [],
        rawRowCount: rows.length,
      };
  }
}

export type { ParseResult, ParsedHolding, ParsedTransaction } from "./types";
