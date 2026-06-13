import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import {
  getLeaderboard,
  getLeaderboardCount,
  type LeaderboardRow,
} from "@/lib/multiplayer/store";

// DB-backed and live: never statically prerender at build (no DATABASE_URL /
// no rows yet during the build).
export const dynamic = "force-dynamic";

/** Players shown per leaderboard page. */
const PAGE_SIZE = 10;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "leaderboard" });
  return { title: t("title") };
}

export default async function LeaderboardPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { page: pageParam } = await searchParams;
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  // The DB may be absent in dev, so degrade to the empty state rather than
  // crash the page.
  let rows: LeaderboardRow[] = [];
  let total = 0;
  try {
    total = await getLeaderboardCount();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    rows = await getLeaderboard(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  } catch {
    rows = [];
    total = 0;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  return (
    <Container>
      <LeaderboardTable
        rows={rows}
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
      />
    </Container>
  );
}
