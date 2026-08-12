import { createClient } from '@libsql/client';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'prisma', 'dev.db');

const TURSO_URL = process.env.DATABASE_URL ?? "libsql://raios-terminal-rikin2801.aws-ap-south-1.turso.io";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM3NzAxNTEsImlkIjoiMDE5ZjUwZmItODQwMS03NDY1LThkOTYtOWEzNjUxZDgxMWE0Iiwia2lkIjoiY3ZWT0E2TDZ1YjAyUVFCb3lyX2VRTldmaUtJSkVwYm1QVEtudThoYzFUTSIsInJpZCI6ImY4NmE0NDk4LTg4ZDctNDY1Mi1iYTVmLTU0MWFjNDBkM2EwOCJ9.drnpYYLZPhbz16vgKnfJ9fz8PgyxqzBTNvfoFy510UrRWEZChIUa6tzss-qgTEqGzVn5qoWXrDmOdfQNfojBBQ";

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

function q(query) {
  const result = execSync(`sqlite3 -json "${dbPath}" "${query.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
  return result.trim() ? JSON.parse(result) : [];
}

async function createSchema() {
  console.log('Creating schema on Turso...\n');
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Portfolio" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "familyGroup" TEXT,
      "broker" TEXT,
      "description" TEXT,
      "isDefault" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "Holding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT,
      "symbol" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "shares" REAL NOT NULL,
      "avgCost" REAL NOT NULL,
      "sector" TEXT,
      "notes" TEXT,
      "exchange" TEXT NOT NULL DEFAULT 'NSE',
      "purchaseDate" TEXT,
      "broker" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Transaction" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT NOT NULL,
      "holdingId" TEXT,
      "symbol" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "shares" REAL NOT NULL,
      "price" REAL NOT NULL,
      "amount" REAL NOT NULL,
      "brokerage" REAL,
      "date" TEXT NOT NULL,
      "exchange" TEXT NOT NULL DEFAULT 'NSE',
      "notes" TEXT,
      "importId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Watchlist" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT,
      "name" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "WatchlistItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "symbol" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "watchlistId" TEXT NOT NULL,
      "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WatchlistItem_symbol_watchlistId_key" ON "WatchlistItem"("symbol", "watchlistId")`,
    `CREATE TABLE IF NOT EXISTS "AIAnalysis" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT,
      "symbol" TEXT NOT NULL,
      "timeframe" TEXT NOT NULL DEFAULT 'DAILY',
      "signal" TEXT NOT NULL,
      "confidence" REAL NOT NULL,
      "investmentScore" REAL NOT NULL,
      "risks" TEXT NOT NULL,
      "bullishFactors" TEXT NOT NULL,
      "bearishFactors" TEXT NOT NULL,
      "entryZone" TEXT NOT NULL,
      "stopLoss" REAL NOT NULL,
      "targetPrice" REAL NOT NULL,
      "summary" TEXT NOT NULL,
      "rawMetrics" TEXT NOT NULL,
      "reasoning" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "ImportHistory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT NOT NULL,
      "broker" TEXT NOT NULL,
      "fileType" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "rowCount" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'SUCCESS',
      "notes" TEXT,
      "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "portfolioId" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "totalValue" REAL NOT NULL,
      "totalCost" REAL NOT NULL,
      "healthScore" REAL NOT NULL,
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioSnapshot_portfolioId_date_key" ON "PortfolioSnapshot"("portfolioId", "date")`,
    `CREATE TABLE IF NOT EXISTS "PriceCache" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "symbol" TEXT NOT NULL,
      "data" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PriceCache_symbol_key" ON "PriceCache"("symbol")`,
  ];

  for (const sql of statements) {
    await turso.execute(sql);
  }
  console.log('  ✓ Schema ready\n');
}

async function migrate() {
  console.log('=== RAIOS Migration: dev.db → Turso ===\n');
  console.log(`Source: ${dbPath}`);
  console.log(`Target: ${TURSO_URL}\n`);

  await createSchema();

  // 1. Portfolios
  const portfolios = q('SELECT * FROM Portfolio');
  console.log(`Migrating ${portfolios.length} portfolios...`);
  for (const p of portfolios) {
    try {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO Portfolio (id, name, familyGroup, broker, description, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.familyGroup ?? null, p.broker ?? null, p.description ?? null, p.isDefault ? 1 : 0, p.createdAt, p.updatedAt]
      });
      console.log(`  ✓ ${p.name}${p.familyGroup ? ` [${p.familyGroup}]` : ''}`);
    } catch (e) {
      console.log(`  ✗ ${p.name}: ${e.message.slice(0, 100)}`);
    }
  }

  // 2. Holdings (shares, not quantity; no industry/isin)
  const holdings = q('SELECT * FROM Holding');
  console.log(`\nMigrating ${holdings.length} holdings...`);
  for (const h of holdings) {
    try {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO Holding (id, portfolioId, symbol, name, shares, avgCost, sector, notes, exchange, purchaseDate, broker, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [h.id, h.portfolioId ?? null, h.symbol, h.name ?? h.symbol, h.shares ?? h.quantity ?? 0, h.avgCost, h.sector ?? null, h.notes ?? null, h.exchange ?? 'NSE', h.purchaseDate ?? null, h.broker ?? null, h.createdAt, h.updatedAt]
      });
      console.log(`  ✓ ${h.symbol} (${h.shares ?? h.quantity} shares @ ₹${h.avgCost})`);
    } catch (e) {
      console.log(`  ✗ ${h.symbol}: ${e.message.slice(0, 100)}`);
    }
  }

  // 3. Transactions
  const transactions = q('SELECT * FROM "Transaction"');
  console.log(`\nMigrating ${transactions.length} transactions...`);
  for (const t of transactions) {
    try {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO "Transaction" (id, portfolioId, holdingId, symbol, name, type, shares, price, amount, brokerage, date, exchange, notes, importId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [t.id, t.portfolioId, t.holdingId ?? null, t.symbol, t.name, t.type, t.shares ?? t.quantity ?? 0, t.price, t.amount, t.brokerage ?? null, t.date, t.exchange ?? 'NSE', t.notes ?? null, t.importId ?? null, t.createdAt]
      });
      console.log(`  ✓ ${t.type} ${t.symbol}`);
    } catch (e) {
      console.log(`  ✗ ${t.symbol}: ${e.message.slice(0, 100)}`);
    }
  }

  // 4. Watchlists (with portfolioId, no updatedAt)
  const watchlists = q('SELECT * FROM Watchlist');
  console.log(`\nMigrating ${watchlists.length} watchlists...`);
  for (const w of watchlists) {
    try {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO Watchlist (id, portfolioId, name, createdAt) VALUES (?, ?, ?, ?)`,
        args: [w.id, w.portfolioId ?? null, w.name, w.createdAt]
      });
      console.log(`  ✓ ${w.name}`);
    } catch (e) {
      console.log(`  ✗ ${w.name}: ${e.message.slice(0, 100)}`);
    }
  }

  // 5. WatchlistItems
  const items = q('SELECT * FROM WatchlistItem');
  console.log(`\nMigrating ${items.length} watchlist items...`);
  for (const i of items) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO WatchlistItem (id, symbol, name, watchlistId, addedAt) VALUES (?, ?, ?, ?, ?)`,
        args: [i.id, i.symbol, i.name ?? i.symbol, i.watchlistId, i.addedAt ?? i.createdAt]
      });
      console.log(`  ✓ ${i.symbol}`);
    } catch (e) {
      console.log(`  ✗ ${i.symbol}: ${e.message.slice(0, 100)}`);
    }
  }

  console.log('\n=== Migration complete! ===');
  console.log('AIAnalysis, PriceCache, PortfolioSnapshot skipped (will regenerate on first use).');
}

migrate().catch(console.error);
