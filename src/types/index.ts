export interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  sector?: string | null;
  notes?: string | null;
  exchange: string;
  purchaseDate?: string | null;
  broker?: string | null;
  portfolioId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HoldingWithMarket extends Holding {
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  gainLoss: number;
  gainLossPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface Portfolio {
  id: string;
  name: string;
  broker: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { holdings: number; transactions: number };
}

export interface Transaction {
  id: string;
  portfolioId: string;
  holdingId?: string | null;
  symbol: string;
  name: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "BONUS" | "SPLIT" | "RIGHTS";
  shares: number;
  price: number;
  amount: number;
  brokerage?: number | null;
  date: string;
  exchange: string;
  notes?: string | null;
  importId?: string | null;
  createdAt: Date;
}

export interface ImportHistory {
  id: string;
  portfolioId: string;
  broker: string;
  fileType: string;
  fileName: string;
  rowCount: number;
  status: string;
  notes?: string | null;
  importedAt: Date;
}

export interface Watchlist {
  id: string;
  name: string;
  portfolioId?: string | null;
  items: WatchlistItem[];
  createdAt: Date;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  watchlistId: string;
  addedAt: Date;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  avgVolume?: number;
  pe?: number;
  eps?: number;
  dividend?: number;
  dividendYield?: number;
  beta?: number;
  shortName?: string;
  faceValue?: number;
  bookValue?: number;
  priceToBook?: number;
  roce?: number;
  promoterHolding?: number;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  stochastic: number;
  stochasticSignal: number;
  sma50: number;
  sma200: number;
  trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  support: number;
  resistance: number;
}

export interface FundamentalData {
  pe?: number;
  eps?: number;
  revenue?: number;
  revenueGrowth?: number;
  netIncome?: number;
  netMargin?: number;
  roe?: number;
  roce?: number;
  debtToEquity?: number;
  currentRatio?: number;
  freeCashFlow?: number;
  dividendYield?: number;
  bookValue?: number;
  priceToBook?: number;
  promoterHolding?: number;
  fiiHolding?: number;
  diiHolding?: number;
  publicHolding?: number;
  // Analyst consensus (from Yahoo Finance financialData)
  analystTarget?: number;
  analystCount?: number;
  analystConsensus?: string; // "strong_buy" | "buy" | "hold" | "sell" | "strong_sell"
}

// ── Explainable AI types ───────────────────────────────────────────────────────

export interface ExplainableIndicator {
  name: string;
  value: string;           // Formatted display value
  interpretation: string;  // What this value means for this stock
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface AIAnalysisResult {
  signal: "BUY" | "HOLD" | "SELL" | "ACCUMULATE" | "REDUCE";
  confidence: number;
  investmentScore: number;
  risks: string[];
  bullishFactors: string[];
  bearishFactors: string[];
  entryZone: string;
  stopLoss: number;
  targetPrice: number;
  summary: string;

  // Explainable AI fields
  recommendation?: string;        // Full recommendation sentence
  reasoning?: string;             // Why this recommendation
  whyNow?: string;                // Why this is actionable now
  whatCouldInvalidate?: string;   // What would change this recommendation
  holdingPeriod?: string;         // Suggested holding period
  expectedReward?: string;        // Upside scenario
  expectedRisk?: string;          // Downside scenario

  technicalSnapshot?: {
    rsi: ExplainableIndicator;
    macd: ExplainableIndicator;
    stochastic: ExplainableIndicator;
    sma50: ExplainableIndicator;
    sma200: ExplainableIndicator;
    trend: ExplainableIndicator;
    support: ExplainableIndicator;
    resistance: ExplainableIndicator;
    momentum: ExplainableIndicator;
  };

  fundamentalSnapshot?: {
    pe?: ExplainableIndicator;
    pb?: ExplainableIndicator;
    roe?: ExplainableIndicator;
    debtToEquity?: ExplainableIndicator;
    revenueGrowth?: ExplainableIndicator;
    netMargin?: ExplainableIndicator;
    dividendYield?: ExplainableIndicator;
  };
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayGainLoss: number;
  dayGainLossPercent: number;
  holdingsCount: number;
  healthScore: number;
  riskScore?: number;
}

export interface SectorAllocation {
  sector: string;
  value: number;
  percent: number;
  color: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type AnalysisTimeframe = "DAILY" | "WEEKLY" | "MONTHLY";

// ── Phase 1 Analysis (RAIOS Decision Engine v1) ───────────────────────────────

export interface Phase1TrendResult {
  trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  evidence: string;
}

export interface Phase1AnalysisResult {
  // Gemini decision
  decision: "BUY" | "WAIT" | "HOLD" | "BOOK_PROFITS" | "SELL";
  whatChanged: string;
  whyDecision: string[];
  whatWouldChange: string[];
  targets: {
    oneMonth: { low: number; high: number };
    threeMonths: { low: number; high: number };
    sixMonths: { low: number; high: number };
    oneYear: { low: number; high: number };
  };

  // Server-computed trend (HH/HL analysis)
  trend: {
    oneMonth: Phase1TrendResult;
    threeMonths: Phase1TrendResult;
    sixMonths: Phase1TrendResult;
    oneYear: Phase1TrendResult;
    primary: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  };

  // Business health and price attractiveness
  businessHealth: "STRONG" | "STABLE" | "WEAK";
  businessSummary: string;
  priceAttractiveness: "ATTRACTIVE" | "FAIRLY_VALUED" | "EXPENSIVE";
  priceSummary: string;

  // Entry zone (from price structure)
  entryZone: { low: number; high: number };
  confirmationLevel: number;
  support: number;
  resistance: number;

  // Technical context (supporting evidence only — not decision drivers)
  daily: { rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number };
  weekly: { rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number } | null;
  hourly: { rsi: number; macdHist: number; macdBullish: boolean; macdDir: "RISING" | "FALLING"; stochK: number } | null;

  // Analyst data (from Yahoo Finance)
  analystTarget: number | null;
  analystCount: number | null;
  analystConsensus: string | null;

  // Stock info
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  pe: number | null;
}

// ── Entry Point Screening ─────────────────────────────────────────────────────

export interface EntryScreenStep1 {
  weeklyTrend: "UP" | "SIDEWAYS" | "DOWN";
  weeklyTrendEvidence: string;
  macdCrossover: "PCO" | "NCO" | "NONE";
  macdZone: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
  macdHist: number;
  support: number;
  resistance: number;
}

export interface EntryScreenStep2 {
  bb: { upper: number; middle: number; lower: number; direction: "UP" | "DOWN" | "FLAT" } | null;
  rsi: { currentRSI: number; nearestLevel: number; action: "SUPPORT" | "RESISTANCE" | "NONE"; reversalDir: "UP" | "DOWN" | "NONE"; description: string };
  stochastic: { k: number; d: number; crossover: "PCO" | "NCO" | "NONE"; zone: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" };
  ema: { ema50: number; ema100: number; ema200: number; nearestEMA: 50 | 100 | 200 | null; status: string; description: string };
  hourly: {
    rsi: number;
    stochCrossover: "PCO" | "NCO" | "NONE";
    stochZone: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
    macdCrossover: "PCO" | "NCO" | "NONE";
    aligns: boolean;
    note: string;
  } | null;
}

export interface EntryScreenStep3 {
  pattern: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  description: string;
}

export interface EntryScreenResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  step1: EntryScreenStep1;
  step2: EntryScreenStep2;
  step3: EntryScreenStep3;
  // AI-determined outputs
  assessment: "ENTRY_CONFIRMED" | "DEVELOPING" | "NO_ENTRY";
  entryPrice: number | null;
  entryRangeHigh: number | null;
  entryBasis: string;
  stopLoss: number | null;
  stopBasis: string;
  target: number | null;
  targetBasis: string;
  bbSummary: string;
  rsiSummary: string;
  stochSummary: string;
  emaSummary: string;
  priceActionSummary: string;
  why: string[];
}

// ── Profit Booking Guidance ───────────────────────────────────────────────────

export type ProfitBookingStatus = "LET_PROFITS_RUN" | "WATCH" | "ALERT" | "EXIT";

export interface ProfitBookingTrigger {
  name: string;
  value: string;
  tag: string;
  severity: "green" | "amber" | "orange" | "red";
}

export interface ProfitBookingResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  rangePosition: number;
  status: ProfitBookingStatus;
  indicators: {
    rsi: number;
    stochastic: number;
    macdHistogram: number;
    sma50: number;
    sma200: number;
  };
  triggers: ProfitBookingTrigger[];
  reasoning: string[];
  suggestedAction: string;
}
