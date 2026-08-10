"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export const ALL_PORTFOLIOS_ID = "__ALL__";
export const FAMILY_PREFIX     = "__FAMILY__";
export const BROKER_PREFIX     = "__BROKER__";

export type PortfolioSummary = {
  id: string;
  name: string;
  familyGroup: string | null;
  broker: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { holdings: number; transactions: number };
};

export type FamilyGroup = { name: string; portfolios: PortfolioSummary[] };
export type BrokerGroup = { name: string; portfolios: PortfolioSummary[] };

export type SelectorMode = "family" | "broker";

type PortfolioContextValue = {
  portfolios: PortfolioSummary[];
  activePortfolio: PortfolioSummary | null;
  activePortfolioId: string | null;
  activePortfolioLabel: string;
  activePortfolioSub: string;
  setActivePortfolio: (id: string) => void;
  refreshPortfolios: () => Promise<void>;
  loading: boolean;
  selectorMode: SelectorMode;
  setSelectorMode: (m: SelectorMode) => void;
  familyGroups: FamilyGroup[];
  brokerGroups: BrokerGroup[];
  ungroupedPortfolios: PortfolioSummary[];
  noBrokerPortfolios: PortfolioSummary[];
};

const PortfolioContext = createContext<PortfolioContextValue>({
  portfolios: [],
  activePortfolio: null,
  activePortfolioId: null,
  activePortfolioLabel: "Portfolio",
  activePortfolioSub: "",
  setActivePortfolio: () => {},
  refreshPortfolios: async () => {},
  loading: true,
  selectorMode: "family",
  setSelectorMode: () => {},
  familyGroups: [],
  brokerGroups: [],
  ungroupedPortfolios: [],
  noBrokerPortfolios: [],
});

const STORAGE_KEY      = "raios_active_portfolio";
const MODE_STORAGE_KEY = "raios_selector_mode";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([]);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selectorMode, setSelectorModeState] = useState<SelectorMode>("family");

  const setSelectorMode = useCallback((m: SelectorMode) => {
    setSelectorModeState(m);
    if (typeof window !== "undefined") localStorage.setItem(MODE_STORAGE_KEY, m);
  }, []);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolios");
      if (!res.ok) return;
      const data: PortfolioSummary[] = await res.json();
      setPortfolios(data);

      // Restore selector mode
      const storedMode = typeof window !== "undefined" ? localStorage.getItem(MODE_STORAGE_KEY) : null;
      if (storedMode === "family" || storedMode === "broker") setSelectorModeState(storedMode);

      // Restore active selection
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      let validId: string | null = null;

      if (stored === ALL_PORTFOLIOS_ID && data.length > 1) {
        validId = ALL_PORTFOLIOS_ID;
      } else if (stored?.startsWith(FAMILY_PREFIX)) {
        const family = stored.slice(FAMILY_PREFIX.length);
        if (data.some(p => p.familyGroup === family)) validId = stored;
      } else if (stored?.startsWith(BROKER_PREFIX)) {
        const broker = stored.slice(BROKER_PREFIX.length);
        if (data.some(p => p.broker === broker)) validId = stored;
      } else if (stored && data.find(p => p.id === stored)) {
        validId = stored;
      }

      const defaultId = data.find(p => p.isDefault)?.id ?? data[0]?.id ?? null;
      setActiveId(validId ?? defaultId);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPortfolios(); }, [fetchPortfolios]);

  const setActivePortfolio = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activePortfolio = portfolios.find(p => p.id === activeId) ?? null;

  // Computed groups
  const familyGroups = useMemo<FamilyGroup[]>(() => {
    const map = new Map<string, PortfolioSummary[]>();
    for (const p of portfolios) {
      if (p.familyGroup) {
        const arr = map.get(p.familyGroup) ?? [];
        arr.push(p);
        map.set(p.familyGroup, arr);
      }
    }
    return Array.from(map.entries()).map(([name, ps]) => ({ name, portfolios: ps }));
  }, [portfolios]);

  const brokerGroups = useMemo<BrokerGroup[]>(() => {
    const map = new Map<string, PortfolioSummary[]>();
    for (const p of portfolios) {
      if (p.broker) {
        const arr = map.get(p.broker) ?? [];
        arr.push(p);
        map.set(p.broker, arr);
      }
    }
    return Array.from(map.entries()).map(([name, ps]) => ({ name, portfolios: ps }));
  }, [portfolios]);

  const ungroupedPortfolios = useMemo(
    () => portfolios.filter(p => !p.familyGroup),
    [portfolios]
  );

  const noBrokerPortfolios = useMemo(
    () => portfolios.filter(p => !p.broker),
    [portfolios]
  );

  // Human-readable label for the active selection
  const { activePortfolioLabel, activePortfolioSub } = useMemo(() => {
    if (!activeId) return { activePortfolioLabel: "Select Portfolio", activePortfolioSub: "" };
    if (activeId === ALL_PORTFOLIOS_ID) {
      return { activePortfolioLabel: "All Portfolios", activePortfolioSub: `${portfolios.length} portfolios combined` };
    }
    if (activeId.startsWith(FAMILY_PREFIX)) {
      const family = activeId.slice(FAMILY_PREFIX.length);
      const count  = portfolios.filter(p => p.familyGroup === family).length;
      return { activePortfolioLabel: `${family} — Combined`, activePortfolioSub: `${count} sub-portfolios` };
    }
    if (activeId.startsWith(BROKER_PREFIX)) {
      const broker = activeId.slice(BROKER_PREFIX.length);
      const count  = portfolios.filter(p => p.broker === broker).length;
      return { activePortfolioLabel: `All ${broker}`, activePortfolioSub: `${count} portfolios` };
    }
    const p = portfolios.find(p => p.id === activeId);
    return {
      activePortfolioLabel: p?.name ?? "Portfolio",
      activePortfolioSub: p?.broker ?? (p?.familyGroup ? `${p.familyGroup} family` : ""),
    };
  }, [activeId, portfolios]);

  return (
    <PortfolioContext.Provider
      value={{
        portfolios,
        activePortfolio,
        activePortfolioId: activeId,
        activePortfolioLabel,
        activePortfolioSub,
        setActivePortfolio,
        refreshPortfolios: fetchPortfolios,
        loading,
        selectorMode,
        setSelectorMode,
        familyGroups,
        brokerGroups,
        ungroupedPortfolios,
        noBrokerPortfolios,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  return useContext(PortfolioContext);
}
