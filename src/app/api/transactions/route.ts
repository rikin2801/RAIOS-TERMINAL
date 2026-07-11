import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortfolioId } from "@/lib/portfolio";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const portfolioId = await resolvePortfolioId(searchParams.get("portfolioId"));
  const symbol = searchParams.get("symbol");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 500);

  const transactions = await prisma.transaction.findMany({
    where: {
      portfolioId,
      ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return NextResponse.json(transactions);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
