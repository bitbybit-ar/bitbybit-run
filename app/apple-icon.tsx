import { ImageResponse } from "next/og";

/**
 * Apple touch icon — same brand mark as the favicon (three stacked blocks),
 * sized for home-screen bookmarks with a little breathing room.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const EDGE = "#1a1230";
const BLOCKS = ["#ff4d85", "#16a06b", "#f5b500"]; // primary / secondary / highlight

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: EDGE,
        }}
      >
        {BLOCKS.map((color) => (
          <div
            key={color}
            style={{
              width: 47,
              height: 47,
              background: color,
              border: `3px solid ${EDGE}`,
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    ),
    { ...size }
  );
}
