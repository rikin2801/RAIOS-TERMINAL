"use client";

import { useState, useRef } from "react";
import {
  usePortfolio, ALL_PORTFOLIOS_ID, FAMILY_PREFIX, BROKER_PREFIX,
  type PortfolioSummary,
} from "@/contexts/portfolio-context";
import {
  ChevronDown, Plus, Briefcase, Check, Trash2, Layers, Users, Building2,
} from "lucide-react";

const KNOWN_BROKERS = ["ICICI Direct", "NJ Trading", "Zerodha", "HDFC Securities", "Groww", "Upstox", "Angel One"];

// ── Small colour dot per family / broker ──────────────────────────────────────
const GROUP_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#eab308", "#06b6d4"];
function groupColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % GROUP_COLORS.length;
  return GROUP_COLORS[h];
}

// ── Single portfolio row ──────────────────────────────────────────────────────
function PortfolioRow({
  p, active, onSelect, onDelete, indent = false,
}: {
  p: PortfolioSummary;
  active: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  indent?: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent ${active ? "bg-primary/10" : ""} ${indent ? "pl-7" : ""}`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${active ? "text-primary" : "text-foreground"}`}>{p.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {[p.broker, p.familyGroup ? `${p.familyGroup} family` : null].filter(Boolean).join(" · ")}
          {p._count ? ` · ${p._count.holdings} holdings` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {active && <Check className="h-3 w-3 text-primary" />}
        {!p.isDefault && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
    </div>
  );
}

// ── Combined virtual row (All RD, All ICICI Direct, etc.) ─────────────────────
function CombinedRow({
  label, sub, virtualId, activeId, color, onSelect,
}: {
  label: string; sub: string; virtualId: string; activeId: string | null; color: string; onSelect: (id: string) => void;
}) {
  const active = activeId === virtualId;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 mx-1 mb-1 rounded-md cursor-pointer transition-colors border ${
        active ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-accent hover:border-border"
      }`}
      onClick={() => onSelect(virtualId)}
    >
      <Layers className="h-3 w-3 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color }}>{label}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
      {active && <Check className="h-3 w-3 shrink-0" style={{ color }} />}
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────
function CreateForm({
  existingFamilies, existingBrokers, onCreate, onCancel,
}: {
  existingFamilies: string[];
  existingBrokers: string[];
  onCreate: (data: { name: string; familyGroup: string; broker: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName]               = useState("");
  const [familyGroup, setFamilyGroup] = useState("");
  const [broker, setBroker]           = useState("");
  const [creating, setCreating]       = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const allBrokers = Array.from(new Set([...KNOWN_BROKERS, ...existingBrokers]));

  const handle = async () => {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setCreating(true);
    try { await onCreate({ name: name.trim(), familyGroup: familyGroup.trim(), broker: broker.trim() }); }
    finally { setCreating(false); }
  };

  return (
    <div className="p-2 space-y-1.5 border-t border-border">
      <input
        ref={nameRef}
        autoFocus
        className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        placeholder="Portfolio name (e.g. RD-RDHF)"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handle()}
      />
      <div className="relative">
        <input
          list="family-list"
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          placeholder="Family group (e.g. RD) — optional"
          value={familyGroup}
          onChange={e => setFamilyGroup(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle()}
        />
        <datalist id="family-list">
          {existingFamilies.map(f => <option key={f} value={f} />)}
        </datalist>
      </div>
      <div className="relative">
        <input
          list="broker-list"
          className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
          placeholder="Broker (e.g. ICICI Direct) — optional"
          value={broker}
          onChange={e => setBroker(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle()}
        />
        <datalist id="broker-list">
          {allBrokers.map(b => <option key={b} value={b} />)}
        </datalist>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={handle}
          disabled={!name.trim() || creating}
          className="flex-1 bg-primary text-primary-foreground rounded py-1 text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {creating ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PortfolioSelector() {
  const {
    portfolios, activePortfolioId, activePortfolioLabel, activePortfolioSub,
    setActivePortfolio, refreshPortfolios, loading,
    selectorMode, setSelectorMode,
    familyGroups, brokerGroups, ungroupedPortfolios, noBrokerPortfolios,
  } = usePortfolio();

  const [open, setOpen]           = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const existingFamilies = familyGroups.map(g => g.name);
  const existingBrokers  = brokerGroups.map(g => g.name);

  const select = (id: string) => { setActivePortfolio(id); setOpen(false); };

  const handleDelete = async (p: PortfolioSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${p.name}" and all its data?`)) return;
    await fetch(`/api/portfolios/${p.id}`, { method: "DELETE" });
    await refreshPortfolios();
  };

  const handleCreate = async (data: { name: string; familyGroup: string; broker: string }) => {
    await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        familyGroup: data.familyGroup || undefined,
        broker: data.broker || undefined,
      }),
    });
    await refreshPortfolios();
    setShowCreate(false);
    setOpen(true);
  };

  if (loading) return <div className="mx-3 mb-2 h-10 rounded-md bg-accent/50 animate-pulse" />;

  const isVirtual = activePortfolioId !== null &&
    (activePortfolioId === ALL_PORTFOLIOS_ID ||
     activePortfolioId.startsWith(FAMILY_PREFIX) ||
     activePortfolioId.startsWith(BROKER_PREFIX));

  return (
    <div className="mx-3 mb-2 relative">
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 rounded-md px-3 py-2 bg-accent/60 hover:bg-accent border border-border text-left transition-colors"
      >
        {isVirtual
          ? <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
          : <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate leading-none">{activePortfolioLabel}</p>
          {activePortfolioSub && (
            <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">{activePortfolioSub}</p>
          )}
        </div>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-md shadow-xl overflow-hidden">

          {/* Mode toggle */}
          {portfolios.length > 1 && (
            <div className="flex border-b border-border">
              <button
                onClick={() => setSelectorMode("family")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors ${
                  selectorMode === "family" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-3 w-3" /> Family
              </button>
              <div className="w-px bg-border" />
              <button
                onClick={() => setSelectorMode("broker")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors ${
                  selectorMode === "broker" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="h-3 w-3" /> Broker
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">

            {/* ── All Portfolios (always at top when multiple) ── */}
            {portfolios.length > 1 && (
              <div
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-b border-border/40 ${
                  activePortfolioId === ALL_PORTFOLIOS_ID ? "bg-primary/10" : "hover:bg-accent"
                }`}
                onClick={() => select(ALL_PORTFOLIOS_ID)}
              >
                <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">All Portfolios</p>
                  <p className="text-[10px] text-muted-foreground">{portfolios.length} portfolios · merged view</p>
                </div>
                {activePortfolioId === ALL_PORTFOLIOS_ID && <Check className="h-3 w-3 text-primary shrink-0" />}
              </div>
            )}

            {/* ── FAMILY MODE ── */}
            {selectorMode === "family" && (
              <>
                {/* Ungrouped portfolios (no familyGroup) */}
                {ungroupedPortfolios.map(p => (
                  <PortfolioRow
                    key={p.id} p={p}
                    active={activePortfolioId === p.id}
                    onSelect={() => select(p.id)}
                    onDelete={e => handleDelete(p, e)}
                  />
                ))}

                {/* Family groups */}
                {familyGroups.map(group => {
                  const color = groupColor(group.name);
                  const virtualId = `${FAMILY_PREFIX}${group.name}`;
                  return (
                    <div key={group.name} className="border-t border-border/40">
                      <SectionLabel label={`${group.name} Family`} color={color} />
                      <CombinedRow
                        label={`${group.name} — All Combined`}
                        sub={`${group.portfolios.length} sub-portfolios`}
                        virtualId={virtualId}
                        activeId={activePortfolioId}
                        color={color}
                        onSelect={select}
                      />
                      {group.portfolios.map(p => (
                        <PortfolioRow
                          key={p.id} p={p} indent
                          active={activePortfolioId === p.id}
                          onSelect={() => select(p.id)}
                          onDelete={e => handleDelete(p, e)}
                        />
                      ))}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── BROKER MODE ── */}
            {selectorMode === "broker" && (
              <>
                {/* Broker groups */}
                {brokerGroups.map(group => {
                  const color = groupColor(group.name);
                  const virtualId = `${BROKER_PREFIX}${group.name}`;
                  return (
                    <div key={group.name} className="border-t border-border/40 first:border-t-0">
                      <SectionLabel label={group.name} color={color} />
                      {group.portfolios.length > 1 && (
                        <CombinedRow
                          label={`All ${group.name}`}
                          sub={`${group.portfolios.length} portfolios`}
                          virtualId={virtualId}
                          activeId={activePortfolioId}
                          color={color}
                          onSelect={select}
                        />
                      )}
                      {group.portfolios.map(p => (
                        <PortfolioRow
                          key={p.id} p={p}
                          indent={group.portfolios.length > 1}
                          active={activePortfolioId === p.id}
                          onSelect={() => select(p.id)}
                          onDelete={e => handleDelete(p, e)}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Portfolios with no broker */}
                {noBrokerPortfolios.length > 0 && (
                  <div className="border-t border-border/40">
                    <SectionLabel label="No Broker" color="#6b7280" />
                    {noBrokerPortfolios.map(p => (
                      <PortfolioRow
                        key={p.id} p={p}
                        active={activePortfolioId === p.id}
                        onSelect={() => select(p.id)}
                        onDelete={e => handleDelete(p, e)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

          </div>

          {/* ── Footer: Create / Cancel ── */}
          {showCreate ? (
            <CreateForm
              existingFamilies={existingFamilies}
              existingBrokers={existingBrokers}
              onCreate={handleCreate}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <div className="border-t border-border">
              <button
                onClick={() => { setShowCreate(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Portfolio
              </button>
            </div>
          )}
        </div>
      )}

      {/* Click-outside */}
      {open && <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowCreate(false); }} />}
    </div>
  );
}
