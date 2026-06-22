"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (`public/sw.js`) for every visitor so the
 * practice game and app shell are cached for offline use. Registration is
 * deferred until after `load` so it never competes with the initial render, and
 * any failure is swallowed (it just means no offline support / no install
 * prompt — never fatal). Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // No offline support / install prompt — degrade silently.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

export default ServiceWorkerRegistrar;
