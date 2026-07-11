export type ParsedHolding = {
  symbol: string;         // NSE/BSE symbol
  name: string;
  shares: number;
  avgCost: number;
  sector?: string;
  exchange: "NSE" | "BSE";
  isin?: string;
  originalSymbol?: string; // broker's own code if different
};

export type ParsedTransaction = {
  symbol: string;
  name: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "BONUS" | "SPLIT" | "RIGHTS";
  shares: number;
  price: number;
  amount: number;
  brokerage?: number;
  date: string;           // YYYY-MM-DD
  exchange: "NSE" | "BSE";
  isin?: string;
  notes?: string;
};

export type ParseResult = {
  broker: "ICICI_DIRECT" | "NJ_TRADING" | "ZERODHA" | "RAIOS_CSV" | "UNKNOWN";
  fileType: "portfolio_summary" | "transaction_statement" | "holdings";
  holdings?: ParsedHolding[];
  transactions?: ParsedTransaction[];
  errors: string[];
  warnings: string[];
  rawRowCount: number;
};
