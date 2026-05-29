import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { BrandIcon } from "@/lib/brand-icon";

// PNG icons referenced by manifest.webmanifest, e.g. /pwa-icon?size=512&maskable=1
export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const size = clamp(Number(searchParams.get("size")) || 512, 48, 1024);
  const maskable = searchParams.get("maskable") === "1";

  return new ImageResponse(<BrandIcon size={size} maskable={maskable} />, {
    width: size,
    height: size,
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
