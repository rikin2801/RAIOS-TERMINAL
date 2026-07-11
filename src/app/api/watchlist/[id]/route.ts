import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/watchlist/[id]?type=item|list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") ?? "item";

  if (type === "list") {
    await prisma.watchlist.delete({ where: { id } });
  } else {
    await prisma.watchlistItem.delete({ where: { id } });
  }
  return NextResponse.json({ success: true });
}
