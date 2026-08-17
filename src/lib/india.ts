// Indian stock market helpers

export type Exchange = "NSE" | "BSE";

// Yahoo Finance uses non-standard NSE tickers for some InvITs/REITs
const NSE_YAHOO_OVERRIDES: Record<string, string> = {
  "RIIT": "RIIT-IV.NS", // Raajmarg Infra InvIT — NSE lists as RIIT-IV on Yahoo
};

export function toYahooSymbol(symbol: string, exchange: Exchange = "NSE"): string {
  const clean = symbol.toUpperCase().trim();
  if (clean.endsWith(".NS") || clean.endsWith(".BO")) return clean;
  if (exchange === "NSE" && NSE_YAHOO_OVERRIDES[clean]) return NSE_YAHOO_OVERRIDES[clean];
  return exchange === "BSE" ? `${clean}.BO` : `${clean}.NS`;
}

export function fromYahooSymbol(yahooSymbol: string): { symbol: string; exchange: Exchange } {
  if (yahooSymbol.endsWith(".NS")) return { symbol: yahooSymbol.slice(0, -3), exchange: "NSE" };
  if (yahooSymbol.endsWith(".BO")) return { symbol: yahooSymbol.slice(0, -3), exchange: "BSE" };
  return { symbol: yahooSymbol, exchange: "NSE" };
}

export const POPULAR_INDIAN_STOCKS = [
  // Nifty 50 Blue-chips
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infrastructure" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paints" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma" },
  // Tata Motors split in 2024: TATAMOTORS → TMCV (CV) + TMPV (PV)
  { symbol: "TMCV",       name: "Tata Motors Ltd (Commercial Vehicles)", sector: "Auto" },
  { symbol: "TMPV",       name: "Tata Motors Passenger Vehicles", sector: "Auto" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "ONGC", name: "ONGC", sector: "Energy" },
  { symbol: "NTPC", name: "NTPC", sector: "Power" },
  { symbol: "POWERGRID", name: "Power Grid Corp", sector: "Power" },
  { symbol: "ITC", name: "ITC Limited", sector: "FMCG" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT" },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", sector: "Pharma" },
  { symbol: "DIVISLAB", name: "Divi's Laboratories", sector: "Pharma" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Finance" },
  { symbol: "NESTLEIND", name: "Nestlé India", sector: "FMCG" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer" },
  // Auto & Auto Ancillary
  { symbol: "ASHOKLEY", name: "Ashok Leyland", sector: "Auto" },
  { symbol: "EICHERMOT", name: "Eicher Motors (Royal Enfield)", sector: "Auto" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Auto" },
  { symbol: "MOTHERSON", name: "Motherson Sumi Wiring", sector: "Auto Ancillary" },
  { symbol: "BOSCHLTD", name: "Bosch India", sector: "Auto Ancillary" },
  { symbol: "APOLLOTYRE", name: "Apollo Tyres", sector: "Auto Ancillary" },
  { symbol: "MRF", name: "MRF Tyres", sector: "Auto Ancillary" },
  // Finance & NBFC
  { symbol: "ABCAPITAL", name: "Aditya Birla Capital", sector: "Finance" },
  { symbol: "MUTHOOTFIN", name: "Muthoot Finance", sector: "Finance" },
  { symbol: "CHOLAFIN", name: "Cholamandalam Investment", sector: "Finance" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance", sector: "Finance" },
  { symbol: "HDFCLIFE", name: "HDFC Life Insurance", sector: "Insurance" },
  { symbol: "SBILIFE", name: "SBI Life Insurance", sector: "Insurance" },
  { symbol: "ICICIPRULI", name: "ICICI Prudential Life", sector: "Insurance" },
  // IT & Tech
  { symbol: "LTIM", name: "LTIMindtree", sector: "IT" },
  { symbol: "PERSISTENT", name: "Persistent Systems", sector: "IT" },
  { symbol: "COFORGE", name: "Coforge", sector: "IT" },
  { symbol: "MPHASIS", name: "Mphasis", sector: "IT" },
  { symbol: "FRACTAL", name: "Fractal Analytics Ltd", sector: "IT" },
  { symbol: "ZOMATO", name: "Zomato", sector: "Consumer Tech" },
  { symbol: "PAYTM", name: "One97 Communications (Paytm)", sector: "Fintech" },
  { symbol: "NYKAA", name: "FSN E-Commerce (Nykaa)", sector: "Consumer Tech" },
  // Banking
  { symbol: "BANKBARODA", name: "Bank of Baroda", sector: "Banking" },
  { symbol: "CANBK", name: "Canara Bank", sector: "Banking" },
  { symbol: "PNB", name: "Punjab National Bank", sector: "Banking" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank", sector: "Banking" },
  { symbol: "FEDERALBNK", name: "Federal Bank", sector: "Banking" },
  // Pharma
  { symbol: "CIPLA", name: "Cipla", sector: "Pharma" },
  { symbol: "AUROPHARMA", name: "Aurobindo Pharma", sector: "Pharma" },
  { symbol: "LUPIN", name: "Lupin", sector: "Pharma" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  // Infrastructure & Capital Goods
  { symbol: "ADANIPORTS", name: "Adani Ports", sector: "Infrastructure" },
  { symbol: "ADANIGREEN", name: "Adani Green Energy", sector: "Power" },
  { symbol: "SIEMENS", name: "Siemens India", sector: "Capital Goods" },
  { symbol: "ABB", name: "ABB India", sector: "Capital Goods" },
  { symbol: "HAVELLS", name: "Havells India", sector: "Capital Goods" },
  // FMCG & Consumer
  { symbol: "BRITANNIA", name: "Britannia Industries", sector: "FMCG" },
  { symbol: "DABUR", name: "Dabur India", sector: "FMCG" },
  { symbol: "MARICO", name: "Marico", sector: "FMCG" },
  { symbol: "COLPAL", name: "Colgate-Palmolive India", sector: "FMCG" },
  { symbol: "TATACONSUM", name: "Tata Consumer Products", sector: "FMCG" },
  // Metals & Mining
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals" },
  { symbol: "HINDALCO", name: "Hindalco Industries", sector: "Metals" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Mining" },
  { symbol: "VEDL", name: "Vedanta", sector: "Metals" },
  // Real Estate
  { symbol: "DLF", name: "DLF", sector: "Real Estate" },
  { symbol: "OBEROIRLTY", name: "Oberoi Realty", sector: "Real Estate" },
  { symbol: "PRESTIGE", name: "Prestige Estates", sector: "Real Estate" },
  // ETFs
  { symbol: "GOLDBEES", name: "Nippon India ETF Gold Bees", sector: "ETF" },
  { symbol: "SILVERBEES", name: "Nippon India Silver ETF", sector: "ETF" },
  { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty BeES", sector: "ETF" },
  { symbol: "JUNIORBEES", name: "Nippon India ETF Junior BeES", sector: "ETF" },
  { symbol: "BANKBEES", name: "Nippon India ETF Bank BeES", sector: "ETF" },
  { symbol: "ICICIB22", name: "ICICI Prudential Nifty Next 50 ETF", sector: "ETF" },
  // Power Finance / PSU
  { symbol: "RECLTD",     name: "REC Limited (Rural Electrification Corporation)", sector: "Power Finance" },
  { symbol: "PFC",        name: "Power Finance Corporation", sector: "Power Finance" },
  { symbol: "HINDCOPPER", name: "Hindustan Copper", sector: "Metals" },
  // Power & Energy
  { symbol: "TATAPOWER",  name: "Tata Power Company", sector: "Power" },
  { symbol: "SUZLON",     name: "Suzlon Energy", sector: "Power" },
  { symbol: "RPOWER",     name: "Reliance Power", sector: "Power" },
  // Telecom / Tech
  { symbol: "ONMOBILE",   name: "OnMobile Global", sector: "Technology" },
  // InvITs / REITs
  { symbol: "PGINVIT",    name: "PowerGrid Infrastructure InvIT", sector: "InvIT" },
  { symbol: "INDIGRID",   name: "India Grid Trust", sector: "InvIT" },
  { symbol: "EMBASSY",    name: "Embassy Office Parks REIT", sector: "REIT" },
  { symbol: "MINDSPACE",  name: "Mindspace Business Parks REIT", sector: "REIT" },
  { symbol: "BAGMANE-RR", name: "Bagmane Prime Office REIT", sector: "REIT" },
  { symbol: "BIRET",      name: "Brookfield India Real Estate Trust", sector: "REIT" },
  // Consumer / Tech
  { symbol: "IDEA",       name: "Vodafone Idea", sector: "Telecom" },
  { symbol: "AMARAJABAT", name: "Amara Raja Energy & Mobility", sector: "Auto Ancillary" },
  { symbol: "EXIDEIND",   name: "Exide Industries", sector: "Auto Ancillary" },
  // Additional stocks
  { symbol: "RIIT", name: "Raajmarg Infra Investment Trust", sector: "Infrastructure" },
];

// Aliases for common short-names / abbreviations that differ from the NSE symbol
const SEARCH_ALIASES: Record<string, string> = {
  "REC": "RECLTD",
  "RURAL ELECTRIFICATION": "RECLTD",
  "POWER FINANCE": "PFC",
  "POWER GRID": "POWERGRID",
  "VODAFONE": "IDEA",
  "AMARA RAJA": "AMARAJABAT",
  "AMARARAJA": "AMARAJABAT",
  "TATA POWER": "TATAPOWER",
};

export function resolveSearchSymbol(input: string): string {
  const upper = input.toUpperCase().trim();
  if (SEARCH_ALIASES[upper]) return SEARCH_ALIASES[upper];
  const exact = POPULAR_INDIAN_STOCKS.find((s) => s.symbol.toUpperCase() === upper);
  return exact ? exact.symbol : upper;
}

export const INDIAN_SECTORS = [
  "IT", "Banking", "Finance", "Energy", "FMCG", "Auto", "Pharma",
  "Telecom", "Infrastructure", "Cement", "Power", "Metals", "Paints",
  "Consumer", "Conglomerate", "Real Estate", "Insurance", "Media", "Other"
];

export const INDIAN_BROKERS = [
  "Zerodha", "Groww", "Upstox", "Angel One", "HDFC Securities",
  "ICICI Direct", "Sharekhan", "Kotak Securities", "SBI Securities",
  "Motilal Oswal", "5paisa", "Paytm Money", "Other"
];

export const NIFTY50_SYMBOLS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR",
  "SBIN", "BHARTIARTL", "BAJFINANCE", "KOTAKBANK", "LT", "AXISBANK",
  "ASIANPAINT", "MARUTI", "SUNPHARMA", "TATAMOTORS", "WIPRO",
  "ULTRACEMCO", "ADANIENT", "ONGC", "NTPC", "POWERGRID", "ITC",
  "HCLTECH", "TECHM", "DRREDDY", "DIVISLAB", "BAJAJFINSV", "NESTLEIND", "TITAN"
];
