import { ImageResponse } from "next/og";

/**
 * Favicon — the brand mark (three stacked "BitByBit" blocks: pink / green /
 * yellow) on a dark arcade tile. Generated so it stays in sync with the
 * palette in `styles/_theme.scss` and needs no static asset. Font-independent.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const EDGE = "#1a1230";
const BLOCKS = ["#ff4d85", "#16a06b", "#f5b500"]; // primary / secondary / highlight

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: EDGE,
        // 3 * 9 + 2 * 2 = 31 ≤ 32, so the squares stay centered in the tile.
      }}
    >
      {BLOCKS.map((color) => (
        <div
          key={color}
          style={{
            width: 9,
            height: 9,
            background: color,
            border: `1px solid ${EDGE}`,
          }}
        />
      ))}
    </div>,
    { ...size }
  );
}
