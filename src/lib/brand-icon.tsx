import type { ReactElement } from "react";

// Shared art for every generated icon (favicon, apple-touch-icon, manifest
// PWA icons). Rendered by next/og's ImageResponse (Satori), so only
// flex-based layout + basic CSS is allowed — no radial gradients, no `gap`.
export function BrandIcon({
  size,
  maskable = false,
  compact = false,
}: {
  size: number;
  maskable?: boolean;
  compact?: boolean;
}): ReactElement {
  // Maskable icons must keep content inside the inner ~80% safe zone.
  const scale = maskable ? 0.78 : 1;
  const border = Math.max(2, Math.round(size * 0.012));
  const dot = Math.round(size * 0.1 * scale);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0ebe0",
        position: "relative",
      }}
    >
      {/* highlighter swash behind the wordmark */}
      <div
        style={{
          position: "absolute",
          width: Math.round(size * 0.6 * scale),
          height: Math.round(size * 0.22 * scale),
          background: "#ffe066",
          borderRadius: Math.round(size * 0.08),
          transform: "rotate(-3deg)",
          top: Math.round(size * (compact ? 0.42 : 0.46)),
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            fontSize: Math.round(size * 0.46 * scale),
            fontWeight: 800,
            color: "#20201e",
            lineHeight: 1,
            letterSpacing: -Math.round(size * 0.01),
          }}
        >
          R.
        </div>
        {!compact && (
          <div style={{ display: "flex", marginTop: Math.round(size * 0.07) }}>
            <div
              style={{
                width: dot,
                height: dot,
                borderRadius: "50%",
                background: "#2f4fe0",
                border: `${border}px solid #20201e`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
