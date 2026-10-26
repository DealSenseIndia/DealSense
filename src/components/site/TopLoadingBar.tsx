"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim, emerald progress bar pinned to the top of the viewport.
 * It starts on internal link clicks / popstate and completes when the
 * App Router commits the new pathname (or query string).
 */
function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const running = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledKey = useRef(routeKey);
  const reduceMotion = useRef(false);

  const clearTimers = useCallback(() => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (failsafe.current) {
      clearTimeout(failsafe.current);
      failsafe.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (failsafe.current) {
      clearTimeout(failsafe.current);
      failsafe.current = null;
    }
    setFinishing(false);
    setVisible(true);
    setProgress(reduceMotion.current ? 72 : 10);

    // A dead-end click (middle-click quirks, blocked navigation) should never
    // leave the bar parked at 90% forever.
    failsafe.current = setTimeout(() => {
      if (running.current) done();
    }, 9000);

    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      setProgress((value) => {
        if (!running.current) return value;
        // Ease towards 90% and wait there for the route to commit.
        const remaining = 90 - value;
        const step = Math.max(0.6, remaining * 0.11);
        return Math.min(90, value + step);
      });
    }, 140);
  }, []);

  const done = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    setFinishing(true);
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setFinishing(false);
      setProgress(0);
    }, 320);
  }, []);

  useEffect(() => {
    try {
      reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduceMotion.current = false;
    }
    return clearTimers;
  }, [clearTimers]);

  // Finish only when the committed route actually changes.
  useEffect(() => {
    if (settledKey.current === routeKey) return;
    settledKey.current = routeKey;
    done();
  }, [routeKey, done]);

  useEffect(() => {
    function isEligible(anchor: HTMLAnchorElement): boolean {
      const href = anchor.getAttribute("href");
      if (!href) return false;
      if (href.startsWith("#")) return false;
      if (anchor.target && anchor.target !== "_self") return false;
      if (anchor.hasAttribute("download")) return false;
      if (anchor.dataset.noTopLoader === "true") return false;
      if (anchor.getAttribute("aria-disabled") === "true") return false;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const current = `${window.location.pathname}${window.location.search}`;
      if (`${url.pathname}${url.search}` === current) return false;
      return true;
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isEligible(anchor)) return;
      start();
    }

    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px] overflow-visible"
      data-state={visible ? (finishing ? "finishing" : "loading") : "idle"}
    >
      <div
        className="relative h-full origin-left rounded-r-full bg-[linear-gradient(90deg,#047857_0%,#10b981_45%,#34d399_78%,#a7f3d0_100%)] shadow-[0_0_12px_rgba(16,185,129,0.65)]"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition: finishing
            ? "width 220ms ease-out, opacity 260ms ease-out 120ms"
            : "width 200ms ease-out, opacity 160ms ease-out",
        }}
      >
        <span
          className="absolute right-0 top-1/2 h-[7px] w-[7px] -translate-y-1/2 translate-x-1/2 rounded-full bg-emerald-200 opacity-0 transition-opacity duration-200"
          style={{ opacity: visible && !finishing ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

export function TopLoadingBar() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
