-- Migration: Portfolio Profiles, Transactions, Import History, Portfolio Snapshots
-- Adds multi-portfolio support while preserving all existing data

-- ── 1. Create Portfolio table ──────────────────────────────────────────────────
CREATE TABLE "Portfolio" (
    "id"          TEXT    NOT NULL,
    "name"        TEXT    NOT NULL,
    "broker"      TEXT,
    "description" TEXT,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

-- Insert the default portfolio with a known stable ID so existing data migrates cleanly
INSERT INTO "Portfolio" ("id", "name", "isDefault", "createdAt", "updatedAt")
VALUES ('default-portfolio', 'Default Portfolio', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ── 2. Add portfolioId to Holding ─────────────────────────────────────────────
ALTER TABLE "Holding" ADD COLUMN "portfolioId" TEXT REFERENCES "Portfolio"("id") ON DELETE CASCADE;
UPDATE "Holding" SET "portfolioId" = 'default-portfolio' WHERE "portfolioId" IS NULL;

-- ── 3. Create Transaction table ───────────────────────────────────────────────
CREATE TABLE "Transaction" (
    "id"          TEXT    NOT NULL,
    "portfolioId" TEXT    NOT NULL,
    "holdingId"   TEXT,
    "symbol"      TEXT    NOT NULL,
    "name"        TEXT    NOT NULL,
    "type"        TEXT    NOT NULL,
    "shares"      REAL    NOT NULL,
    "price"       REAL    NOT NULL,
    "amount"      REAL    NOT NULL,
    "brokerage"   REAL,
    "date"        TEXT    NOT NULL,
    "exchange"    TEXT    NOT NULL DEFAULT 'NSE',
    "notes"       TEXT,
    "importId"    TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE,
    CONSTRAINT "Transaction_holdingId_fkey"   FOREIGN KEY ("holdingId")   REFERENCES "Holding"("id")
);

-- ── 4. Add portfolioId to Watchlist ───────────────────────────────────────────
ALTER TABLE "Watchlist" ADD COLUMN "portfolioId" TEXT REFERENCES "Portfolio"("id") ON DELETE CASCADE;
UPDATE "Watchlist" SET "portfolioId" = 'default-portfolio' WHERE "portfolioId" IS NULL;

-- Drop the old global-unique index; uniqueness is now scoped to portfolioId + name (enforced in app layer)
DROP INDEX IF EXISTS "Watchlist_name_key";

-- ── 5. Update AIAnalysis ──────────────────────────────────────────────────────
ALTER TABLE "AIAnalysis" ADD COLUMN "portfolioId" TEXT REFERENCES "Portfolio"("id");
ALTER TABLE "AIAnalysis" ADD COLUMN "timeframe"   TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE "AIAnalysis" ADD COLUMN "reasoning"   TEXT;
UPDATE "AIAnalysis" SET "portfolioId" = 'default-portfolio' WHERE "portfolioId" IS NULL;

-- ── 6. Create ImportHistory table ─────────────────────────────────────────────
CREATE TABLE "ImportHistory" (
    "id"          TEXT    NOT NULL,
    "portfolioId" TEXT    NOT NULL,
    "broker"      TEXT    NOT NULL,
    "fileType"    TEXT    NOT NULL,
    "fileName"    TEXT    NOT NULL,
    "rowCount"    INTEGER NOT NULL,
    "status"      TEXT    NOT NULL DEFAULT 'SUCCESS',
    "notes"       TEXT,
    "importedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "ImportHistory_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
);

-- ── 7. Create PortfolioSnapshot table ─────────────────────────────────────────
CREATE TABLE "PortfolioSnapshot" (
    "id"          TEXT    NOT NULL,
    "portfolioId" TEXT    NOT NULL,
    "date"        TEXT    NOT NULL,
    "totalValue"  REAL    NOT NULL,
    "totalCost"   REAL    NOT NULL,
    "healthScore" REAL    NOT NULL,
    "data"        TEXT    NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id"),
    CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "PortfolioSnapshot_portfolioId_date_key" ON "PortfolioSnapshot"("portfolioId", "date");
