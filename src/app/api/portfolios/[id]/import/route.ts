import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBrokerFile, type BrokerHint } from "@/lib/broker-parsers";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/portfolios/[id]/import
// Body: FormData with 'file' (File), optional 'broker' (BrokerHint), optional 'preview' (boolean)
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: portfolioId } = await params;

  // Verify portfolio exists
  const portfolio = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const broker = (formData.get("broker") as BrokerHint | null) ?? "AUTO";
  const preview = formData.get("preview") === "true";
  const skipDuplicates = formData.get("skipDuplicates") !== "false";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseResult = await parseBrokerFile(buffer, file.name, broker);

  // If preview mode, return parsed data without saving
  if (preview) {
    return NextResponse.json({ parseResult, preview: true });
  }

  // Save to database
  if (parseResult.errors.length > 0 && !parseResult.holdings?.length && !parseResult.transactions?.length) {
    return NextResponse.json({ error: "Parse failed", details: parseResult.errors }, { status: 422 });
  }

  let holdingsImported = 0;
  let transactionsImported = 0;
  const importWarnings: string[] = [...parseResult.warnings];

  // Import holdings
  if (parseResult.holdings?.length) {
    for (const h of parseResult.holdings) {
      // Always clean up stale entries: same name, different (old/wrong) symbol
      const staleDupe = await prisma.holding.findFirst({
        where: {
          portfolioId,
          name: { equals: h.name, mode: "insensitive" },
          symbol: { not: h.symbol },
        },
      });
      if (staleDupe) {
        await prisma.holding.delete({ where: { id: staleDupe.id } });
        importWarnings.push(`${staleDupe.symbol} → ${h.symbol}: Replaced stale symbol for "${h.name}".`);
      }

      // Check for exact symbol duplicate (after stale cleanup)
      const exactDupe = await prisma.holding.findFirst({
        where: { portfolioId, symbol: h.symbol },
      });
      if (exactDupe) {
        if (skipDuplicates) {
          importWarnings.push(`${h.symbol}: Already exists in portfolio — skipped. Edit manually to update.`);
        }
        continue;
      }

      await prisma.holding.create({
        data: {
          portfolioId,
          symbol: h.symbol,
          name: h.name,
          shares: h.shares,
          avgCost: h.avgCost,
          sector: h.sector ?? null,
          exchange: h.exchange,
          broker: portfolio.broker ?? null,
        },
      });
      holdingsImported++;
    }
  }

  // Import transactions
  if (parseResult.transactions?.length) {
    const importHistoryId = generateId();
    for (const t of parseResult.transactions) {
      await prisma.transaction.create({
        data: {
          portfolioId,
          symbol: t.symbol,
          name: t.name,
          type: t.type,
          shares: t.shares,
          price: t.price,
          amount: t.amount,
          brokerage: t.brokerage ?? null,
          date: t.date,
          exchange: t.exchange,
          notes: t.notes ?? null,
          importId: importHistoryId,
        },
      });
      transactionsImported++;
    }
  }

  // Record import history
  const totalImported = holdingsImported + transactionsImported;
  const status = parseResult.errors.length > 0 || importWarnings.length > 0 ? "PARTIAL" : "SUCCESS";

  await prisma.importHistory.create({
    data: {
      portfolioId,
      broker: parseResult.broker,
      fileType: parseResult.fileType,
      fileName: file.name,
      rowCount: totalImported,
      status,
      notes: importWarnings.length > 0 ? importWarnings.slice(0, 5).join("; ") : null,
    },
  });

  return NextResponse.json({
    success: true,
    holdingsImported,
    transactionsImported,
    warnings: importWarnings,
    errors: parseResult.errors,
    broker: parseResult.broker,
    fileType: parseResult.fileType,
  });
}

// GET /api/portfolios/[id]/import — fetch import history for portfolio
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: portfolioId } = await params;
  const history = await prisma.importHistory.findMany({
    where: { portfolioId },
    orderBy: { importedAt: "desc" },
    take: 50,
  });
  return NextResponse.json(history);
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
