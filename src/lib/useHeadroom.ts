import { useEffect, useRef, useState } from "react";

/**
 * Pure decision function — given the last known scroll position, the new
 * one, and the two tuning thresholds, decides whether the header should
 * be visible. Extracted from the hook below so this core logic can be
 * unit tested directly without needing a DOM/jsdom environment — see
 * useHeadroom.test.ts.
 */
export function computeHeadroomVisibility(
  lastY: number,
  y: number,
  currentlyVisible: boolean,
  threshold: number,
  pinnedBelow: number
): boolean {
  const delta = y - lastY;
  if (y <= pinnedBelow) return true;
  if (delta > threshold) return false; // scrolling down past the pinned zone — hide
  if (delta < -threshold) return true; // scrolling up — show immediately
  return currentlyVisible; // within the threshold "dead zone" — no change, avoids flicker
}

/**
 * Same idea as the Headroom.js plugin (hide the header while scrolling
 * down, show it again as soon as the user scrolls up even slightly) —
 * implemented natively here instead of pulling in the headroom.js
 * package, since the actual behavior is about 20 lines of code and this
 * avoids an extra runtime dependency + its own DOM-manipulation API
 * fighting with React's.
 *
 * @param containerRef - the scrollable element to watch. Pass a ref to
 *   `<main>` (or whichever element actually scrolls) — NOT `window`,
 *   since this app's content area, not the whole page, is what scrolls.
 * @param options.threshold - pixels of upward scroll before re-showing
 *   (a small threshold avoids flicker from tiny scroll jitter)
 * @param options.pinnedBelow - always stay visible until scrolled past
 *   this many pixels (so the header doesn't hide immediately on a page
 *   that's barely taller than the viewport)
 */
export function useHeadroom(
  containerRef: React.RefObject<HTMLElement>,
  options: { threshold?: number; pinnedBelow?: number } = {}
): boolean {
  const { threshold = 8, pinnedBelow = 80 } = options;
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    lastY.current = el.scrollTop;

    function onScroll() {
      const y = el!.scrollTop;
      setVisible((prev) => computeHeadroomVisibility(lastY.current, y, prev, threshold, pinnedBelow));
      lastY.current = y;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef, threshold, pinnedBelow]);

  return visible;
}
