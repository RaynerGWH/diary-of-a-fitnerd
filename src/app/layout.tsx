import type { Metadata, Viewport } from "next";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Rayner OS",
  title: "Rayner OS",
  description: "tasks, notes, logs: one place instead of scattered pages",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Rayner OS",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // Belt-and-suspenders for older iOS: Next emits `mobile-web-app-capable`,
  // but pre-16.4 Safari only launches standalone from the apple- prefix.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f0ebe0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable}`}>
      <body className="flex items-center justify-center">
        {children}
      </body>
    </html>
  );
}
