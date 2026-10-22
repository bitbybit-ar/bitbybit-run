import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { HowToPlayContent } from "@/components/how-to-play/how-to-play-content";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "howToPlay" });
  return pageMetadata({
    locale,
    path: "/how-to-play",
    title: t("title"),
    description: t("metaDescription"),
  });
}

export default async function HowToPlayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container>
      <HowToPlayContent />
    </Container>
  );
}
