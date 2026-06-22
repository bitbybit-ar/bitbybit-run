import { renderBrandIcon } from "@/lib/pwa/brand-icon";

// 512×512 maskable icon (`purpose: "maskable"`). The mark is scaled to 80% so
// it stays inside the platform safe zone when launchers clip it to a circle /
// squircle. See `app/icon-192.png/route.tsx`.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(512, 0.8);
}
