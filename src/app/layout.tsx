import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import {
  ACCENT_COOKIE,
  ACCENTS,
  DEFAULT_ACCENT,
  DEFAULT_PNL_PALETTE,
  PNL_COOKIE,
  PNL_PALETTES,
  type Accent,
  type PnlPalette,
} from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "L&B TradeJournal",
    template: "%s · L&B TradeJournal",
  },
  description: "Trading journal e analytics per trader retail",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Accento e coppia profit/loss scelti dall'utente (cookie): ignoto = default.
  const store = await cookies();
  const accentValue = store.get(ACCENT_COOKIE)?.value;
  const accent: Accent = (ACCENTS as readonly string[]).includes(
    accentValue ?? "",
  )
    ? (accentValue as Accent)
    : DEFAULT_ACCENT;
  const pnlValue = store.get(PNL_COOKIE)?.value;
  const pnlPalette: PnlPalette = (PNL_PALETTES as readonly string[]).includes(
    pnlValue ?? "",
  )
    ? (pnlValue as PnlPalette)
    : DEFAULT_PNL_PALETTE;

  return (
    <html
      lang="it"
      data-accent={accent}
      data-pnl={pnlPalette}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
