import { NextRequest, NextResponse } from "next/server";
import { getStockNews } from "@/lib/news";

// Re-export so existing imports from this path still work
export type { NewsItem } from "@/lib/news";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const name = searchParams.get("name") ?? symbol;

  if (!symbol) return NextResponse.json([]);

  const items = await getStockNews(symbol, name);
  return NextResponse.json(items);
}
