import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPathname, routing } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/env";

type Locale = (typeof routing.locales)[number];

/** Indexable pages (internal, unprefixed paths). Shared by the sitemap and
 *  every page's canonical/hreflang, so the two can't drift apart. */
export const PUBLIC_PATHS = ["/", "/how-to-play", "/leaderboard", "/demo"];

export function isLocale(value: string): value is Locale {
  return routing.locales.includes(value as Locale);
}

/** Absolute URL of `path` in `locale` (es has no prefix, en lives at /en). */
export function localizedUrl(locale: Locale, path: string): string {
  return new URL(getPathname({ locale, href: path }), getSiteUrl()).toString();
}

/** hreflang map for `path`: every locale plus x-default (the default locale). */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = localizedUrl(locale, path);
  }
  languages["x-default"] = localizedUrl(routing.defaultLocale, path);
  return languages;
}

function socialImage(
  locale: Locale,
  route: "opengraph-image" | "twitter-image"
): string {
  return new URL(`/${locale}/${route}`, getSiteUrl()).toString();
}

type PageMetadataInput = {
  locale: string;
  path: string;
  /** Omit on the home page to keep the layout's full site title. */
  title?: string;
  description: string;
};

/** Metadata for an indexable page: self-referencing canonical, es/en/x-default
 *  hreflang, and matching Open Graph / Twitter text. */
export async function pageMetadata({
  locale,
  path,
  title,
  description,
}: PageMetadataInput): Promise<Metadata> {
  const current = isLocale(locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: current, namespace: "metadata" });
  const socialTitle = title ?? t("siteTitle");
  const url = localizedUrl(current, path);

  return {
    ...(title && { title }),
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: socialTitle,
      description,
      url,
      locale: current,
      // Setting openGraph here drops the [locale] segment's file-based image,
      // so link it again (same route Next generates for opengraph-image.tsx).
      images: socialImage(current, "opengraph-image"),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: socialImage(current, "twitter-image"),
    },
  };
}

/** Pages with no search value of their own (game, sign-in, offline). */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };
