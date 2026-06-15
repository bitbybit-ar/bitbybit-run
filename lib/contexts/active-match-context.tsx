"use client";

/**
 * Tracks whether the local player is inside an abandonable match (lobby seat
 * taken → racing → waiting for the others), so navigating away can warn first.
 * A live match is all peer-to-peer with no server, so one player bailing can
 * strand or DNF the rest — this is the guard that gives them a chance to stay.
 *
 * Three interception points while `active`:
 *   - `beforeunload` for hard navigation (refresh, tab close, address bar),
 *   - a capture-phase click listener on in-app links (`<a>`), since the App
 *     Router has no built-in navigation blocker. In-game controls are buttons,
 *     not anchors, so they're untouched; only real navigation is confirmed,
 *   - a `popstate` + sentinel-entry trap for the browser back/forward buttons,
 *     which the App Router handles client-side (so beforeunload never fires).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

interface ActiveMatchValue {
  /** Mark the player as in (true) / out of (false) an abandonable match. */
  setActive: (on: boolean) => void;
}

const ActiveMatchContext = createContext<ActiveMatchValue>({
  setActive: () => {},
});

/** Lets an in-match view flag itself so leaving the page is confirmed. */
export function useActiveMatch(): ActiveMatchValue {
  return useContext(ActiveMatchContext);
}

export function ActiveMatchProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("play");
  const [active, setActive] = useState(false);
  // Read the prompt through a ref so the guard effect depends only on `active`
  // — re-running it on an unstable `t` reference would stack history sentinels.
  const messageRef = useRef("");
  messageRef.current = t("leaveConfirm");

  useEffect(() => {
    if (!active) return;

    // Hard navigation (refresh / close / address bar): native browser prompt.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // In-app navigation: confirm before following any link that leaves the
    // page. Capture phase so we can cancel before the router's own handler.
    const onClickCapture = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return; // new-tab / modified clicks behave normally
      }
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || href.startsWith("#")) return; // not a navigation
      // A new-tab / download link doesn't unload this page — let it through.
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (!window.confirm(messageRef.current)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Browser back/forward: the App Router navigates client-side without
    // firing beforeunload, so trap it. We push a same-URL "sentinel" entry on
    // top of the current one; the first back press pops that (a no-op popstate
    // to the same URL, so nothing visibly moves) and lets us confirm. Decline →
    // re-push the sentinel and stay; accept → go back for real, past it.
    let confirmedLeave = false;
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      if (confirmedLeave) return; // our own history.back() below — let it run
      if (window.confirm(messageRef.current)) {
        confirmedLeave = true;
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active]);

  const value = useCallback((on: boolean) => setActive(on), []);

  return (
    <ActiveMatchContext.Provider value={{ setActive: value }}>
      {children}
    </ActiveMatchContext.Provider>
  );
}

export default ActiveMatchProvider;
