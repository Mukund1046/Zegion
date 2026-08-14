"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDialKit } from "dialkit";
import { isLowSpecDevice } from "@/lib/bookmark-utils";
import { kairosPerf } from "@/lib/perf";
import type { Bookmark, ViewMode } from "@/lib/types";
import {
  createSpatialEngine,
  loadEngineBookmarks,
  setEngineViewport,
  applyZoomAt,
  hardClampCamera,
  tickCamera,
  cullVisible,
  computeGrid,
  captureLayout,
  captureTarget,
  morphSettle,
  advanceSettle,
  seedMomentum,
  cameraForAnchor,
  ZOOM_WHEEL_PX_PER_STEP,
  ZOOM_WHEEL_FACTOR,
  ZOOM_STEP_FACTOR,
  PAN_EASE,
  ZOOM_EASE,
  GRID_REZ_EPS,
  type VisibleItem,
  type SpatialEngine,
  type ZoomAnchor,
} from "@/lib/spatial/spatial-engine";
import {
  createDomRenderer,
  type DomRenderer,
  type BookmarkForRender,
  type RenderMode,
} from "@/lib/spatial/dom-renderer";

/**
 * The main-feed spatial surface. Renders the app's already-filtered/sorted
 * `displayBookmarks` on the SAME spatial engine + renderer the /spatial prototype
 * uses, but:
 *  - receives feed data (`bookmarks`, `activeView`) instead of fetching it,
 *  - enables the shared rich-card mode so Cards still carry author/handle,
 *    timeline, stats and text (via the app shell's helpers),
 *  - owns only the visible surface: filter/search/sort/persistence/sync and
 *    lightbox/context-menu/dark-mode all stay in `useBookmarkViewer`.
 *
 * The FLUID-ZOOM INVARIANT and spatial motion law are untouched -- this surface
 * only drives the engine/renderer with a different data + interaction contract.
 */

const SETTLE_FOCUS_X = 0.5;
const SETTLE_FOCUS_Y = 0.4;
const SETTLE_ANCHOR_ZOOM_EPS = 0.0001;

const findCardAtWorld = (items: readonly { x: number; y: number; w: number; h: number }[], length: number, wx: number, wy: number): number => {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < length; i += 1) {
    const it = items[i];
    if (it.w <= 0 || it.h <= 0) continue;
    if (wx >= it.x && wx < it.x + it.w && wy >= it.y && wy < it.y + it.h) return i;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    const d = (wx - cx) * (wx - cx) + (wy - cy) * (wy - cy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
};

const toGridBookmark = (bookmark: Bookmark) => {
  const image = bookmark.images?.[0];
  const aspect = image && image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  return { bookmarkId: bookmark.id, aspect };
};

const toRenderBookmark = (bookmark: Bookmark): BookmarkForRender => ({
  id: bookmark.id,
  text: bookmark.text || "",
  images: (bookmark.images || []).map((image) => ({
    url: image.url,
    width: image.width,
    height: image.height,
  })),
  bookmark,
});

export interface SpatialFeedHandlers {
  onOpenLightbox: (element: HTMLDivElement, bookmark: Bookmark) => void;
  onOpenContextMenu: (bookmark: Bookmark, x: number, y: number) => void;
}

export function useSpatialFeed(
  bookmarks: Bookmark[],
  activeView: ViewMode,
  handlers: SpatialFeedHandlers
) {
  // Live motion tuning (DialKit): same "Spatial Settle" panel the /spatial
  // prototype exposes. Values persist across reloads and are pushed into the
  // engine each change, so the rAF loop reads them live without recreating the
  // engine. Shared panel id/persist key with the prototype so tuning either
  // surface tunes both.
  const tune = useDialKit("Spatial Settle", {
    SETTLE_IDLE_MS: [300, 100, 800, 10],
    SETTLE_MS: [450, 80, 800, 10],
    FLUID_ZOOM_TAU: [135, 30, 500, 5],
    criticalSettleW: [7, 1, 20, 0.5],
    SETTLE_MOMENTUM_GAIN: [0.15, 0, 2, 0.05],
    SETTLE_MOMENTUM_CLAMP: [0.35, 0, 1, 0.05],
  }, {
    id: "spatial-settle",
    persist: { key: "kairos-spatial-settle" },
  });

  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpatialEngine | null>(null);
  const rendererRef = useRef<DomRenderer | null>(null);
  const bookmarkMapRef = useRef<Map<string, BookmarkForRender>>(new Map());
  const visibleItemsRef = useRef<VisibleItem[]>([]);
  const ensureLoopRef = useRef<() => void>(() => {});
  const anchorRef = useRef<ZoomAnchor | null>(null);
  const settleAnchorRef = useRef<{
    index: number;
    nx: number;
    ny: number;
    focusX: number;
    focusY: number;
  } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const readyRef = useRef(false);
  /** The last `bookmarks`/`activeView` handed to the renderer, tracked by
   *  reference so a filter/search/sort that changes content (but not length)
   *  still triggers a rebuild. `displayBookmarks` is rebuilt by the app shell
   *  on every real feed change, so reference identity is the right signal. */
  const lastDataRef = useRef<{ bookmarks: Bookmark[]; view: ViewMode } | null>(null);

  // Keep fresh reference to handlers without re-creating callbacks each render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  const activeMapSize = useCallback(() => rendererRef.current?.activeMapSize?.() ?? 0, []);

  const renderFrame = useCallback(() => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    const world = worldRef.current;
    if (!engine || !renderer || !world) return;
    const visible = visibleItemsRef.current;
    const visibleIds = engine.lastVisible;
    const mode: RenderMode =
      engine.fluid ? (engine.worldTransform ? "world" : "scale") : "screen";
    const worldSpace = mode !== "screen";
    if (mode === "world") {
      world.style.transformOrigin = "0 0";
      world.style.transform = `translate3d(${-engine.camera.x}px, ${-engine.camera.y}px, 0) scale(${engine.camera.zoom})`;
      world.style.willChange = "transform";
    } else if (world.style.transform !== "" || world.style.willChange !== "") {
      world.style.transform = "";
      world.style.willChange = "";
    }
    kairosPerf.time("spatial", "cull:visible", () => {
      cullVisible(engine, visible, visibleIds, worldSpace);
    });
    renderer.render(visible, visibleIds, bookmarkMapRef.current, mode, engine.camera);
  }, []);

  const captureAnchor = useCallback((cursorX: number, cursorY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    settleAnchorRef.current = null;
    engine.solveT = -1;
    engine.solveFrom.length = 0;
    engine.solveTarget.length = 0;
    anchorRef.current = {
      worldX: (cursorX + engine.camera.x) / engine.camera.zoom,
      worldY: (cursorY + engine.camera.y) / engine.camera.zoom,
      cursorX,
      cursorY,
    };
  }, []);

  const clearAnchor = useCallback(() => {
    anchorRef.current = null;
  }, []);

  const ensureLoop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.animating) return;
    engine.animating = true;
    engine.lastT = performance.now();

    const tick = () => {
      kairosPerf.begin("spatial", "frame:total");
      const now = performance.now();
      const dt = Math.min(Math.max(now - engine.lastT, 0), 50);
      engine.lastT = now;
      const zooming = Math.abs(engine.target.zoom - engine.camera.zoom) > 0.0001;
      const easeBase = zooming ? ZOOM_EASE : PAN_EASE;
      const smoothActive =
        engine.fluidSmooth &&
        zooming &&
        (engine.fluid || engine.solveT >= 0);
      const k = smoothActive
        ? 1 - Math.exp(-dt / engine.tune.fluidZoomTau)
        : 1 - Math.pow(easeBase, dt / 16.667);
      let camMoved = false;

      kairosPerf.time("camera", "camera:tick", () => {
        camMoved = tickCamera(engine, k);
      });

      {
        const instVel = dt > 0 ? (engine.camera.zoom - engine.lastZoom) / dt : 0;
        if (now - engine.lastZoomInput < 60) {
          engine.zoomVel = engine.zoomVel * 0.85 + instVel * 0.15;
        }
        engine.lastZoom = engine.camera.zoom;
      }

      if (
        !engine.fluid &&
        !zooming &&
        engine.solveT < 0 &&
        Math.abs(engine.camera.zoom - engine.lastGridZ) > GRID_REZ_EPS * Math.max(engine.camera.zoom, 1)
      ) {
        engine.lastGridZ = engine.camera.zoom;
        kairosPerf.time("spatial", "grid:solve", () => {
          computeGrid(engine, engine.camera.zoom);
        });
        camMoved = true;
      }

      if (
        engine.fluid &&
        now - engine.lastZoomInput > engine.tune.settleIdleMs
      ) {
        clearAnchor();
        const z = engine.camera.zoom;
        const focusX = engine.viewportW * SETTLE_FOCUS_X;
        const focusY = engine.viewportH * SETTLE_FOCUS_Y;
        const wx = (engine.camera.x + focusX) / z;
        const wy = (engine.camera.y + focusY) / z;
        const anchorIndex = findCardAtWorld(engine.layoutItems, engine.layoutLength, wx, wy);
        if (anchorIndex >= 0) {
          const it = engine.layoutItems[anchorIndex];
          settleAnchorRef.current = {
            index: anchorIndex,
            nx: it.w > 0 ? (wx - it.x) / it.w : 0.5,
            ny: it.h > 0 ? (wy - it.y) / it.h : 0.5,
            focusX,
            focusY,
          };
        } else {
          settleAnchorRef.current = null;
        }
        engine.fluid = false;
        engine.solveW0 = engine.worldW;
        engine.solveH0 = engine.worldH;
        captureLayout(engine);
        kairosPerf.time("spatial", "grid:solve", () => {
          computeGrid(engine, engine.target.zoom);
        });
        engine.solveW1 = engine.worldW;
        engine.solveH1 = engine.worldH;
        captureTarget(engine);
        engine.solveT = 0;
        seedMomentum(engine);
        engine.lastGridZ = engine.target.zoom;
        camMoved = true;
      }

      if (!engine.fluid && engine.solveT >= 0) {
        kairosPerf.time("spatial", "settle:morph", () => {
          const { eased, done } = advanceSettle(engine, dt);
          morphSettle(engine, eased);
          if (done) {
            morphSettle(engine, 1);
            engine.solveT = -1;
            engine.lastGridZ = engine.target.zoom;
          }
          camMoved = true;
        });
      }

      const settle = settleAnchorRef.current;
      const settleTargetActive =
        engine.solveT >= 0 || engine.target.zoom === engine.lastGridZ;
      if (settle && !engine.fluid && settleTargetActive) {
        const item = engine.layoutItems[settle.index];
        if (item && item.w > 0 && item.h > 0) {
          const ax = item.x + settle.nx * item.w;
          const ay = item.y + settle.ny * item.h;
          const camX = ax * engine.camera.zoom - settle.focusX;
          const camY = ay * engine.camera.zoom - settle.focusY;
          engine.camera.x = camX;
          engine.camera.y = camY;
          engine.target.x = camX;
          engine.target.y = camY;
          camMoved = true;
        }
        if (
          engine.solveT < 0 &&
          Math.abs(engine.camera.zoom - engine.target.zoom) <= SETTLE_ANCHOR_ZOOM_EPS
        ) {
          settleAnchorRef.current = null;
        }
      } else {
        settleAnchorRef.current = null;
      }

      const magnifyOverflow = engine.fluid && engine.camera.zoom > engine.lastGridZ;
      let clamped = false;
      if (!magnifyOverflow) {
        if (hardClampCamera(engine, engine.camera)) clamped = true;
        if (hardClampCamera(engine, engine.target)) clamped = true;
      }
      if (clamped) {
        camMoved = true;
      }

      const anchor = anchorRef.current;
      if (anchor) {
        const z = engine.camera.zoom;
        const cam = cameraForAnchor(anchor, z);
        if (!magnifyOverflow) hardClampCamera(engine, cam);
        const movedX = Math.abs(cam.x - engine.camera.x) > GRID_REZ_EPS * Math.max(z, 1);
        const movedY = Math.abs(cam.y - engine.camera.y) > GRID_REZ_EPS * Math.max(z, 1);
        if (movedX || movedY) {
          engine.camera.x = cam.x;
          engine.camera.y = cam.y;
          engine.target.x = cam.x;
          engine.target.y = cam.y;
          camMoved = true;
        }
      }

      if (camMoved || engine.fluid) {
        kairosPerf.frame("camera", activeMapSize(), engine.layoutLength, dt);
        kairosPerf.time("spatial", "frame:render", () => {
          renderFrame();
        });
        engine.raf = requestAnimationFrame(tick);
      } else if (engine.solveT >= 0) {
        engine.raf = requestAnimationFrame(tick);
      } else {
        engine.animating = false;
        engine.raf = null;
        clearAnchor();
        if (rendererRef.current?.drainPending()) {
          ensureLoop();
        }
      }
      kairosPerf.end("spatial", "frame:total");
    };
    engine.raf = requestAnimationFrame(tick);
  }, [renderFrame, activeMapSize]);

  ensureLoopRef.current = ensureLoop;

  const reloadData = useCallback(
    (bookmarksList: Bookmark[], view: ViewMode) => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!engine || !renderer) return;

      loadEngineBookmarks(engine, bookmarksList.map(toGridBookmark));
      bookmarkMapRef.current = new Map(bookmarksList.map((b) => [b.id, toRenderBookmark(b)]));
      renderer.setRichView(view);

      engine.camera = { x: 0, y: 0, zoom: 1 };
      engine.target = { x: 0, y: 0, zoom: 1 };
      computeGrid(engine, engine.camera.zoom);
      engine.lastGridZ = engine.camera.zoom;
      renderFrame();
      ensureLoop();
    },
    [renderFrame, ensureLoop]
  );

  // Mount engine + renderer once; keep surface alive across data/view changes.
  useEffect(() => {
    const viewport = viewportRef.current;
    const world = worldRef.current;
    if (!viewport || !world) return;

    let cancelled = false;
    const engine = createSpatialEngine(
      viewport.clientWidth || window.innerWidth,
      viewport.clientHeight || window.innerHeight
    );
    engineRef.current = engine;
    const poolSize = isLowSpecDevice() ? 280 : 1100;
    const renderer = createDomRenderer(world, poolSize, 8, {
      rich: true,
      view: activeViewRef.current,
    });
    rendererRef.current = renderer;
    renderer.createPool();
    engine.fluidSmooth = true;
    engine.worldTransform = false;
    // The app feed is a document surface: a short search/filter result must
    // pin to the top-left of the feed, not float centered in the viewport.
    engine.centerSmallContent = false;
    readyRef.current = true;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;

      if (event.ctrlKey) {
        const dy =
          event.deltaMode === 1
            ? event.deltaY * 33
            : event.deltaMode === 2
              ? event.deltaY * engine.viewportH
              : event.deltaY;
        const factor = Math.pow(ZOOM_WHEEL_FACTOR, -dy / ZOOM_WHEEL_PX_PER_STEP);
        const nextZoom = Math.min(
          engine.maxZoom,
          Math.max(engine.interactionMinZoom, engine.target.zoom * factor)
        );
        if (Math.abs(nextZoom - engine.target.zoom) > 1e-6) {
          if (!engine.fluid) captureAnchor(cx, cy);
          engine.fluid = true;
          engine.lastZoomInput = performance.now();
          engine.target.zoom = nextZoom;
          ensureLoop();
        }
        return;
      }

      clearAnchor();
      engine.target.y += event.deltaY;
      hardClampCamera(engine, engine.target);
      ensureLoop();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = viewport.getBoundingClientRect();
      lastPointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onWindowResize = () => {
      engine.viewportW = viewport.clientWidth || window.innerWidth;
      engine.viewportH = viewport.clientHeight || window.innerHeight;
      if (engine.fluid) return;
      setEngineViewport(engine, engine.viewportW, engine.viewportH);
      hardClampCamera(engine, engine.camera);
      hardClampCamera(engine, engine.target);
      renderFrame();
    };

    // Rendering surface events: resolve the hit card to its BOOKMARK and let
    // the app shell (openLightbox / openContextMenu) own what happens next.
    const handleCardEvent = (event: MouseEvent, type: "click" | "contextmenu") => {
      const renderer = rendererRef.current;
      const target = event.target as HTMLElement;
      if (!renderer) return;
      const bookmarkId = renderer.bookmarkForElement(target)?.id;
      if (!bookmarkId) return;
      const bookmark = bookmarkMapRef.current.get(bookmarkId)?.bookmark;
      if (!bookmark) return;
      // The spatial pool elements are the interaction targets.
      const cardEl = target.closest(".grid-item") as HTMLDivElement | null;
      if (type === "contextmenu") {
        event.preventDefault();
        handlersRef.current.onOpenContextMenu(bookmark, event.clientX, event.clientY);
      } else {
        handlersRef.current.onOpenLightbox(cardEl ?? (target as HTMLDivElement), bookmark);
      }
    };

    const onClick = (event: MouseEvent) => handleCardEvent(event, "click");
    const onContextMenu = (event: MouseEvent) => handleCardEvent(event, "contextmenu");

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("click", onClick);
    viewport.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onWindowResize);

    lastDataRef.current = { bookmarks, view: activeViewRef.current };
    reloadData(bookmarks, activeViewRef.current);

    return () => {
      cancelled = true;
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("click", onClick);
      viewport.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", onWindowResize);
      if (engine.raf !== null) cancelAnimationFrame(engine.raf);
      engine.raf = null;
      renderer.destroy();
      readyRef.current = false;
      engineRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live DialKit tuning into the engine. The rAF loop reads
  // `engine.tune.*` every tick, so adjusting a slider applies the next frame.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.tune.settleIdleMs = tune.SETTLE_IDLE_MS;
    engine.tune.settleMs = tune.SETTLE_MS;
    engine.tune.fluidZoomTau = tune.FLUID_ZOOM_TAU;
    engine.tune.settleW = tune.criticalSettleW;
    engine.tune.momentumGain = tune.SETTLE_MOMENTUM_GAIN;
    engine.tune.momentumClamp = tune.SETTLE_MOMENTUM_CLAMP;
  }, [tune.SETTLE_IDLE_MS, tune.SETTLE_MS, tune.FLUID_ZOOM_TAU, tune.criticalSettleW, tune.SETTLE_MOMENTUM_GAIN, tune.SETTLE_MOMENTUM_CLAMP]);

  // Sync data + view when the feed changes (filter/search/sort → displayBookmarks).
  useEffect(() => {
    if (!readyRef.current) return;
    const last = lastDataRef.current;
    if (last && last.bookmarks === bookmarks && last.view === activeView) return;
    lastDataRef.current = { bookmarks, view: activeView };
    reloadData(bookmarks, activeView);
  }, [bookmarks, activeView, reloadData]);

  return {
    refs: { viewportRef, worldRef },
    actions: {
      zoomBy: (steps: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const ptr = lastPointerRef.current;
        const cx = ptr ? ptr.x : engine.viewportW / 2;
        const cy = ptr ? ptr.y : engine.viewportH / 2;
        engine.fluid = true;
        engine.lastZoomInput = performance.now();
        captureAnchor(cx, cy);
        const next = engine.target.zoom * Math.pow(ZOOM_STEP_FACTOR, steps);
        if (Math.abs(next - engine.target.zoom) > 1e-6) {
          applyZoomAt(engine, cx, cy, next, true);
          ensureLoop();
        }
      },
      resetZoom: () => {
        const engine = engineRef.current;
        if (!engine) return;
        clearAnchor();
        settleAnchorRef.current = null;
        engine.fluid = false;
        engine.solveT = -1;
        engine.solveFrom.length = 0;
        engine.solveTarget.length = 0;
        engine.target.x = 0;
        engine.target.y = 0;
        engine.target.zoom = 1;
        engine.camera.x = 0;
        engine.camera.y = 0;
        engine.camera.zoom = 1;
        computeGrid(engine, 1);
        engine.lastGridZ = 1;
        hardClampCamera(engine, engine.camera);
        hardClampCamera(engine, engine.target);
        renderFrame();
        ensureLoop();
      },
    },
  };
}