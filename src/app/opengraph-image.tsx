import { ImageResponse } from "next/og";

export const alt = "Tobin Clearing Protocol: Clear more. Settle less.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f4ee",
          color: "#15140f",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 600 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1f57d6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 4.5l7 7.5m7-7.5L12 12m0 0v7.5" />
          </svg>
          Tobin
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 128, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>
          <div>Clear more.</div>
          <div style={{ color: "#8c877b" }}>Settle less.</div>
        </div>
        <div style={{ fontSize: 30, color: "#55524a" }}>
          An open clearing protocol for institutional payments on Stellar.
        </div>
      </div>
    ),
    size,
  );
}
