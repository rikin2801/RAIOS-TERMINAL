"use client";

import { useState } from "react";
import { usePortfolio } from "@/contexts/portfolio-context";
import {
  ChevronDown, Plus, Briefcase, Check, Settings2, Trash2,
} from "lucide-react";

export function PortfolioSelector() {
  const { portfolios, activePortfolio, setActivePortfolio, refreshPortfolios, loading } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), broker: newBroker.trim() || undefined }),
      });
      await refreshPortfolios();
      setShowCreate(false);
      setNewName("");
      setNewBroker("");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this portfolio and all its data?")) return;
    await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    await refreshPortfolios();
  };

  if (loading) {
    return (
      <div className="mx-3 mb-2 h-10 rounded-md bg-accent/50 animate-pulse" />
    );
  }

  return (
    <div className="mx-3 mb-2 relative">
      {/* Selector button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-md px-3 py-2 bg-accent/60 hover:bg-accent border border-border text-left transition-colors"
      >
        <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate leading-none">
            {activePortfolio?.name ?? "Select Portfolio"}
          </p>
          {activePortfolio?.broker && (
            <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
              {activePortfolio.broker}
            </p>
          )}
        </div>
        <ChevronDown className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-md shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {portfolios.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                onClick={() => { setActivePortfolio(p.id); setOpen(false); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                  {p.broker && (
                    <p className="text-[10px] text-muted-foreground truncate">{p.broker}</p>
                  )}
                  {p._count && (
                    <p className="text-[10px] text-muted-foreground">
                      {p._count.holdings} holdings
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.id === activePortfolio?.id && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                  {!p.isDefault && (
                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border">
            {showCreate ? (
              <div className="p-2 space-y-1.5">
                <input
                  autoFocus
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  placeholder="Portfolio name (e.g. ICICI Direct)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <input
                  className="w-full bg-input border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  placeholder="Broker (optional)"
                  value={newBroker}
                  onChange={(e) => setNewBroker(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="flex-1 bg-primary text-primary-foreground rounded py-1 text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewName(""); setNewBroker(""); }}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowCreate(true); setOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Portfolio Profile
              </button>
            )}
          </div>

          {portfolios.length > 1 && (
            <div className="border-t border-border">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => setOpen(false)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Manage in Settings
              </button>
            </div>
          )}
        </div>
      )}
      {/* Click-outside to close */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
