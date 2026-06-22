import { ImageResponse } from "next/og";
import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";

/**
 * Open Graph preview image (link unfurls on social / chat apps). Generated from
 * the brand palette + wordmark so it never drifts from the site. One per locale
 * — the tagline follows the request locale. Font-independent (uses the default
 * sans) so it always renders; the blocks carry the brand identity.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "BitByBit RUN";

const EDGE = "#1a1230";
const BG = "#17132b"; // deep indigo (dark-theme background)
const BLOCKS = ["#ff4d85", "#16a06b", "#f5b500"]; // primary / secondary / highlight

/** Short, punchy tagline: the bit after the em dash in the site title. */
function tagline(siteTitle: string, fallback: string): string {
  const parts = siteTitle.split("—");
  return parts[1]?.trim() || fallback;
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const m = locale === "en" ? enMessages : esMessages;
  const sub = tagline(m.metadata.siteTitle, m.metadata.description);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          padding: "0 96px",
          background: BG,
        }}
      >
        {/* Brand blocks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {BLOCKS.map((color) => (
            <div
              key={color}
              style={{
                width: 132,
                height: 132,
                background: color,
                border: `6px solid ${EDGE}`,
                borderRadius: 10,
              }}
            />
          ))}
        </div>

        {/* Wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
            <span style={{ fontSize: 104, fontWeight: 800, color: "#ffffff" }}>
              BitByBit
            </span>
            <span style={{ fontSize: 104, fontWeight: 800, color: "#ff5d8f" }}>
              RUN
            </span>
          </div>
          <span
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: "#cfc7ea",
              marginTop: 28,
            }}
          >
            {sub}
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
