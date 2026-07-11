import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";
import { z } from "zod";

const DEFAULT_LISTS = ["Long Term", "Swing", "Dividend", "High Growth"];

const AddItemSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1),
  watchlistId: z.string(),
});

async function ensureDefaultWatchlists(portfolioId: string) {
  for (const name of DEFAULT_LISTS) {
    const existing = await prisma.watchlist.findFirst({ where: { name, portfolioId } });
    if (!existing) {
      await prisma.watchlist.create({ data: { name, portfolioId } });
    }
  }
}

export async function GET(req: NextRequest) {
  const portfolioId = await resolvePortfolioId(
    req.nextUrl.searchParams.get("portfolioId")
  );
  await ensureDefaultWatchlists(portfolioId);
  const lists = await prisma.watchlist.findMany({
    where: { portfolioId },
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { addedAt: "desc" } } },
  });
  return NextResponse.json(lists);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const portfolioId = await resolvePortfolioId(
    body.portfolioId ?? req.nextUrl.searchParams.get("portfolioId")
  );

  // Create new watchlist
  if (body.createList) {
    const name = z.string().min(1).max(50).parse(body.createList);
    // Check duplicate within portfolio
    const existing = await prisma.watchlist.findFirst({ where: { name, portfolioId } });
    if (existing) {
      return NextResponse.json({ error: "A watchlist with this name already exists" }, { status: 409 });
    }
    const list = await prisma.watchlist.create({ data: { name, portfolioId } });
    return NextResponse.json(list, { status: 201 });
  }

  const parsed = AddItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { symbol, name, watchlistId } = parsed.data;
  const item = await prisma.watchlistItem.upsert({
    where: { symbol_watchlistId: { symbol, watchlistId } },
    update: { name },
    create: { symbol, name, watchlistId },
  });
  return NextResponse.json(item, { status: 201 });
}
