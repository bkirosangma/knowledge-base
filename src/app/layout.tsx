import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./globals.print.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Empty under root deploys (dev, Vercel); `/knowledge-base` under GitHub
// Pages. Next auto-prefixes `<Link>` and `_next/static`, but metadata
// strings like `manifest`/`icons` render as literal hrefs and need this.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Knowledge Base",
  description: "Local-first knowledge base with diagrams and documents",
  // PWA manifest reference. The icon is an SVG (Lighthouse-acceptable)
  // so we don't ship per-resolution PNGs.
  manifest: `${basePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Knowledge Base",
  },
  icons: {
    icon: `${basePath}/icon.svg`,
    apple: `${basePath}/icon.svg`,
  },
};

// Next 16 requires `themeColor` in the `viewport` export, not `metadata`.
export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
