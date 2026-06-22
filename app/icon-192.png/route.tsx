import { renderBrandIcon } from "@/lib/pwa/brand-icon";

// 192×192 app icon (`purpose: "any"`) referenced by `app/manifest.ts`. Lives
// at a dotted path so the next-intl middleware (which skips anything matching
// `.*\..*`) doesn't try to locale-prefix it. See `lib/pwa/brand-icon.tsx`.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(192);
}
