"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { INDIAN_BROKERS } from "@/lib/india";
import { CheckCircle, XCircle, Loader2, Brain, Database, TrendingUp, Cpu, Bell } from "lucide-react";

interface SystemStatus {
  ai: { connected: boolean; model: string; mode: string };
  marketData: { provider: string; exchanges: string[]; status: string };
  database: { ok: boolean; holdings: number };
  version: string;
  buildDate: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    fetch("/api/settings/status").then(r => r.json()).then(setStatus).catch(() => null);
  }, []);
  const [verifying, setVerifying] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [defaultExchange, setDefaultExchange] = useState("NSE");
  const [defaultBroker, setDefaultBroker] = useState("");
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied" | "unsupported">("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifStatus(Notification.permission as "default" | "granted" | "denied");
    } else {
      setNotifStatus("unsupported");
    }
  }, []);

  const requestNotifications = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotifStatus(permission as "default" | "granted" | "denied");
    if (permission === "granted") {
      toast({ title: "Morning Brief enabled!", description: "You'll receive portfolio alerts at 9 AM IST on weekdays." });
      new Notification("RAIOS Morning Brief enabled", {
        body: "Open RAIOS before 9:15 AM IST on any weekday to receive your daily portfolio alert.",
        icon: "/globe.svg",
      });
    } else {
      toast({ title: "Permission denied", description: "Enable notifications in your browser settings to use this feature." });
    }
  };

  const verifyApiKey = async () => {
    if (!apiKey.trim()) return;
    setVerifying(true);
    setKeyStatus("idle");
    try {
      const res = await fetch("/api/settings/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (data.valid) {
        setKeyStatus("valid");
        toast({ title: "API key verified successfully" });
      } else {
        setKeyStatus("invalid");
        toast({ title: "Invalid API key", description: data.error });
      }
    } catch {
      setKeyStatus("invalid");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your terminal preferences</p>
      </div>

      {/* API Keys */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Gemini AI API Key</h2>
        <p className="text-sm text-muted-foreground">
          Required for AI-powered analysis. Get your key from{" "}
          <span className="text-primary">Google AI Studio (aistudio.google.com)</span>.
          The key is stored in your <code className="text-xs bg-muted px-1 rounded">.env</code> file — never paste it here for production.
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Input
              type="password"
              placeholder="AIzaSy... or your API key"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeyStatus("idle"); }}
            />
          </div>
          <Button onClick={verifyApiKey} disabled={verifying || !apiKey.trim()} variant="outline">
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </div>
        {keyStatus === "valid" && (
          <p className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" /> Key is valid — add it to your .env file as GOOGLE_GENERATIVE_AI_API_KEY
          </p>
        )}
        {keyStatus === "invalid" && (
          <p className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="h-4 w-4" /> Key is invalid or expired
          </p>
        )}
      </section>

      {/* Market Defaults */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Market Preferences</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default Exchange</Label>
            <Select value={defaultExchange} onValueChange={setDefaultExchange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NSE">NSE (National Stock Exchange)</SelectItem>
                <SelectItem value="BSE">BSE (Bombay Stock Exchange)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default Broker</Label>
            <Select value={defaultBroker} onValueChange={setDefaultBroker}>
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
        <div className="space-y-2">
          <Label>Currency</Label>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">₹ INR (Indian Rupee)</Badge>
            <span className="text-xs text-muted-foreground">Indian number format: ₹1,25,000</span>
          </div>
        </div>
        <Button onClick={() => toast({ title: "Preferences saved" })}>Save Preferences</Button>
      </section>

      {/* System Status */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> System Status</h2>
          {status && <Badge variant="outline" className="text-xs">v{status.version}</Badge>}
        </div>
        {!status && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking status…</div>}
        {status && (
          <div className="space-y-3">
            {/* AI Engine */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">AI Engine</p>
                  <p className="text-xs text-muted-foreground">{status.ai.model}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status.ai.connected ? "bg-green-400" : "bg-yellow-400"}`} />
                <Badge variant="outline" className={`text-xs ${status.ai.connected ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"}`}>
                  {status.ai.mode}
                </Badge>
              </div>
            </div>
            {/* Market Data */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Market Data</p>
                  <p className="text-xs text-muted-foreground">{status.marketData.provider} · {status.marketData.exchanges.join(", ")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <Badge variant="outline" className="text-xs border-green-500/40 text-green-400">{status.marketData.status}</Badge>
              </div>
            </div>
            {/* Database */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs text-muted-foreground">{status.database.holdings} holding{status.database.holdings !== 1 ? "s" : ""} tracked · libSQL (Turso)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status.database.ok ? "bg-green-400" : "bg-red-400"}`} />
                <Badge variant="outline" className={`text-xs ${status.database.ok ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}`}>
                  {status.database.ok ? "CONNECTED" : "OFFLINE"}
                </Badge>
              </div>
            </div>
          </div>
        )}
        {status && !status.ai.connected && (
          <div className="rounded-md border border-yellow-900/40 bg-yellow-900/10 px-3 py-2">
            <p className="text-xs text-yellow-400">
              <span className="font-semibold">AI in Mock Mode</span> — Add <code className="bg-yellow-900/30 px-1 rounded">GOOGLE_GENERATIVE_AI_API_KEY</code> to your <code className="bg-yellow-900/30 px-1 rounded">.env.local</code> file to enable live AI analysis.
            </p>
          </div>
        )}
      </section>

      {/* Morning Brief Notifications */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Morning Brief Notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Receive a browser notification at 9 AM IST on market days with urgent portfolio actions — stocks near stop-loss, target hits, and high-priority trades. Open RAIOS before 10 AM for the alert to fire.
        </p>
        <div className="flex items-center gap-4">
          {notifStatus === "granted" ? (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-green-400 font-medium">Morning Brief active</span>
            </div>
          ) : notifStatus === "denied" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-sm text-red-400">Notifications blocked by browser</span>
              </div>
              <p className="text-xs text-muted-foreground">Go to your browser&apos;s site settings and allow notifications for this site, then reload.</p>
            </div>
          ) : notifStatus === "unsupported" ? (
            <p className="text-sm text-muted-foreground">Not supported in this browser.</p>
          ) : (
            <Button onClick={requestNotifications} variant="outline" className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5" /> Enable Morning Brief
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Dashboard also auto-refreshes prices every 10 minutes during market hours (9:15 AM — 3:30 PM IST, Mon–Fri) while the tab is open.
        </p>
      </section>

      {/* About */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-3">
        <h2 className="font-semibold">About RAIOS</h2>
        <p className="text-xs text-muted-foreground">Rikin AI Investment Operating System — a professional-grade investment terminal for Indian equity markets.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {["Next.js 16", "React 19", "Prisma 7", "Gemini 2.5 Flash", "Yahoo Finance", "TradingView Charts v5", "TailwindCSS v4"].map(t => (
            <Badge key={t} variant="outline" className="text-xs text-muted-foreground">{t}</Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
