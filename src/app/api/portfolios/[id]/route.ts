import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  familyGroup: z.string().max(50).nullable().optional(),
  broker: z.string().max(100).nullable().optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const portfolio = await prisma.portfolio.findUnique({
    where: { id },
    include: {
      _count: { select: { holdings: true, transactions: true, importHistory: true } },
    },
  });
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(portfolio);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { isDefault, ...rest } = parsed.data;
  if (isDefault) {
    await prisma.portfolio.updateMany({ data: { isDefault: false } });
  }
  const portfolio = await prisma.portfolio.update({
    where: { id },
    data: { ...rest, ...(isDefault !== undefined ? { isDefault } : {}) },
  });
  return NextResponse.json(portfolio);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  // Prevent deleting the only portfolio
  const count = await prisma.portfolio.count();
  if (count <= 1) {
    return NextResponse.json({ error: "Cannot delete the only portfolio" }, { status: 400 });
  }
  await prisma.portfolio.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
