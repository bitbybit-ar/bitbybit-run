"use client";

/**
 * Tracks whether the local player is inside an abandonable match (lobby seat
 * taken → racing → waiting for the others), so navigating away can warn first.
 * A live match is all peer-to-peer with no server, so one player bailing can
 * strand or DNF the rest — this is the guard that gives them a chance to stay.
 *
 * Two interception points while `active`:
 *   - `beforeunload` for hard navigation (refresh, tab close, address bar),
 *   - a capture-phase click listener on in-app links (`<a>`), since the App
 *     Router has no built-in navigation blocker. In-game controls are buttons,
 *     not anchors, so they're untouched; only real navigation is confirmed.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  useEffect(() => {
    if (!active) return;
    const message = t("leaveConfirm");

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
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [active, t]);

  const value = useCallback((on: boolean) => setActive(on), []);

  return (
    <ActiveMatchContext.Provider value={{ setActive: value }}>
      {children}
    </ActiveMatchContext.Provider>
  );
}

export default ActiveMatchProvider;
