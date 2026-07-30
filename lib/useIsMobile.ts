"use client";

import { useEffect, useState } from "react";

// FullCalendar's `initialView`/`headerToolbar` only apply once on mount,
// so callers that need to swap configs across the breakpoint should key
// the component on this value to force a clean remount.
export function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpointPx]);

  return isMobile;
}
