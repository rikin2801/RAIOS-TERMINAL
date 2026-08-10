import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MarketBar } from "@/components/layout/market-bar";
import { Toaster } from "@/components/ui/toaster";
import { PortfolioProvider } from "@/contexts/portfolio-context";
import { SwRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "Rikin AI Investment Terminal",
  description: "Personal Bloomberg Terminal with AI Investment Advisor",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full flex overflow-hidden bg-background text-foreground">
        <PortfolioProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <MobileHeader />
            <MarketBar />
            <main className="flex-1 overflow-auto pb-16 md:pb-0">
              {children}
            </main>
          </div>
          <MobileBottomNav />
          <Toaster />
          <SwRegister />
        </PortfolioProvider>
      </body>
    </html>
  );
}
