"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DomRenderer, BookmarkForRender } from "@/lib/spatial/dom-renderer";
import type { Bookmark } from "@/lib/types";

export interface FocusState {
  phase: "closed" | "opening" | "opened" | "closing";
  isActive: boolean;
  isAnimating: boolean;
  bookmark: BookmarkForRender | null;
  startRect: DOMRect | null;
  targetRect: DOMRect | null;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Safety net: feature flag for ripple — allows instant disable via query param
// or env without code change, for migration to main feed.
export const isRippleEnabled = () => {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.has("noripple") || params.has("disableRipple") || params.has("no-ripple")) return false;
  }
  // Env flag: NEXT_PUBLIC_RIPPLE_DISABLED=1 or NEXT_PUBLIC_ENABLE_RIPPLE=false
  if (typeof process !== "undefined" && (process.env as unknown as Record<string, string | undefined>)) {
    const env = process.env as Record<string, string | undefined>;
    if (env.NEXT_PUBLIC_RIPPLE_DISABLED === "1" || env.NEXT_PUBLIC_RIPPLE_DISABLED === "true") return false;
    if (env.NEXT_PUBLIC_ENABLE_RIPPLE === "false" || env.NEXT_PUBLIC_ENABLE_RIPPLE === "0") return false;
  }
  return true;
};

export function useSpatialFocus(
  engineRef: React.RefObject<{ raf: number | null; animating: boolean } | null>,
  viewportRef: React.RefObject<HTMLElement | null>,
  worldRef: React.RefObject<HTMLDivElement | null>,
  rendererRef: React.RefObject<DomRenderer | null>,
  bookmarkMapRef: React.RefObject<Map<string, BookmarkForRender>>,
  // Optional for masonry (original feed) — fallback to engine.elToBookmark
  getBookmarkForElement?: (el: HTMLElement) => BookmarkForRender | Bookmark | undefined
) {
  const [focusState, setFocusState] = useState<FocusState>({
    phase: "closed",
    isActive: false,
    isAnimating: false,
    bookmark: null,
    startRect: null,
    targetRect: null,
  });

  // Expose for debugging when flag is set
  useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as { __SPATIAL_FOCUS_DEBUG?: boolean }).__SPATIAL_FOCUS_DEBUG) {
      (window as unknown as { __focusState?: FocusState }).__focusState = focusState;
      console.log(`[useSpatialFocus] focusState isActive=${focusState.isActive} isAnimating=${focusState.isAnimating} bookmark=${!!focusState.bookmark}`);
    }
  }, [focusState]);

  const isActiveRef = useRef(false);
  const animRef = useRef<number | null>(null);
  const cloneRef = useRef<HTMLDivElement | null>(null);
  const whiteRef = useRef<HTMLDivElement | null>(null);
  const neighborStateRef = useRef<
    Array<{
      el: HTMLElement;
      startRect: DOMRect;
      center: { x: number; y: number };
      origTransform: string;
      origOpacity: string;
      origTransition: string;
      origPx: number;
      origPy: number;
      scalePart: string;
    }>
  >([]);
  const selectedElRef = useRef<HTMLElement | null>(null);
  const viewportRectRef = useRef<DOMRect | null>(null);
  const selectedCenterRef = useRef<{ x: number; y: number } | null>(null);
  const startRectRef = useRef<DOMRect | null>(null);
  const targetRectRef = useRef<DOMRect | null>(null);
  const bookmarkRef = useRef<BookmarkForRender | null>(null);
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (keyHandlerRef.current) {
      document.removeEventListener("keydown", keyHandlerRef.current);
      keyHandlerRef.current = null;
    }
    if (cloneRef.current) {
      cloneRef.current.remove();
      cloneRef.current = null;
    }
    if (whiteRef.current) {
      whiteRef.current.remove();
      whiteRef.current = null;
    }
    // Restore neighbors
    for (const n of neighborStateRef.current) {
      n.el.style.transform = n.origTransform;
      n.el.style.opacity = n.origOpacity;
      n.el.style.transition = n.origTransition;
      n.el.style.willChange = "";
    }
    neighborStateRef.current = [];
    selectedElRef.current = null;
    viewportRectRef.current = null;
    selectedCenterRef.current = null;
    startRectRef.current = null;
    targetRectRef.current = null;
    bookmarkRef.current = null;
  }, []);

  const open = useCallback(
    (bookmarkId: string, poolEl: HTMLElement) => {
      if (!isRippleEnabled()) return;
      try {
        const engine = engineRef.current as unknown as { raf: number | null; animating: boolean } | null;
        const viewport = viewportRef.current;
        const world = worldRef.current;
        const renderer = rendererRef.current;
        if (!engine || !viewport || !world || !renderer) return;
        if (isActiveRef.current) return;

      const bookmark = bookmarkMapRef.current?.get(bookmarkId);
      if (!bookmark) return;

      // Freeze navigation — cancel any pending engine tick so it can't
      // overwrite the ripple transforms for one frame (the blink).
      isActiveRef.current = true;
      setFocusState({ phase: "opening", isActive: true, isAnimating: true, bookmark, startRect: null, targetRect: null });
      if (engine.raf !== null) {
        cancelAnimationFrame(engine.raf);
        engine.raf = null;
      }
      engine.animating = false;

      const viewportRect = viewport.getBoundingClientRect();
      viewportRectRef.current = viewportRect;

      const startRect = poolEl.getBoundingClientRect();
      const selCenter = {
        x: startRect.left + startRect.width / 2,
        y: startRect.top + startRect.height / 2,
      };
      selectedCenterRef.current = selCenter;
      selectedElRef.current = poolEl;

      // Capture neighbors: all visible poolEls except selected
      // Use viewport-relative screen positions to avoid blink from transform parsing.
      const allItems = Array.from(world.querySelectorAll<HTMLElement>(".grid-item"));
      const neighbors: typeof neighborStateRef.current = [];
      for (const el of allItems) {
        if (el === poolEl) continue;
        if (el.style.display === "none") continue;
        if (el.offsetWidth <= 0 || el.offsetHeight <= 0) continue;
        const r = el.getBoundingClientRect();
        const t = el.style.transform || "";
        const scaleMatch = t.match(/scale\([^)]+\)/);
        const scalePart = scaleMatch ? ` ${scaleMatch[0]}` : "";
        // Viewport-relative original position (what the engine wrote)
        const origPx = r.left - viewportRect.left;
        const origPy = r.top - viewportRect.top;
        neighbors.push({
          el,
          startRect: r,
          center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          origTransform: t,
          origOpacity: el.style.opacity,
          origTransition: el.style.transition,
          origPx,
          origPy,
          scalePart,
        });
      }
      neighborStateRef.current = neighbors;

      // Prepare neighbors for compositor animation
      for (const n of neighbors) {
        n.el.style.willChange = "transform, opacity";
        n.el.style.transition = "none";
      }

      // Create white takeover (progressive) — covers the receding board
      // and provides the empty-space click target to return to the feed.
      // In dark mode, use the page's dark background so the takeover feels native.
      const isDark = typeof document !== "undefined" && document.body.classList.contains("dark-mode");
      const takeoverBg = isDark ? "rgb(0, 0, 0)" : "white";
      const cloneBg = isDark ? "rgb(26, 26, 26)" : "white";
      const white = document.createElement("div");
      white.style.position = "fixed";
      white.style.inset = "0";
      white.style.background = takeoverBg;
      white.style.opacity = "0";
      white.style.zIndex = "40000";
      white.style.pointerEvents = "auto";
      white.style.cursor = "pointer";
      white.style.willChange = "opacity";
      document.body.appendChild(white);
      whiteRef.current = white;

      // Create clone (fixed-position, sharp media only) — above the white
      const clone = document.createElement("div");
      clone.style.position = "fixed";
      clone.style.left = `${startRect.left}px`;
      clone.style.top = `${startRect.top}px`;
      clone.style.width = `${startRect.width}px`;
      clone.style.height = `${startRect.height}px`;
      clone.style.zIndex = "40001";
      clone.style.overflow = "hidden";
      clone.style.borderRadius = getComputedStyle(poolEl).borderRadius;
      clone.style.background = cloneBg;
      // Subtle, soft elevation — large blur, small offset, low opacity.
      // Static during the 400ms expansion (not animated per frame) so the
      // media stays sharp and the card feels gently lifted.
      // Dark mode uses a stronger shadow for separation against the dark takeover.
      clone.style.boxShadow = isDark
        ? "0 12px 40px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.35)"
        : "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)";
      clone.style.willChange = "transform";
      clone.style.pointerEvents = "auto";
      // Clone itself should not close on click — only the surrounding white
      // (empty space) returns to the feed. This keeps the media interactive
      // for the upcoming + Details affordance.
      clone.style.cursor = "default";

      // Clone media: image only, keep sharp, no blur
      const hasImage = bookmark.images && bookmark.images.length > 0;
      if (hasImage) {
        const img = document.createElement("img");
        // Use the same src as the poolEl's img if available, otherwise bookmark url
        const poolImg = poolEl.querySelector("img") as HTMLImageElement | null;
        const src = poolImg?.src || bookmark.images[0].url;
        img.src = src;
        img.alt = bookmark.text?.slice(0, 80) || "";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.display = "block";
        img.style.background = cloneBg;
        clone.appendChild(img);
      } else {
        // Text-only: show a clean card with the same background
        clone.style.display = "flex";
        clone.style.alignItems = "center";
        clone.style.justifyContent = "center";
        clone.style.padding = "24px";
        clone.style.fontSize = "16px";
        clone.style.color = "var(--foreground)";
        clone.style.background = cloneBg;
        clone.textContent = bookmark.text?.slice(0, 200) || "Bookmark";
      }

      // Only the surrounding white (empty space) returns to the feed.
      // Clicking the centered media itself stays in presentation (for + Details).
      white.addEventListener("click", () => close());

      document.body.appendChild(clone);
      cloneRef.current = clone;

      // Hide the original poolEl during focus (keep it mounted but invisible to avoid pool reuse)
      poolEl.style.visibility = "hidden";

      // Compute target rect for clone (centered, dominant)
      const vw = viewportRect.width;
      const vh = viewportRect.height;
      const maxW = Math.min(vw * 0.78, 920);
      const maxH = Math.min(vh * 0.75, 720);
      let targetW: number;
      let targetH: number;
      if (hasImage) {
        const img = bookmark.images[0];
        const aspect = img.width / img.height;
        // Fit within maxW/maxH preserving aspect
        if (maxW / aspect <= maxH) {
          targetW = maxW;
          targetH = maxW / aspect;
        } else {
          targetH = maxH;
          targetW = maxH * aspect;
        }
        // Clamp to viewport with padding
        targetW = Math.min(targetW, vw - 48);
        targetH = Math.min(targetH, vh - 80);
      } else {
        targetW = Math.min(520, vw - 32);
        targetH = Math.min(400, vh - 80);
      }
      const targetLeft = viewportRect.left + (vw - targetW) / 2;
      const targetTop = viewportRect.top + (vh - targetH) / 2;
      const targetRect = new DOMRect(targetLeft, targetTop, targetW, targetH);
      startRectRef.current = startRect;
      targetRectRef.current = targetRect;
      bookmarkRef.current = bookmark;

      // Start the compositor animation before React state — the state update
      // triggers a re-render that can block the first rAF by ~300ms (observed).
      // Keep the visual (clone/white/neighbors) on the fast path.
      const startTime2 = performance.now();
      const duration = 400; // 350-450 spec, centered
      const maxDiag = Math.hypot(vw, vh);
      const maxPush = maxDiag * 0.45;

      const animate = () => {
        const now2 = performance.now();
        const elapsed = now2 - startTime2;
        const t = Math.min(1, elapsed / duration);
        const ease = easeInOutCubic(t);

        // Progressive white takeover — the board is pushed *under* the white,
        // not faded as a whole. Keep world at 1; per-card opacity handles fade.
        if (whiteRef.current) {
          whiteRef.current.style.opacity = `${ease * 0.98}`;
        }

        // Animate clone from startRect to targetRect
        if (cloneRef.current) {
          const curLeft = startRect.left + (targetRect.left - startRect.left) * ease;
          const curTop = startRect.top + (targetRect.top - startRect.top) * ease;
          const curW = startRect.width + (targetRect.width - startRect.width) * ease;
          const curH = startRect.height + (targetRect.height - startRect.height) * ease;
          cloneRef.current.style.left = `${curLeft}px`;
          cloneRef.current.style.top = `${curTop}px`;
          cloneRef.current.style.width = `${curW}px`;
          cloneRef.current.style.height = `${curH}px`;
        }

        // Animate neighbors outward + fade — true ripple, not a lightbox.
        // Use screen-space displacement from the frozen start positions; no
        // append-to-base transform which caused the blink/jump.
        for (let idx = 0; idx < neighborStateRef.current.length; idx++) {
          const n = neighborStateRef.current[idx];
          const vecX = n.center.x - selCenter.x;
          const vecY = n.center.y - selCenter.y;
          const dist = Math.hypot(vecX, vecY) || 1;
          const normX = vecX / dist;
          const normY = vecY / dist;
          const distNorm = Math.min(1, dist / (maxDiag * 0.72));
          // More visible push for adjacent cards (was 0.25+0.75, too subtle)
          const push = maxPush * (0.38 + 0.62 * distNorm) * ease;
          const dx = normX * push;
          const dy = normY * push;
          const nx = n.origPx + dx;
          const ny = n.origPy + dy;
          n.el.style.transform = `translate3d(${nx}px, ${ny}px, 0)${n.scalePart}`;

          // Progressive distance fade — keep close neighbors readable,
          // far ones recede. Tuned so a 200px neighbor stays ~0.85 at mid.
          let fade = 0.65 * ease * Math.max(0.12, Math.min(1, dist / (maxDiag * 0.45)));
          // Boundary fade: when the displaced card touches the viewport edge,
          // accelerate fade for a clean white takeover.
          const displacedLeft = n.startRect.left + dx;
          const displacedTop = n.startRect.top + dy;
          const displacedRight = displacedLeft + n.startRect.width;
          const displacedBottom = displacedTop + n.startRect.height;
          const edgeDist = Math.min(
            displacedLeft - viewportRect.left,
            displacedTop - viewportRect.top,
            viewportRect.right - displacedRight,
            viewportRect.bottom - displacedBottom
          );
          if (edgeDist < 90) {
            const boundaryFade = ((90 - edgeDist) / 90) * 0.45 * ease;
            fade = Math.min(1, fade + boundaryFade);
          }
          const opacity = Math.max(0, 1 - fade);
          n.el.style.opacity = `${opacity}`;
        }

        if (t < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          animRef.current = null;
          setFocusState({ phase: "opened", isActive: true, isAnimating: false, bookmark, startRect, targetRect });
          // Ensure final white, keep world at 1 (per-card fade does the work)
          if (whiteRef.current) whiteRef.current.style.opacity = "0.98";
        }
      };

      animRef.current = requestAnimationFrame(animate);

      // Esc also returns to the feed (persistent while focus is active)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      keyHandlerRef.current = onKey;
      document.addEventListener("keydown", onKey);
      } catch (e) {
        console.error("[ripple] open failed", e);
        cleanup();
        isActiveRef.current = false;
        setFocusState({ phase: "closed", isActive: false, isAnimating: false, bookmark: null, startRect: null, targetRect: null });
      }
    },
    [cleanup]
  );

  const close = useCallback(() => {
    if (!isActiveRef.current) return;
    // Safety: if ripple is disabled mid-animation, just clean up
    if (!isRippleEnabled()) {
      cleanup();
      const poolEl2 = selectedElRef.current;
      if (poolEl2) poolEl2.style.visibility = "";
      setFocusState({ phase: "closed", isActive: false, isAnimating: false, bookmark: null, startRect: null, targetRect: null });
      isActiveRef.current = false;
      return;
    }
    try {
      const startRect = startRectRef.current;
      const targetRect = targetRectRef.current;
      const selCenter = selectedCenterRef.current;
      const clone = cloneRef.current;
      const white = whiteRef.current;
      const neighbors = neighborStateRef.current;
      const poolEl = selectedElRef.current;

      if (!startRect || !targetRect || !selCenter || !clone || !white) {
        // Fallback immediate cleanup (no animation state to reverse from)
        cleanup();
        if (poolEl) poolEl.style.visibility = "";
        setFocusState({ phase: "closed", isActive: false, isAnimating: false, bookmark: null, startRect: null, targetRect: null });
        isActiveRef.current = false;
        return;
      }

    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    // If close is called mid-open, capture current progress so the
    // reverse starts from the visible mid state, not from the final target.
    const currentCloneRect = clone.getBoundingClientRect();
    const denomX = targetRect.left - startRect.left || 1;
    const currentEaseRaw = (currentCloneRect.left - startRect.left) / denomX;
    const currentEase = Math.min(1, Math.max(0, Number.isFinite(currentEaseRaw) ? currentEaseRaw : 1));
    const startRev = Math.max(0.12, Math.min(1, currentEase || 1));

    // Hide details immediately on close start (isAnimating true → SpatialFocusDetails hidden)
    setFocusState({ phase: "closing", isActive: true, isAnimating: true, bookmark: bookmarkRef.current, startRect, targetRect });

    const startTime = performance.now();
    const duration = 360; // fixed — keeps the return visible even from mid-open
    const vw = viewportRectRef.current?.width || window.innerWidth;
    const vh = viewportRectRef.current?.height || window.innerHeight;
    const maxDiag = Math.hypot(vw, vh);
    const maxPush = maxDiag * 0.45;
    const vpRect = viewportRectRef.current || new DOMRect(0, 0, vw, vh);

    const animateClose = () => {
      const now2 = performance.now();
      const elapsed = now2 - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = easeInOutCubic(t);
      const rev = startRev * (1 - ease);

      if (white) white.style.opacity = `${rev * 0.98}`;

      // Clone back to start from its current mid-open position
      const curLeft = currentCloneRect.left + (startRect.left - currentCloneRect.left) * ease;
      const curTop = currentCloneRect.top + (startRect.top - currentCloneRect.top) * ease;
      const curW = currentCloneRect.width + (startRect.width - currentCloneRect.width) * ease;
      const curH = currentCloneRect.height + (startRect.height - currentCloneRect.height) * ease;
      clone.style.left = `${curLeft}px`;
      clone.style.top = `${curTop}px`;
      clone.style.width = `${curW}px`;
      clone.style.height = `${curH}px`;

      // Neighbors back — exact reverse of open, settle in same place
      for (const n of neighbors) {
        const vecX = n.center.x - selCenter.x;
        const vecY = n.center.y - selCenter.y;
        const dist = Math.hypot(vecX, vecY) || 1;
        const normX = vecX / dist;
        const normY = vecY / dist;
        const distNorm = Math.min(1, dist / (maxDiag * 0.72));
        const push = maxPush * (0.38 + 0.62 * distNorm) * rev;
        const dx = normX * push;
        const dy = normY * push;
        const nx = n.origPx + dx;
        const ny = n.origPy + dy;
        n.el.style.transform = `translate3d(${nx}px, ${ny}px, 0)${n.scalePart}`;

        let fade = 0.65 * rev * Math.max(0.12, Math.min(1, dist / (maxDiag * 0.45)));
        const displacedLeft = n.startRect.left + dx;
        const displacedTop = n.startRect.top + dy;
        const displacedRight = displacedLeft + n.startRect.width;
        const displacedBottom = displacedTop + n.startRect.height;
        const edgeDist = Math.min(
          displacedLeft - vpRect.left,
          displacedTop - vpRect.top,
          vpRect.right - displacedRight,
          vpRect.bottom - displacedBottom
        );
        if (edgeDist < 90) {
          const boundaryFade = ((90 - edgeDist) / 90) * 0.45 * rev;
          fade = Math.min(1, fade + boundaryFade);
        }
        const opacity = Math.max(0, 1 - fade);
        n.el.style.opacity = `${opacity}`;
        if (t >= 1) {
          n.el.style.transform = n.origTransform;
          n.el.style.opacity = n.origOpacity;
          n.el.style.transition = n.origTransition;
          n.el.style.willChange = "";
        }
      }

      if (t < 1) {
        animRef.current = requestAnimationFrame(animateClose);
      } else {
        animRef.current = null;
        cleanup();
        if (poolEl) poolEl.style.visibility = "";
        setFocusState({ phase: "closed", isActive: false, isAnimating: false, bookmark: null, startRect: null, targetRect: null });
        isActiveRef.current = false;
      }
    };

    animRef.current = requestAnimationFrame(animateClose);
    } catch (e) {
      console.error("[ripple] close failed", e);
      cleanup();
      const poolEl2 = selectedElRef.current;
      if (poolEl2) poolEl2.style.visibility = "";
      setFocusState({ phase: "closed", isActive: false, isAnimating: false, bookmark: null, startRect: null, targetRect: null });
      isActiveRef.current = false;
    }
  }, [cleanup, focusState.startRect, focusState.targetRect]);

  return {
    focusState,
    isActiveRef,
    open,
    close,
  };
}
