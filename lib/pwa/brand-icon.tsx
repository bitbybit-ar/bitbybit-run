import { ImageResponse } from "next/og";

/**
 * Shared renderer for the PWA app icons — the same brand mark as the favicon
 * (`app/icon.tsx`): three stacked blocks (pink / green / yellow) on a dark
 * arcade tile. Generated at request time from the palette in
 * `styles/_theme.scss`, so the installed-app icon needs no static PNG asset.
 *
 * `contentScale` shrinks the block column toward the center: pass `0.8` for
 * `purpose: "maskable"` icons so the mark stays inside the platform's safe
 * zone when the launcher clips it to a circle / squircle, and `1` for plain
 * `purpose: "any"` icons.
 */
const EDGE = "#1a1230";
const BG = "#17132b"; // deep indigo — matches the dark theme --color-bg
const BLOCKS = ["#ff4d85", "#16a06b", "#f5b500"]; // primary / secondary / highlight

export function renderBrandIcon(size: number, contentScale = 1): ImageResponse {
  // Square blocks: the side is sized so three stacked squares + the two gaps
  // stay centered within the tile (3 * 0.26 + 2 * gap ≈ 0.9 of the icon).
  const blockSize = Math.round(size * 0.26 * contentScale);
  const gap = Math.round(blockSize * 0.22);
  const radius = Math.max(2, Math.round(blockSize * 0.08));
  const border = Math.max(1, Math.round(size * 0.016));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
        background: BG,
      }}
    >
      {BLOCKS.map((color) => (
        <div
          key={color}
          style={{
            width: blockSize,
            height: blockSize,
            background: color,
            border: `${border}px solid ${EDGE}`,
            borderRadius: radius,
          }}
        />
      ))}
    </div>,
    { width: size, height: size }
  );
}
