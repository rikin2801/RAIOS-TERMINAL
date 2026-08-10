import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId, holdingWhere } from "@/lib/portfolio";
import { z } from "zod";

const HoldingSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1),
  shares: z.number().positive(),
  avgCost: z.number().positive(),
  sector: z.string().optional(),
  notes: z.string().optional(),
  exchange: z.enum(["NSE", "BSE"]).default("NSE"),
  purchaseDate: z.string().optional(),
  broker: z.string().optional(),
  portfolioId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const rawId = req.nextUrl.searchParams.get("portfolioId");
  const where = await holdingWhere(rawId);
  const holdings = await prisma.holding.findMany({ where, orderBy: { createdAt: "asc" } });
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = HoldingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { portfolioId: rawPid, ...data } = parsed.data;
  const portfolioId = await resolvePortfolioId(rawPid);
  const holding = await prisma.holding.create({ data: { ...data, portfolioId } });
  return NextResponse.json(holding, { status: 201 });
}
