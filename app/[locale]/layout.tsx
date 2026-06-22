import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Pixelify_Sans, Nunito_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/lib/contexts/theme-context";
import { ActiveMatchProvider } from "@/lib/contexts/active-match-context";
import { Navbar } from "@/components/layout/navbar/navbar";
import { SiteFooter } from "@/components/layout/footer/site-footer";
import { FakeAds } from "@/components/layout/fake-ads/fake-ads";
import { InstallApp } from "@/components/layout/install-app/install-app";
import { OfflineBanner } from "@/components/layout/offline-banner/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker-registrar/service-worker-registrar";
import { SignerProviderClient } from "@/components/auth/signer-provider-client";
import { getSession } from "@/lib/auth";
import { getUserByPubkey } from "@/lib/creator/users";
import type { SessionUser } from "@/lib/contexts/signer-context";
import { cn } from "@/lib/utils";
import "@/styles/globals.scss";

/**
 * Read the session from the request cookie and resolve the user row so
 * the navbar renders the correct signed-in/out state on first paint
 * instead of flashing the anonymous state until the client-side
 * `/api/auth/session` fetch resolves. Best-effort: a DB hiccup falls
 * back to a session with no user row rather than failing the layout.
 */
async function resolveInitialSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const user = await getUserByPubkey(session.pubkey);
    return {
      pubkey: session.pubkey,
      locale: session.locale,
      signer_type: session.signer_type,
      user:
        user && user.active
          ? {
              id: user.id,
              slug: user.slug,
              display_name: user.display_name,
              avatar_url: user.avatar_url,
              lud16: user.lud16,
            }
          : null,
    };
  } catch {
    return {
      pubkey: session.pubkey,
      locale: session.locale,
      signer_type: session.signer_type,
      user: null,
    };
  }
}

const pixel = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Without this, mobile browsers assume a ~980px desktop width and zoom out,
// breaking the fluid `clamp()` typography and `dvh` layouts. Zoom is left
// enabled (no maximumScale) for accessibility — the game canvas opts out of
// touch-scroll/zoom locally via `touch-action: none` instead.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tints the mobile browser/standalone UI to match the theme. Kept in sync
  // with --color-bg in styles/_theme.scss for each scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eefe" },
    { media: "(prefers-color-scheme: dark)", color: "#17132b" },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const title = t("siteTitle");
  const description = t("description");
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: title,
      template: `%s · ${t("siteName")}`,
    },
    description,
    applicationName: t("siteName"),
    // Lets iOS Safari treat the app as standalone when added to the home screen
    // (the manifest covers Android). Next links the manifest automatically.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("siteName"),
    },
    // The og/twitter images come from the opengraph-image.tsx / twitter-image.tsx
    // file conventions; here we set the accompanying text + card type.
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title,
      description,
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** Absolute site origin for resolving OG image URLs (prod domain, Vercel
 *  preview, or local dev). */
function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "es" | "en")) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "metadata" });
  const initialSession = await resolveInitialSession();

  return (
    <html
      lang={locale}
      className={cn(pixel.variable, nunitoSans.variable)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <SignerProviderClient initialSession={initialSession}>
              <ActiveMatchProvider>
                <a href="#main" className="skip-link">
                  {t("skipToContent")}
                </a>
                <Navbar />
                <OfflineBanner />
                <main id="main">{children}</main>
                <FakeAds />
                <InstallApp />
                <ServiceWorkerRegistrar />
                <SiteFooter />
              </ActiveMatchProvider>
            </SignerProviderClient>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
