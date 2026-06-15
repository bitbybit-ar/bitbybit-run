"use client";

import { useEffect, useState } from "react";

/**
 * Whole seconds remaining until `until` (a unix-ms deadline), ticking down to
 * 0; returns null when no deadline is set. Used for the shared finish-grace
 * countdown on the waiting screen and the in-race "time to cross" banner, so
 * both show the same number off the snapshot's `finishGraceUntil`.
 */
export function useCountdown(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until == null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [until]);

  if (until == null) return null;
  return Math.max(0, Math.ceil((until - now) / 1000));
}
