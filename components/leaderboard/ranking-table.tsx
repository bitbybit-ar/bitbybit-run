import type { ComponentProps } from "react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import styles from "./leaderboard-table.module.scss";

export interface RankingColumn {
  label: string;
  /** Hidden on phones to keep rows tidy (e.g. the global "races" column). */
  collapsible?: boolean;
  /** When set, the header becomes a link that re-sorts the table by this
   *  column (used by the global leaderboard; the results screen leaves it off). */
  sortHref?: ComponentProps<typeof Link>["href"];
  /** True when the table is currently sorted by this column. */
  active?: boolean;
  /** Accessible label for the sort link (e.g. "Sort by wins"). */
  sortLabel?: string;
}

export interface RankingRow {
  /** Stable React key — usually the pubkey. */
  key: string;
  name: string;
  avatarUrl?: string | null;
  /** Trailing numeric cells, aligned 1:1 with `columns`. */
  values: Array<string | number>;
  /** Highlight this row as the viewer's own (results screen). */
  isCurrentUser?: boolean;
}

/**
 * Presentational ranking table — the shared visual behind both the global
 * leaderboard and the end-of-match results screen: a rank badge (podium colors
 * for the top three), a player chip (avatar or initial + name), and a
 * configurable set of right-aligned numeric columns. No data fetching or i18n
 * here so it works in both server and client trees; callers pass translated
 * labels + ready-made rows.
 */
export function RankingTable({
  rankLabel,
  playerLabel,
  columns,
  rows,
  rankOffset = 0,
}: {
  rankLabel: string;
  playerLabel: string;
  columns: RankingColumn[];
  rows: RankingRow[];
  /** Rank of the first row minus one — so paginated pages show global ranks
   *  (page 2 → 11, 12, …) and podium colors stay on the true top three. */
  rankOffset?: number;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colRank} scope="col">
              {rankLabel}
            </th>
            <th className={styles.colPlayer} scope="col">
              {playerLabel}
            </th>
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  styles.colNum,
                  col.collapsible && styles.colRaces
                )}
                scope="col"
                aria-sort={
                  col.sortHref ? (col.active ? "descending" : "none") : undefined
                }
              >
                {col.sortHref ? (
                  <Link
                    href={col.sortHref}
                    className={cn(styles.sortLink, col.active && styles.sortActive)}
                    aria-label={col.sortLabel}
                  >
                    {col.label}
                    <span aria-hidden="true">{col.active ? " ▼" : ""}</span>
                  </Link>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rank = rankOffset + i + 1;
            const podium =
              rank === 1
                ? styles.gold
                : rank === 2
                  ? styles.silver
                  : rank === 3
                    ? styles.bronze
                    : undefined;

            return (
              <tr
                key={row.key}
                className={cn(
                  podium && styles.podiumRow,
                  row.isCurrentUser && styles.meRow
                )}
              >
                <td className={styles.colRank}>
                  <span className={cn(styles.rankBadge, podium)}>{rank}</span>
                </td>
                <td className={styles.colPlayer}>
                  <span className={styles.player}>
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary Nostr avatar URLs
                      <img
                        className={styles.avatar}
                        src={row.avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className={styles.avatarFallback}
                        aria-hidden="true"
                      >
                        {row.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className={styles.name}>{row.name}</span>
                  </span>
                </td>
                {row.values.map((value, j) => (
                  <td
                    key={j}
                    className={cn(
                      styles.colNum,
                      columns[j]?.collapsible && styles.colRaces
                    )}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RankingTable;
