import { ImageResponse } from "next/og";
import { BrandIcon } from "@/lib/brand-icon";

// iOS uses this for the Home Screen icon when "Add to Home Screen" is tapped.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandIcon size={180} />, { ...size });
}
