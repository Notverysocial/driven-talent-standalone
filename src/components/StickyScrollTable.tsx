"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps a wide table in a horizontally-scrolling container and renders a
 * second scrollbar pinned to the bottom of the viewport (position: sticky),
 * synced both ways. This keeps the horizontal scrollbar reachable even when
 * the table is taller than the screen — so the action buttons in the last
 * column are never stranded off-screen with no visible way to scroll to them
 * (CR #4: "make the horizontal scrollbar accessible (floating/pinned)").
 */
export function StickyScrollTable({ children }: { children: React.ReactNode }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      setScrollWidth(el.scrollWidth);
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const onAreaScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (barRef.current && areaRef.current) {
      barRef.current.scrollLeft = areaRef.current.scrollLeft;
    }
    syncing.current = false;
  };
  const onBarScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (barRef.current && areaRef.current) {
      areaRef.current.scrollLeft = barRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  return (
    <>
      <div ref={areaRef} className="dt-table-wrap" onScroll={onAreaScroll}>
        {children}
      </div>
      <div
        ref={barRef}
        onScroll={onBarScroll}
        aria-hidden="true"
        className="dt-pinned-scrollbar"
        style={{ display: overflowing ? "block" : "none" }}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
    </>
  );
}
