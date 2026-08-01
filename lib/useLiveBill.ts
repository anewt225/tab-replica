"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SerializedBill } from "./bills";

/**
 * Live sync.
 *
 * Polls a one-integer endpoint and refetches the bill only when that integer
 * changes. Vercel functions can't hold WebSockets and Neon's pooler has no
 * LISTEN/NOTIFY, so this is both the simplest option and the reliable one — and
 * for four people round a table it is indistinguishable from push.
 *
 * Backs off when nothing is happening and stops entirely when the tab is
 * hidden, so a phone left on the table doesn't poll all night.
 */
const ACTIVE_MS = 2000;
const IDLE_MS = 10_000;
const IDLE_AFTER_MS = 120_000;

export function useLiveBill(slug: string, initial: SerializedBill) {
  const [bill, setBill] = useState(initial);
  const [connected, setConnected] = useState(true);

  // Refs, not state: these change every tick and must not trigger a re-render.
  const versionRef = useRef(initial.version);
  // Seeded on mount in the effect below rather than here — a `useRef(Date.now())`
  // initializer re-runs `Date.now()` on every render (the argument is evaluated
  // even though only the first value is kept), which is both wasteful and impure
  // during render.
  const lastChangeRef = useRef(0);

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/bills/${slug}`, { cache: "no-store" });
    if (!response.ok) return;
    const fresh: SerializedBill = await response.json();
    versionRef.current = fresh.version;
    lastChangeRef.current = Date.now();
    setBill(fresh);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Mount counts as the last "change" — without this the first tick would see
    // a zero timestamp, conclude the bill had been quiet forever, and drop
    // straight to the 10s idle interval instead of polling actively.
    lastChangeRef.current = Date.now();

    async function tick() {
      if (cancelled) return;

      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, ACTIVE_MS);
        return;
      }

      try {
        const response = await fetch(`/api/bills/${slug}/version`, {
          cache: "no-store",
        });
        if (response.ok) {
          const { version } = (await response.json()) as { version: number };
          setConnected(true);
          if (version !== versionRef.current) {
            versionRef.current = version;
            lastChangeRef.current = Date.now();
            await refetch();
          }
        }
      } catch {
        // Offline or a flaky connection. Keep polling — the next tick recovers.
        if (!cancelled) setConnected(false);
      }

      if (cancelled) return;
      const quiet = Date.now() - lastChangeRef.current > IDLE_AFTER_MS;
      timer = setTimeout(tick, quiet ? IDLE_MS : ACTIVE_MS);
    }

    timer = setTimeout(tick, ACTIVE_MS);

    // Coming back to the tab should feel instant, not "up to 10s stale".
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastChangeRef.current = Date.now();
        void refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, refetch]);

  /** Apply a local change immediately, then reconcile with the server. */
  const mutate = useCallback(
    (optimistic: (current: SerializedBill) => SerializedBill) => {
      setBill(optimistic);
      lastChangeRef.current = Date.now();
    },
    [],
  );

  return { bill, setBill, refetch, mutate, connected };
}
