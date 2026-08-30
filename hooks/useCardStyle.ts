"use client";

import { useEffect, useRef } from "react";
import { useDialKit } from "dialkit";

/**
 * Card Style — CSS-only tuning.
 * Owns the visual card radius and never touches the spatial engine.
 * Default 12px matches the golden `12px` in globals.css, so a disabled/
 * reset dial reproduces the baseline byte-for-byte. The value is applied
 * only as a static CSS variable (--card-radius); it is never read per-frame
 * and never scaled by zoom, preserving the FLUID-ZOOM INVARIANT.
 */
export function useCardStyle() {
  const style = useDialKit(
    "Card Style",
    {
      cardRadius: [12, 0, 24, 1],
    },
    {
      id: "card-style",
      persist: { key: "kairos-card-style" },
    }
  );

  // Radius is CSS-only; the expensive part is browser style recalculation
  // across ~1100 mounted cards. Coalesce rapid slider ticks to at most one
  // style write per frame (rAF), so dragging shows live feedback but doesn't
  // force a recalc on every intermediate DialKit tick. This is intentionally
  // separate from Grid Gap's 220ms debounce for computeFit→computeGrid→morph.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const isFirstRef = useRef(true);

  useEffect(() => {
    const raw = Number((style as { cardRadius: unknown }).cardRadius);
    const v = Number.isFinite(raw) ? Math.max(0, Math.min(24, raw)) : 12;

    // First mount: apply immediately so the initial paint is correct.
    if (isFirstRef.current) {
      isFirstRef.current = false;
      document.documentElement.style.setProperty("--card-radius", `${v}px`);
      return;
    }

    pendingRef.current = v;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const val = pendingRef.current;
      pendingRef.current = null;
      if (val !== null) {
        document.documentElement.style.setProperty("--card-radius", `${val}px`);
      }
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [(style as { cardRadius: unknown }).cardRadius]);

  return style;
}
