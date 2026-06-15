import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import type { LeaderboardRow, LeaderboardSort } from "@/lib/multiplayer/store";
import { RankingTable } from "./ranking-table";
import { shortPubkey, cn } from "@/lib/utils";
import styles from "./leaderboard-table.module.scss";

type Props = {
  rows: LeaderboardRow[];
  /** Current page (1-based). */
  page?: number;
  /** Total number of pages. */
  totalPages?: number;
  /** Players per page (for the global rank offset on page 2+). */
  pageSize?: number;
  /** Active sort column (the headers are sort toggles). */
  sort?: LeaderboardSort;
};

/**
 * Global ranking, rendered server-side from the aggregated `getLeaderboard()`
 * rows via the shared <RankingTable>. Paginated (10/page) with locale-aware
 * prev/next links. The empty state covers the reality where no results exist
 * yet (no DB, or no matches played).
 */
export async function LeaderboardTable({
  rows,
  page = 1,
  totalPages = 1,
  pageSize = 10,
  sort = "wins",
}: Props) {
  const t = await getTranslations("leaderboard");

  // Each numeric column is a sort toggle: clicking re-ranks the board by it and
  // resets to page 1. The active column shows a ▼ and is highlighted.
  const sortColumn = (key: LeaderboardSort, label: string, collapsible = false) => ({
    label,
    collapsible,
    active: sort === key,
    sortHref: { pathname: "/leaderboard" as const, query: { sort: key, page: 1 } },
    sortLabel: t("sortBy", { column: label }),
  });

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      {rows.length === 0 ? (
        <p className={styles.empty}>{t("empty")}</p>
      ) : (
        <>
          <RankingTable
            rankLabel={t("rank")}
            playerLabel={t("player")}
            rankOffset={(page - 1) * pageSize}
            columns={[
              sortColumn("wins", t("wins")),
              sortColumn("best", t("best")),
              sortColumn("races", t("races"), true),
            ]}
            rows={rows.map((row) => ({
              key: row.pubkey,
              name: row.display_name ?? shortPubkey(row.pubkey),
              avatarUrl: row.avatar_url,
              values: [row.wins, row.bestPoints, row.races],
            }))}
          />

          {totalPages > 1 && (
            <nav className={styles.pagination} aria-label={t("title")}>
              <Link
                href={{
                  pathname: "/leaderboard",
                  query: { page: page - 1, sort },
                }}
                className={cn(
                  styles.pageLink,
                  page <= 1 && styles.pageLinkDisabled
                )}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
              >
                ← {t("prev")}
              </Link>
              <span className={styles.pageStatus}>
                {t("pageOf", { page, total: totalPages })}
              </span>
              <Link
                href={{
                  pathname: "/leaderboard",
                  query: { page: page + 1, sort },
                }}
                className={cn(
                  styles.pageLink,
                  page >= totalPages && styles.pageLinkDisabled
                )}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
              >
                {t("next")} →
              </Link>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

export default LeaderboardTable;
