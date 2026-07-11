import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultPortfolio } from "@/lib/portfolio";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  broker: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  await getOrCreateDefaultPortfolio();
  const portfolios = await prisma.portfolio.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { holdings: true, transactions: true } },
    },
  });
  return NextResponse.json(portfolios);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, broker, description, isDefault } = parsed.data;

  // If making this the default, unset others
  if (isDefault) {
    await prisma.portfolio.updateMany({ data: { isDefault: false } });
  }

  const portfolio = await prisma.portfolio.create({
    data: { name, broker, description, isDefault: isDefault ?? false },
  });
  return NextResponse.json(portfolio, { status: 201 });
}
