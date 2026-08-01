import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const displaySerif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tab — split the check",
  description:
    "Photograph a receipt, send everyone the link, and let each person tap what they had. Tax and tip split proportionally, to the cent.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tab", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#17161a" },
  ],
  width: "device-width",
  initialScale: 1,
  // Let people zoom the receipt image — pinch-zoom is not ours to disable.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${displaySerif.variable} ${sans.variable} ${mono.variable} antialiased`}
      >
        <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
          <header className="flex items-baseline justify-between px-5 pt-6 pb-3">
            <Link
              href="/"
              className="font-display text-2xl tracking-tight text-ink"
              aria-label="Tab — home"
            >
              Tab
              <span className="text-stamp">.</span>
            </Link>
            <Link
              href="/my-bills"
              className="text-xs uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
            >
              My bills
            </Link>
          </header>
          <main className="flex-1 px-3 pb-24">{children}</main>
          <footer className="px-5 pb-6 text-center text-[11px] tracking-wide text-ink-faint">
            Split to the cent · tax &amp; tip shared proportionally
          </footer>
        </div>
      </body>
    </html>
  );
}
