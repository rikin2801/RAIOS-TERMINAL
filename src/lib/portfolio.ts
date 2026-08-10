import { prisma } from "@/lib/prisma";

export const FAMILY_PREFIX = "__FAMILY__";
export const BROKER_PREFIX = "__BROKER__";

export type PortfolioRecord = {
  id: string;
  name: string;
  familyGroup: string | null;
  broker: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Returns a Prisma where clause for filtering holdings by any selector ID,
// including virtual combined IDs (__ALL__, __FAMILY__xxx, __BROKER__xxx).
export async function holdingWhere(rawId: string | null) {
  if (rawId === "__ALL__") return {};
  if (rawId?.startsWith(FAMILY_PREFIX)) {
    const family = rawId.slice(FAMILY_PREFIX.length);
    const ps = await prisma.portfolio.findMany({ where: { familyGroup: family }, select: { id: true } });
    return { portfolioId: { in: ps.map(p => p.id) } };
  }
  if (rawId?.startsWith(BROKER_PREFIX)) {
    const broker = rawId.slice(BROKER_PREFIX.length);
    const ps = await prisma.portfolio.findMany({ where: { broker }, select: { id: true } });
    return { portfolioId: { in: ps.map(p => p.id) } };
  }
  return { portfolioId: await resolvePortfolioId(rawId) };
}

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
