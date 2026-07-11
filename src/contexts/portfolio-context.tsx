"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export type PortfolioSummary = {
  id: string;
  name: string;
  broker: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { holdings: number; transactions: number };
};

type PortfolioContextValue = {
  portfolios: PortfolioSummary[];
  activePortfolio: PortfolioSummary | null;
  activePortfolioId: string | null;
  setActivePortfolio: (id: string) => void;
  refreshPortfolios: () => Promise<void>;
  loading: boolean;
};

const PortfolioContext = createContext<PortfolioContextValue>({
  portfolios: [],
  activePortfolio: null,
  activePortfolioId: null,
  setActivePortfolio: () => {},
  refreshPortfolios: async () => {},
  loading: true,
});

const STORAGE_KEY = "raios_active_portfolio";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolios");
      if (!res.ok) return;
      const data: PortfolioSummary[] = await res.json();
      setPortfolios(data);

      // Restore from localStorage, else use default
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
      const validId = stored && data.find((p) => p.id === stored) ? stored : null;
      const defaultId = data.find((p) => p.isDefault)?.id ?? data[0]?.id ?? null;
      setActiveId(validId ?? defaultId);
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPortfolios(); }, [fetchPortfolios]);

  const setActivePortfolio = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activePortfolio = portfolios.find((p) => p.id === activeId) ?? null;

  return (
    <PortfolioContext.Provider
      value={{
        portfolios,
        activePortfolio,
        activePortfolioId: activeId,
        setActivePortfolio,
        refreshPortfolios: fetchPortfolios,
        loading,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  return useContext(PortfolioContext);
}
