"use client";

import { useEffect, useState } from "react";

/**
 * Tracks browser connectivity via `navigator.onLine` and the `online` /
 * `offline` events.
 *
 * SSR-safe: returns `true` on the server and the first client render (the
 * optimistic default, so hydration matches and we never flash an offline
 * warning), then reconciles to the real value on mount.
 *
 * Used to tell the player that practice still works offline while the
 * multiplayer lobby — which needs the Nostr relays — does not. Note
 * `navigator.onLine` only reports the network interface, not real
 * reachability, so treat `false` as a reliable "definitely offline" signal and
 * `true` as "probably online."
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
