import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // Default locale (es) is served prefix-free: run.bitbybit.com.ar shows es,
  // /en/* is the English variant.
  localePrefix: "as-needed",
  // Don't auto-redirect by the browser's Accept-Language — always land on es;
  // users switch to English with the locale toggle.
  localeDetection: false,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
