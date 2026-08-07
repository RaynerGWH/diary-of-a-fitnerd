import type { Metadata, Viewport } from "next";
import { Shantell_Sans, Caveat } from "next/font/google";
import "./globals.css";

const shantell = Shantell_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-shantell",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-caveat",
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
    <html lang="en" className={`${shantell.variable} ${caveat.variable}`}>
      <body className="flex items-center justify-center">
        {children}
      </body>
    </html>
  );
}
