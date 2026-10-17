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

type SpatialSwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  latestX: number;
  latestOffset: number;
  samples: Array<{ x: number; time: number }>;
  horizontal: boolean;
  direction: -1 | 1 | null;
  currentIndex: number;
  ids: string[];
  width: number;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A more gradual standard ease-in-out curve keeps the outgoing and incoming
// frames visibly in motion for longer distances. Retargeting adjusts y1 to
// preserve current velocity within this curve family.
const SLIDE_BEZIER_X1 = 0.4;
const SLIDE_BEZIER_X2 = 0.2;
const SLIDE_BEZIER_Y2 = 1;

const sampleSlideBezier = (progress: number, y1: number) => {
  if (progress <= 0) return { value: 0, slope: y1 / SLIDE_BEZIER_X1 };
  if (progress >= 1) return { value: 1, slope: 0 };

  const xAt = (t: number) =>
    3 * (1 - t) ** 2 * t * SLIDE_BEZIER_X1 +
    3 * (1 - t) * t ** 2 * SLIDE_BEZIER_X2 +
    t ** 3;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 14; iteration++) {
    const middle = (low + high) / 2;
    if (xAt(middle) < progress) low = middle;
    else high = middle;
  }
  const t = (low + high) / 2;
  const inverseT = 1 - t;
  const value = 3 * inverseT ** 2 * t * y1 + 3 * inverseT * t ** 2 * SLIDE_BEZIER_Y2 + t ** 3;
  const dx = 3 * inverseT ** 2 * SLIDE_BEZIER_X1 + 6 * inverseT * t * (SLIDE_BEZIER_X2 - SLIDE_BEZIER_X1) + 3 * t ** 2 * (1 - SLIDE_BEZIER_X2);
  const dy = 3 * inverseT ** 2 * y1 + 6 * inverseT * t * (SLIDE_BEZIER_Y2 - y1) + 3 * t ** 2 * (1 - SLIDE_BEZIER_Y2);
  return { value, slope: dx > 1e-5 ? dy / dx : 0 };
};

const fitBookmarkRect = (bookmark: BookmarkForRender, viewportRect: DOMRect) => {
  const vw = viewportRect.width;
  const vh = viewportRect.height;
  const image = bookmark.images?.[0];
  let width: number;
  let height: number;
  if (image) {
    const aspect = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
    const maxW = Math.min(vw * 0.78, 920, vw - 48);
    const maxH = Math.min(vh * 0.75, 720, vh - 80);
    width = Math.min(maxW, maxH * aspect);
    height = width / aspect;
  } else {
    width = Math.min(520, vw - 32);
    height = Math.min(400, vh - 80);
  }
  return new DOMRect(
    viewportRect.left + (vw - width) / 2,
    viewportRect.top + (vh - height) / 2,
    width,
    height
  );
};

const createSlideContent = (bookmark: BookmarkForRender, background: string) => {
  const image = bookmark.images?.[0];
  const content = image ? document.createElement("img") : document.createElement("div");
  content.style.position = "absolute";
  content.style.inset = "0";
  content.style.width = "100%";
  content.style.height = "100%";
  if (image && content instanceof HTMLImageElement) {
    content.src = image.url;
    content.alt = bookmark.text?.slice(0, 80) || "";
    content.style.display = "block";
    content.style.objectFit = "contain";
    content.style.background = background;
  } else {
    content.style.display = "flex";
    content.style.alignItems = "center";
    content.style.justifyContent = "center";
    content.style.padding = "24px";
    content.style.fontSize = "16px";
    content.style.color = "var(--foreground)";
    content.style.background = background;
    content.textContent = bookmark.text?.slice(0, 200) || "Bookmark";
  }
  return content;
};

const createSwipeFrame = (
  bookmark: BookmarkForRender,
  background: string,
  rect: DOMRect,
  template: HTMLElement,
) => {
  const frame = document.createElement("div");
  frame.style.position = "fixed";
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
  frame.style.zIndex = "40001";
  frame.style.overflow = "hidden";
  frame.style.borderRadius = template.style.borderRadius;
  frame.style.background = background;
  frame.style.boxShadow = template.style.boxShadow;
  frame.style.willChange = "transform";
  frame.style.pointerEvents = "none";
  frame.appendChild(createSlideContent(bookmark, background));
  return frame;
};

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
  getBookmarkForElement?: (el: HTMLElement) => BookmarkForRender | Bookmark | undefined,
  // Resolve cards that were outside the mounted pool when Ripple opened.
  getBookmarkRect?: (bookmarkId: string) => DOMRect | null
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
  // The opening source stays fixed for Ripple's reverse geometry, while the
  // close destination follows the bookmark currently shown after navigation.
  const returnRectRef = useRef<DOMRect | null>(null);
  const targetRectRef = useRef<DOMRect | null>(null);
  const bookmarkRef = useRef<BookmarkForRender | null>(null);
  const openingBookmarkIdRef = useRef<string | null>(null);
  const returnRectResolverRef = useRef<((bookmarkId: string) => DOMRect | null) | null>(null);
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const navigationLockedRef = useRef(false);
  const finishSlideRef = useRef<(() => void) | null>(null);
  const slideRafRef = useRef<number | null>(null);
  const swipeFramesRef = useRef<Array<{ index: number; bookmark: BookmarkForRender; rect: DOMRect; el: HTMLDivElement }>>([]);

  // After each committed slide, the feed resolver pans the underlying camera
  // to the selected card. Rebase Ripple's reverse geometry to that new camera
  // position so closing lands on the selected feed card rather than stale,
  // open-time pool coordinates.
  const rebaseReturnGeometry = useCallback((bookmarkId: string) => {
    const resolve = returnRectResolverRef.current;
    const world = worldRef.current;
    if (!resolve || !world) return;

    for (const neighbor of neighborStateRef.current) {
      neighbor.el.style.transform = neighbor.origTransform;
      neighbor.el.style.opacity = neighbor.origOpacity;
      neighbor.el.style.transition = neighbor.origTransition;
      neighbor.el.style.willChange = "";
    }

    const resolvedRect = resolve(bookmarkId);
    if (!resolvedRect) return;
    const viewportRect = viewportRectRef.current || new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const renderer = rendererRef.current;
    const nextNeighbors: typeof neighborStateRef.current = [];
    let selectedRect: DOMRect | null = null;

    for (const el of Array.from(world.querySelectorAll<HTMLElement>(".grid-item"))) {
      if (el.style.display === "none" || el.offsetWidth <= 0 || el.offsetHeight <= 0) continue;
      const bookmark = renderer?.bookmarkForElement(el);
      if (bookmark?.id === bookmarkId) {
        selectedRect = el.getBoundingClientRect();
        continue;
      }
      const rect = el.getBoundingClientRect();
      const transform = el.style.transform || "";
      const scaleMatch = transform.match(/scale\([^)]+\)/);
      nextNeighbors.push({
        el,
        startRect: rect,
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        origTransform: transform,
        origOpacity: el.style.opacity,
        origTransition: el.style.transition,
        origPx: rect.left - viewportRect.left,
        origPy: rect.top - viewportRect.top,
        scalePart: scaleMatch ? ` ${scaleMatch[0]}` : "",
      });
    }

    const returnRect = selectedRect || resolvedRect;
    neighborStateRef.current = nextNeighbors;
    returnRectRef.current = returnRect;
    selectedCenterRef.current = {
      x: returnRect.left + returnRect.width / 2,
      y: returnRect.top + returnRect.height / 2,
    };
    for (const neighbor of nextNeighbors) {
      neighbor.el.style.willChange = "transform, opacity";
      neighbor.el.style.transition = "none";
    }
  }, [rendererRef, viewportRectRef, worldRef]);

  // Make the presentation behave like a native scroll surface: the active and
  // neighboring frames track the pointer, then coast together and snap on settle.
  const attachSwipeNavigation = useCallback((frame: HTMLElement) => {
    frame.style.touchAction = "pan-y";
    let gesture: SpatialSwipeGesture | null = null;

    const clearSwipeFrames = (keep?: HTMLElement) => {
      for (const candidate of swipeFramesRef.current) {
        if (candidate.el !== keep) candidate.el.remove();
      }
      swipeFramesRef.current = keep
        ? swipeFramesRef.current.filter((candidate) => candidate.el === keep)
        : [];
    };
    const applyOffset = (active: SpatialSwipeGesture, offset: number) => {
      frame.style.transform = `translate3d(${offset}px, 0, 0)`;
      for (const candidate of swipeFramesRef.current) {
        candidate.el.style.transform = `translate3d(${(candidate.index - active.currentIndex) * active.width + offset}px, 0, 0)`;
      }
    };
    const ensureFrames = (active: SpatialSwipeGesture, direction: -1 | 1, count: number) => {
      active.direction = direction;
      const available = direction === 1
        ? active.ids.length - 1 - active.currentIndex
        : active.currentIndex;
      const wanted = Math.min(available, Math.max(1, count));
      for (let step = 1; step <= wanted; step++) {
        const index = active.currentIndex + direction * step;
        if (swipeFramesRef.current.some((candidate) => candidate.index === index)) continue;
        const id = active.ids[index];
        const bookmark = bookmarkMapRef.current?.get(id);
        if (!bookmark) continue;
        const rect = fitBookmarkRect(bookmark, viewportRectRef.current || new DOMRect(0, 0, window.innerWidth, window.innerHeight));
        const isDark = document.body.classList.contains("dark-mode");
        const candidate = createSwipeFrame(bookmark, isDark ? "rgb(26, 26, 26)" : "white", rect, frame);
        candidate.style.transform = `translate3d(${(index - active.currentIndex) * active.width}px, 0, 0)`;
        document.body.appendChild(candidate);
        swipeFramesRef.current.push({ index, bookmark, rect, el: candidate });
      }
    };
    let commandedMotion: {
      active: SpatialSwipeGesture;
      targetIndex: number;
      offset: number;
      startOffset: number;
      startedAt: number;
      duration: number;
      curveY1: number;
      resolves: Array<() => void>;
    } | null = null;
    const finishCommandedMotion = () => {
      const motion = commandedMotion;
      if (!motion) return;
      commandedMotion = null;
      if (slideRafRef.current !== null) cancelAnimationFrame(slideRafRef.current);
      slideRafRef.current = null;
      const target = swipeFramesRef.current.find((candidate) => candidate.index === motion.targetIndex);
      if (target && target.index !== motion.active.currentIndex && cloneRef.current === frame) {
        frame.remove();
        target.el.style.transform = "";
        target.el.style.pointerEvents = "auto";
        target.el.style.touchAction = "pan-y";
        cloneRef.current = target.el;
        targetRectRef.current = target.rect;
        bookmarkRef.current = target.bookmark;
        if (returnRectResolverRef.current) {
          rebaseReturnGeometry(target.bookmark.id);
        } else if (target.bookmark.id === openingBookmarkIdRef.current) {
          returnRectRef.current = startRectRef.current;
        } else {
          const returnTarget = neighborStateRef.current.find(
            (neighbor) => rendererRef.current?.bookmarkForElement(neighbor.el)?.id === target.bookmark.id
          );
          if (returnTarget) returnRectRef.current = returnTarget.startRect;
        }
        setFocusState((current) => current.phase === "opened"
          ? { ...current, bookmark: target.bookmark, targetRect: target.rect }
          : current);
        clearSwipeFrames(target.el);
        swipeFramesRef.current = [];
        attachSwipeNavigation(target.el);
      } else {
        frame.style.transform = "";
        clearSwipeFrames();
      }
      navigationLockedRef.current = false;
      finishSlideRef.current = null;
      for (const resolve of motion.resolves.splice(0)) resolve();
    };
    const onProgrammaticNavigate = (event: Event) => {
      const { bookmarkId, resolve } = (event as CustomEvent<{ bookmarkId: string; resolve: () => void }>).detail;
      const ids = Array.from(bookmarkMapRef.current?.keys() || []);
      const targetIndex = ids.indexOf(bookmarkId);
      const currentIndex = bookmarkRef.current ? ids.indexOf(bookmarkRef.current.id) : -1;
      if (targetIndex < 0 || currentIndex < 0 || !isActiveRef.current) {
        resolve();
        return;
      }
      if (commandedMotion) {
        const motion = commandedMotion;
        const now = performance.now();
        const elapsed = Math.max(0, Math.min(1, (now - motion.startedAt) / motion.duration));
        const sampled = sampleSlideBezier(elapsed, motion.curveY1);
        const oldTargetOffset = -(motion.targetIndex - motion.active.currentIndex) * motion.active.width;
        const distanceFromStart = oldTargetOffset - motion.startOffset;
        motion.offset = motion.startOffset + distanceFromStart * sampled.value;
        const velocity = distanceFromStart * sampled.slope / (motion.duration * 1000);
        motion.targetIndex = targetIndex;
        const nextTargetOffset = -(targetIndex - motion.active.currentIndex) * motion.active.width;
        const nextDistance = nextTargetOffset - motion.offset;
        motion.startOffset = motion.offset;
        motion.startedAt = now;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        motion.duration = reducedMotion
          ? 0.28
          : Math.max(0.48, Math.min(3, Math.abs(nextDistance) / 2400 * 1.15));
        motion.curveY1 = nextDistance === 0
          ? 0
          : velocity * (motion.duration * 1000) / nextDistance * SLIDE_BEZIER_X1;
        commandedMotion.resolves.push(resolve);
        const delta = targetIndex - commandedMotion.active.currentIndex;
        if (delta !== 0) ensureFrames(commandedMotion.active, delta < 0 ? -1 : 1, Math.abs(delta));
        return;
      }
      if (navigationLockedRef.current) {
        resolve();
        return;
      }
      if (targetIndex === currentIndex) {
        resolve();
        return;
      }
      const idsSnapshot = ids;
      const active = {
        pointerId: -1,
        startX: 0,
        startY: 0,
        latestX: 0,
        latestOffset: 0,
        samples: [],
        horizontal: true,
        direction: null,
        currentIndex,
        ids: idsSnapshot,
        width: viewportRectRef.current?.width || window.innerWidth,
      } satisfies SpatialSwipeGesture;
      const delta = targetIndex - currentIndex;
      ensureFrames(active, delta < 0 ? -1 : 1, Math.abs(delta));
      const distance = targetIndex - currentIndex;
      const travelDistance = Math.abs(distance * active.width);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      commandedMotion = {
        active,
        targetIndex,
        offset: 0,
        startOffset: 0,
        startedAt: performance.now(),
        // Keep a brief directional slide in reduced-motion mode instead of
        // swapping the card instantaneously; normal motion remains distance-based.
        duration: reducedMotion ? 0.28 : Math.max(0.48, Math.min(3, travelDistance / 2400 * 1.15)),
        curveY1: 0,
        resolves: [resolve],
      };
      navigationLockedRef.current = true;
      finishSlideRef.current = finishCommandedMotion;
      const animateCommandedMotion = (now: number) => {
        const motion = commandedMotion;
        if (!motion) return;
        const targetOffset = -(motion.targetIndex - motion.active.currentIndex) * motion.active.width;
        const progress = Math.max(0, Math.min(1, (now - motion.startedAt) / motion.duration));
        const eased = sampleSlideBezier(progress, motion.curveY1);
        const distance = targetOffset - motion.startOffset;
        const nextOffset = motion.startOffset + distance * eased.value;
        const remainingAfterStep = targetOffset - nextOffset;
        const crossedTarget = distance !== 0 && Math.sign(remainingAfterStep) !== Math.sign(distance);
        motion.offset = nextOffset;
        applyOffset(motion.active, motion.offset);
        if (crossedTarget || progress >= 1 || Math.abs(remainingAfterStep) < 0.75) {
          motion.offset = targetOffset;
          applyOffset(motion.active, motion.offset);
          finishCommandedMotion();
          return;
        }
        slideRafRef.current = requestAnimationFrame(animateCommandedMotion);
      };
      slideRafRef.current = requestAnimationFrame(animateCommandedMotion);
    };
    frame.addEventListener("spatial-focus-navigate", onProgrammaticNavigate);
    const cancelGesture = () => {
      if (slideRafRef.current !== null) {
        cancelAnimationFrame(slideRafRef.current);
        slideRafRef.current = null;
      }
      gesture = null;
      frame.style.transform = "";
      clearSwipeFrames();
      navigationLockedRef.current = false;
      finishSlideRef.current = null;
    };
    const settleGesture = (active: SpatialSwipeGesture, destinationIndex: number, startOffset: number, velocity: number) => {
      const boundedIndex = Math.max(0, Math.min(active.ids.length - 1, destinationIndex));
      const delta = boundedIndex - active.currentIndex;
      const destinationOffset = -delta * active.width;
      ensureFrames(active, delta < 0 ? -1 : 1, Math.abs(delta));
      const target = swipeFramesRef.current.find((candidate) => candidate.index === boundedIndex);
      const startedAt = performance.now();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const distance = Math.abs(destinationOffset - startOffset);
      const duration = reducedMotion ? 100 : delta === 0 ? 180 : Math.max(220, Math.min(420, 220 + distance * 0.055));
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (slideRafRef.current !== null) cancelAnimationFrame(slideRafRef.current);
        slideRafRef.current = null;
        if (delta !== 0 && target && cloneRef.current === frame) {
          frame.remove();
          target.el.style.transform = "";
          target.el.style.pointerEvents = "auto";
          target.el.style.touchAction = "pan-y";
          cloneRef.current = target.el;
          targetRectRef.current = target.rect;
          bookmarkRef.current = target.bookmark;
          const returnTarget = neighborStateRef.current.find(
            (neighbor) => rendererRef.current?.bookmarkForElement(neighbor.el)?.id === target.bookmark.id
          );
          if (returnRectResolverRef.current) {
            rebaseReturnGeometry(target.bookmark.id);
          } else if (target.bookmark.id === openingBookmarkIdRef.current) {
            returnRectRef.current = startRectRef.current;
          } else if (returnTarget) {
            returnRectRef.current = returnTarget.startRect;
          }
          setFocusState((current) => current.phase === "opened"
            ? { ...current, bookmark: target.bookmark, targetRect: target.rect }
            : current);
          clearSwipeFrames(target.el);
          swipeFramesRef.current = [];
          // The new focused frame gets its own pointer listeners after its
          // incoming role is complete; they are attached below by the caller.
          attachSwipeNavigation(target.el);
        } else {
          frame.style.transform = "";
          clearSwipeFrames();
        }
        navigationLockedRef.current = false;
        finishSlideRef.current = null;
      };
      finishSlideRef.current = finish;
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = sampleSlideBezier(progress, 0).value;
        const tangent = reducedMotion || delta === 0
          ? 0
          : Math.max(-Math.max(distance, 48), Math.min(Math.max(distance, 48), velocity * duration));
        const velocityCurve = progress * (1 - progress) * (1 - progress);
        applyOffset(active, startOffset + (destinationOffset - startOffset) * eased + tangent * velocityCurve);
        if (progress < 1) {
          slideRafRef.current = requestAnimationFrame(animate);
        } else {
          finish();
        }
      };
      slideRafRef.current = requestAnimationFrame(animate);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (gesture || navigationLockedRef.current) return;
      if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      if ((event.target as Element | null)?.closest("a, button, input, textarea, select, [contenteditable='true']")) return;
      const now = performance.now();
      const ids = Array.from(bookmarkMapRef.current?.keys() || []);
      const currentIndex = bookmarkRef.current ? ids.indexOf(bookmarkRef.current.id) : -1;
      if (currentIndex < 0) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        latestX: event.clientX,
        latestOffset: 0,
        samples: [{ x: event.clientX, time: now }],
        horizontal: false,
        direction: null,
        currentIndex,
        ids,
        width: viewportRectRef.current?.width || window.innerWidth,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.horizontal && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        gesture.horizontal = true;
        navigationLockedRef.current = true;
        finishSlideRef.current = cancelGesture;
        try { frame.setPointerCapture(event.pointerId); } catch { /* frame may have been replaced */ }
      }
      if (!gesture.horizontal) return;
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      gesture.latestX = event.clientX;
      gesture.samples.push({ x: event.clientX, time: now });
      gesture.samples = gesture.samples.filter((sample) => now - sample.time <= 110);
      const direction: -1 | 1 = dx < 0 ? 1 : -1;
      const needed = Math.min(6, Math.max(1, Math.ceil(Math.abs(dx) / gesture.width) + 2));
      const hasNeighbor = direction === 1
        ? gesture.currentIndex < gesture.ids.length - 1
        : gesture.currentIndex > 0;
      const visualOffset = hasNeighbor ? dx : dx * 0.28;
      gesture.latestOffset = visualOffset;
      if (hasNeighbor) ensureFrames(gesture, direction, needed);
      applyOffset(gesture, visualOffset);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const completed = gesture;
      gesture = null;
      if (!completed.horizontal) return;

      const dx = completed.latestOffset;
      const first = completed.samples[0];
      const last = completed.samples[completed.samples.length - 1];
      const velocity = first && last && performance.now() - last.time <= 100 && last.time > first.time
        ? (last.x - first.x) / (last.time - first.time)
        : 0;
      // Approximate natural inertial travel with a bounded deceleration, so a
      // deliberate fast flick can pass more than one viewport before snapping.
      const coastDistance = (velocity * Math.abs(velocity)) / 0.012;
      const projectedOffset = dx + coastDistance;
      let pageDelta = -Math.round(projectedOffset / completed.width);
      if (pageDelta === 0 && (Math.abs(dx) >= 44 || Math.abs(velocity) >= 0.28)) pageDelta = dx < 0 || velocity < 0 ? 1 : -1;
      pageDelta = Math.max(-6, Math.min(6, pageDelta));
      const destinationIndex = completed.currentIndex + pageDelta;
      ensureFrames(completed, pageDelta < 0 ? -1 : 1, Math.abs(pageDelta));
      settleGesture(completed, destinationIndex, dx, velocity);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (gesture?.pointerId === event.pointerId) {
        const cancelled = gesture;
        gesture = null;
        if (cancelled.horizontal) settleGesture(cancelled, cancelled.currentIndex, cancelled.latestOffset, 0);
      }
    };

    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove, { passive: false });
    frame.addEventListener("pointerup", onPointerUp);
    frame.addEventListener("pointercancel", onPointerCancel);
  }, [getBookmarkRect, rebaseReturnGeometry]);

  const cleanup = useCallback(() => {
    finishSlideRef.current?.();
    finishSlideRef.current = null;
    navigationLockedRef.current = false;
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
    returnRectRef.current = null;
    targetRectRef.current = null;
    bookmarkRef.current = null;
    openingBookmarkIdRef.current = null;
    returnRectResolverRef.current = null;
  }, []);

  const open = useCallback(
    (bookmarkId: string, poolEl: HTMLElement, resolveBookmarkRect?: (id: string) => DOMRect | null) => {
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
      attachSwipeNavigation(clone);

      // Hide the original poolEl during focus (keep it mounted but invisible to avoid pool reuse)
      poolEl.style.visibility = "hidden";

      // Fit each selected bookmark to its own media ratio inside the original
      // presentation bounds; navigation reuses the same fit calculation.
      const targetRect = fitBookmarkRect(bookmark, viewportRect);
      const vw = viewportRect.width;
      const vh = viewportRect.height;
      startRectRef.current = startRect;
      returnRectRef.current = startRect;
      targetRectRef.current = targetRect;
      bookmarkRef.current = bookmark;
      openingBookmarkIdRef.current = bookmark.id;
      returnRectResolverRef.current = resolveBookmarkRect || getBookmarkRect || null;

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
          whiteRef.current.style.opacity = `${ease}`;
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
          if (whiteRef.current) whiteRef.current.style.opacity = "1";
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
    [cleanup, getBookmarkRect]
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
      finishSlideRef.current?.();
      finishSlideRef.current = null;
      const openingStartRect = startRectRef.current;
      const returnRect = returnRectRef.current || openingStartRect;
      const targetRect = targetRectRef.current;
      const selCenter = selectedCenterRef.current;
      const clone = cloneRef.current;
      const white = whiteRef.current;
      const neighbors = neighborStateRef.current;
      const poolEl = selectedElRef.current;

      if (!openingStartRect || !returnRect || !targetRect || !selCenter || !clone || !white) {
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

    if (clone) clone.style.transition = "none";

    // If close is called mid-open, capture current progress so the
    // reverse starts from the visible mid state, not from the final target.
    const currentCloneRect = clone.getBoundingClientRect();
    const denomX = targetRect.left - openingStartRect.left || 1;
    const currentEaseRaw = (currentCloneRect.left - openingStartRect.left) / denomX;
    const currentEase = Math.min(1, Math.max(0, Number.isFinite(currentEaseRaw) ? currentEaseRaw : 1));
    const startRev = Math.max(0.12, Math.min(1, currentEase || 1));

    // Hide details immediately on close start (isAnimating true → SpatialFocusDetails hidden)
    setFocusState({ phase: "closing", isActive: true, isAnimating: true, bookmark: bookmarkRef.current, startRect: openingStartRect, targetRect });

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

      if (white) white.style.opacity = `${rev}`;

      // Clone back to start from its current mid-open position
      const curLeft = currentCloneRect.left + (returnRect.left - currentCloneRect.left) * ease;
      const curTop = currentCloneRect.top + (returnRect.top - currentCloneRect.top) * ease;
      const curW = currentCloneRect.width + (returnRect.width - currentCloneRect.width) * ease;
      const curH = currentCloneRect.height + (returnRect.height - currentCloneRect.height) * ease;
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
    }, [attachSwipeNavigation, cleanup, focusState.startRect, focusState.targetRect]);

  // Change the selected content in-place while the presentation is settled.
  // The original source card and all spatial transforms remain frozen; the
  // close animation therefore keeps its established return-to-origin path.
  const navigateToBookmark = useCallback((bookmarkId: string, _direction: -1 | 1) => {
    if (!isActiveRef.current) return Promise.resolve();
    const bookmark = bookmarkMapRef.current?.get(bookmarkId);
    const frame = cloneRef.current;
    if (!bookmark || !frame) return Promise.resolve();
    return new Promise<void>((resolve) => {
      frame.dispatchEvent(new CustomEvent("spatial-focus-navigate", {
        detail: { bookmarkId, resolve },
      }));
    });
  }, []);

  const getBookmarkIds = useCallback(() => Array.from(bookmarkMapRef.current?.keys() || []), []);

  return {
    focusState,
    isActiveRef,
    open,
    close,
    navigateToBookmark,
    getBookmarkIds,
  };
}
