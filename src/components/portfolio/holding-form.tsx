"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Holding } from "@/types";
import { INDIAN_SECTORS, INDIAN_BROKERS } from "@/lib/india";

interface HoldingFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Holding>) => Promise<void>;
  initial?: Partial<Holding>;
  title?: string;
}

export function HoldingForm({ open, onClose, onSave, initial, title = "Add Holding" }: HoldingFormProps) {
  const [form, setForm] = useState({
    symbol: initial?.symbol ?? "",
    name: initial?.name ?? "",
    shares: initial?.shares?.toString() ?? "",
    avgCost: initial?.avgCost?.toString() ?? "",
    sector: initial?.sector ?? "",
    exchange: initial?.exchange ?? "NSE",
    purchaseDate: initial?.purchaseDate ?? "",
    broker: initial?.broker ?? "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.symbol || !form.name || !form.shares || !form.avgCost) {
      setError("Symbol, name, shares and average cost are required.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        symbol: form.symbol.toUpperCase(),
        name: form.name,
        shares: parseFloat(form.shares),
        avgCost: parseFloat(form.avgCost),
        sector: form.sector || undefined,
        exchange: form.exchange as "NSE" | "BSE",
        purchaseDate: form.purchaseDate || undefined,
        broker: form.broker || undefined,
        notes: form.notes || undefined,
      });
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1">
              <Label htmlFor="symbol">Symbol *</Label>
              <Input
                id="symbol"
                placeholder="RELIANCE"
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1 col-span-1">
              <Label>Exchange *</Label>
              <Select value={form.exchange} onValueChange={(v) => setForm((f) => ({ ...f, exchange: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE">NSE</SelectItem>
                  <SelectItem value="BSE">BSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-1">
              <Label htmlFor="shares">Shares *</Label>
              <Input
                id="shares"
                type="number"
                step="0.001"
                placeholder="10"
                value={form.shares}
                onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              placeholder="Reliance Industries"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="avgCost">Avg Cost (₹) *</Label>
              <Input
                id="avgCost"
                type="number"
                step="0.01"
                placeholder="2500.00"
                value={form.avgCost}
                onChange={(e) => setForm((f) => ({ ...f, avgCost: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="purchaseDate">Purchase Date</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Sector</Label>
              <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Broker</Label>
              <Select value={form.broker} onValueChange={(v) => setForm((f) => ({ ...f, broker: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select broker" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_BROKERS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Optional notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Holding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
