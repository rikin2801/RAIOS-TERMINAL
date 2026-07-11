import { prisma } from "@/lib/prisma";

export type PortfolioRecord = {
  id: string;
  name: string;
  broker: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Returns the default portfolio, creating it if none exists.
// Also backfills any holdings/watchlists with no portfolioId.
export async function getOrCreateDefaultPortfolio(): Promise<PortfolioRecord> {
  // Try to find existing default
  let portfolio = await prisma.portfolio.findFirst({
    where: { isDefault: true },
    orderBy: { createdAt: "asc" },
  });

  if (!portfolio) {
    // Create the default portfolio
    portfolio = await prisma.portfolio.create({
      data: {
        id: "default-portfolio",
        name: "Default Portfolio",
        isDefault: true,
      },
    });
  }

  // Backfill any orphaned records (shouldn't happen after migration, but safety net)
  await Promise.all([
    prisma.holding.updateMany({
      where: { portfolioId: null },
      data: { portfolioId: portfolio.id },
    }),
    prisma.watchlist.updateMany({
      where: { portfolioId: null },
      data: { portfolioId: portfolio.id },
    }),
    prisma.aIAnalysis.updateMany({
      where: { portfolioId: null },
      data: { portfolioId: portfolio.id },
    }),
  ]);

  return portfolio;
}

// Resolve portfolioId from request: if provided use it, else use default
export async function resolvePortfolioId(portfolioId?: string | null): Promise<string> {
  if (portfolioId) return portfolioId;
  const p = await getOrCreateDefaultPortfolio();
  return p.id;
}
