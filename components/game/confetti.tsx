import styles from "./confetti.module.scss";

/**
 * Lightweight, dependency-free celebration overlay — a burst of CSS confetti
 * pieces falling across the container. Purely decorative (aria-hidden), and
 * deterministic per index (no Math.random) so server and client markup match.
 */
const PIECES = Array.from({ length: 18 }, (_, i) => i);

export function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {PIECES.map((i) => (
        <span
          key={i}
          className={styles.piece}
          data-color={i % 4}
          style={{
            left: `${(i * 100) / PIECES.length}%`,
            animationDelay: `${(i % 6) * 0.18}s`,
            animationDuration: `${1.8 + (i % 4) * 0.35}s`,
          }}
        />
      ))}
    </div>
  );
}

export default Confetti;
