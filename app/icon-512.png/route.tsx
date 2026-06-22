import { renderBrandIcon } from "@/lib/pwa/brand-icon";

// 512×512 app icon (`purpose: "any"`) — the high-res mark used for the
// splash screen and richer install UI. See `app/icon-192.png/route.tsx`.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(512);
}
