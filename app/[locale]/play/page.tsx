import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getSession } from "@/lib/auth";
import { getUserByPubkey } from "@/lib/creator/users";
import { GameHeader } from "@/components/game/game-header/game-header";
import { PlayStage } from "@/components/game/play-stage";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ m?: string; h?: string }>;
};

// The competitive game requires an identity — send anonymous visitors to sign in
// (they can still try the free /demo). Returns to /play after login — preserving
// an invite link's `?m=&h=` so an invited (logged-out) player lands back in the
// runner lobby for that match, not the generic races browser.
export default async function PlayPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    const { m, h } = await searchParams;
    const query = new URLSearchParams();
    if (m) query.set("m", m);
    if (h) query.set("h", h);
    const qs = query.toString();
    redirect({
      href: {
        pathname: "/sign-in",
        query: { next: qs ? `/play?${qs}` : "/play" },
      },
      locale,
    });
    return null;
  }

  const t = await getTranslations("play");

  const user = await getUserByPubkey(session.pubkey);
  const currentUser = {
    name: user?.display_name ?? "Player",
    avatarUrl: user?.avatar_url ?? null,
  };

  return (
    <div className={styles.page}>
      <GameHeader phase={t("phase")} />
      <div className={styles.stage}>
        <PlayStage currentUser={currentUser} />
      </div>
    </div>
  );
}
