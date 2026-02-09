import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { DocsChat } from "@/components/docs-chat";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "agent-browser",
  description: "Headless browser automation CLI for AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <MobileNavProvider>
            <Header />
            <div className="flex min-h-[calc(100vh-3.5rem)]">
              <Sidebar />
              <main className="flex-1 overflow-auto">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                  <div className="prose">
                    {children}
                  </div>
                </div>
              </main>
            </div>
            <DocsChat />
          </MobileNavProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
