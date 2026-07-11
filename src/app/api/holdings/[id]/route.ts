import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase().optional(),
  name: z.string().min(1).optional(),
  shares: z.number().positive().optional(),
  avgCost: z.number().positive().optional(),
  sector: z.string().optional(),
  notes: z.string().optional(),
  exchange: z.enum(["NSE", "BSE"]).optional(),
  purchaseDate: z.string().optional(),
  broker: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const holding = await prisma.holding.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(holding);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.holding.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
