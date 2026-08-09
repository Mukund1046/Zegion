"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { isLowSpecDevice } from "@/lib/bookmark-utils";
import { kairosPerf } from "@/lib/perf";
import { useDialKit } from "dialkit";
import type { Bookmark } from "@/lib/types";
import {
  createSpatialEngine,
  loadEngineBookmarks,
  setEngineViewport,
  applyZoomAt,
  hardClampCamera,
  applyResistance,
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
  DRAG_THRESHOLD_SQ,
  DRAG_SPEED,
  PAN_EASE,
  ZOOM_EASE,
  GRID_REZ_EPS,
  type VisibleItem,
  type GridItem,
  type SpatialEngine,
  type ZoomAnchor,
} from "@/lib/spatial/spatial-engine";
import { createDomRenderer, type DomRenderer, type BookmarkForRender, type RenderMode } from "@/lib/spatial/dom-renderer";

/** Horizontal focus of the reading anchor (0.5 = viewport center). */
const SETTLE_FOCUS_X = 0.5;
/** Vertical focus of the reading anchor: 40% down the viewport, tuned for feed
 *  reading. During the post-zoom re-pack the camera follows this card so the
 *  user's reading region does not visibly push down/up as rows resize. */
const SETTLE_FOCUS_Y = 0.4;
/** Camera-zoom rest tolerance (matches the snap threshold in `tickCamera`):
 *  once |camera.zoom - target.zoom| drops below this the camera is considered
 *  converged and the post-settle reading-card pin is released. */
const SETTLE_ANCHOR_ZOOM_EPS = 0.0001;

/** Find the layout item whose world-space box contains (wx, wy). Returns the
 *  item index, or the nearest item when the point lands in a row gap (fallback
 *  keeps the compensation from silently dropping to nothing). */
const findCardAtWorld = (items: readonly GridItem[], length: number, wx: number, wy: number): number => {
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
});

export function useSpatialViewer() {
  // Live motion tuning (DialKit): expose the four scheduling knobs as panel
  // sliders. Values persist across reloads and are pushed into the engine each
  // change, so the rAF loop reads them live without recreating the engine.
  const tune = useDialKit("Spatial Settle", {
    SETTLE_IDLE_MS: [300, 100, 800, 10],
    SETTLE_MS: [220, 80, 800, 10],
    FLUID_ZOOM_TAU: [135, 30, 500, 5],
    criticalSettleW: [6.5, 1, 20, 0.5],
    SETTLE_MOMENTUM_GAIN: [0.15, 0, 2, 0.05],
    SETTLE_MOMENTUM_CLAMP: [0.35, 0, 1, 0.05],
  }, {
    id: "spatial-settle",
    persist: { key: "kairos-spatial-settle" },
  });

  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const minimapWorldRef = useRef<HTMLDivElement>(null);
  const minimapViewportRef = useRef<HTMLDivElement>(null);

  const [zoomPercent, setZoomPercent] = useState(100);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  const engineRef = useRef<SpatialEngine | null>(null);
  const rendererRef = useRef<DomRenderer | null>(null);
  const bookmarkMapRef = useRef<Map<string, BookmarkForRender>>(new Map());
  const visibleItemsRef = useRef<VisibleItem[]>([]);
  const ensureLoopRef = useRef<() => void>(() => {});
  /** Active world-space interaction anchor (point beneath the cursor captured
   *  when a zoom gesture begins). The camera is re-pinned to this point while
   *  the gesture runs -- cards are not tracked. */
  const anchorRef = useRef<ZoomAnchor | null>(null);
  /** Reading anchor captured when a gesture ends and the layout re-solves. It
   *  pins a specific card (by layout index + normalized offsets) so the settle
   *  morph can follow it and keep the user's reading region fixed on screen
   *  while rows above/below resize. */
  const settleAnchorRef = useRef<{
    index: number;
    nx: number;
    ny: number;
    focusX: number;
    focusY: number;
  } | null>(null);
  /** Viewport-relative last pointer position (drives button zoom anchor). */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const activeMapSize = useCallback(() => {
    return rendererRef.current?.activeMapSize?.() ?? 0;
  }, []);

  const hardClamp = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    hardClampCamera(engine, engine.camera);
    hardClampCamera(engine, engine.target);
  }, []);

  const renderFrame = useCallback(() => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    const world = worldRef.current;
    if (!engine || !renderer || !world) return;
    const visible = visibleItemsRef.current;
    const visibleIds = engine.lastVisible;
    // During a fluid gesture the camera moves in the compositor, not the cards:
    //  - `?wz=1` ("world"): ONE container transform, cards pinned to world coords.
    //  - default ("scale"): per-card compositor transform `translate3d(world*z - cam)
    //    scale(z)`. Card intrinsic geometry (width/height/border/radius/shadow,
    //    image layout, DOM) stays IMMUTABLE for the whole gesture — only the
    //    transform changes per frame, so nothing re-layouts or re-rasters. The new
    //    geometry is baked once when the gesture settles (mode flips to "screen").
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

  /** Capture the world-space point currently under the pointer as the zoom
   *  anchor. The camera is owned by the interaction and keeps exactly this
   *  point under the cursor for the duration of the gesture. */
  const captureAnchor = useCallback((cursorX: number, cursorY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    // A fresh gesture supersedes any in-flight settle: drop the reading follow
    // AND cancel the settle morph so layoutItems are frozen as an inert surface
    // for the whole gesture. During fluid the layout must be completely
    // immutable — a lingering morph would mutate world geometry per-card while
    // the compositor also scales it (two motion systems at once).
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

  const layoutMinimap = useCallback(() => {
    const engine = engineRef.current;
    const mw = minimapWorldRef.current;
    if (!engine || !mw || engine.worldW <= 0 || engine.worldH <= 0) return;
    const aspectRatio = engine.worldW / engine.worldH;
    const maxH = Math.min(180, Math.max(60, engine.viewportH * 0.4));
    const maxW = Math.min(220, engine.viewportW * 0.3);
    let height = maxH;
    let width = height * aspectRatio;
    if (width > maxW) {
      width = maxW;
      height = width / aspectRatio;
    }
    mw.style.width = `${width}px`;
    mw.style.height = `${height}px`;
    (mw as HTMLElement & { __scale?: number }).__scale = width / Math.max(1, engine.worldW);
  }, []);

  const updateMinimap = useCallback(() => {
    const engine = engineRef.current;
    const mw = minimapWorldRef.current;
    const mv = minimapViewportRef.current;
    if (!engine || !mw || !mv) return;
    const scale = (mw as HTMLElement & { __scale?: number }).__scale ?? 1;
    const z = engine.camera.zoom;
    const worldCamX = engine.camera.x / z;
    const worldCamY = engine.camera.y / z;
    mv.style.left = `${(worldCamX * scale).toFixed(1)}px`;
    mv.style.top = `${(worldCamY * scale).toFixed(1)}px`;
    mv.style.width = `${Math.max(2, (engine.viewportW / z) * scale).toFixed(1)}px`;
    mv.style.height = `${Math.max(2, (engine.viewportH / z) * scale).toFixed(1)}px`;
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
      // Smoothed fluid zoom: the camera eases toward the evolving target with a
      // short critically-damped exponential (FLUID_ZOOM_TAU) so a gesture drives
      // temporally-continuous motion instead of discrete notches; all cards still
      // scale as one rigid surface. The smooth law applies ONLY while a gesture
      // is live (engine.fluid) or during the settle handoff (solveT >= 0), so
      // one-shot button targets (Fit / 1:1 / Reset, which set target with
      // fluid=false and solveT=-1) still ease with the snappy ZOOM_EASE instead
      // of drifting along the slow gesture response.
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

      // Bounded momentum signal for the settle spring: EMA of the camera's
      // instantaneous zoom velocity, updated ONLY while input is active (and a
      // short tail after the last event). Once the gesture goes idle the value
      // freezes at the end-of-gesture velocity, so the settle inherits the
      // motion that was already happening instead of restarting from rest. The
      // raw velocity is never mapped 1:1 into the layout — it only feeds the
      // clamped, tunable seed below.
      {
        const instVel = dt > 0 ? (engine.camera.zoom - engine.lastZoom) / dt : 0;
        if (now - engine.lastZoomInput < 60) {
          engine.zoomVel = engine.zoomVel * 0.85 + instVel * 0.15;
        }
        engine.lastZoom = engine.camera.zoom;
      }

      // Two layout modes mirroring the two interaction states:
      //  - fluid (engine.fluid): the layout is frozen as an inert surface. The
      //    camera alone scales it about the anchored world point while the user
      //    zooms, so the collection reads as ONE coherent surface -- cards may
      //    temporarily overflow or pack suboptimally, but nothing "settles"
      //    under the pointer. No layout solving, no row convergence, no density
      //    chasing during the gesture.
      //  - solved (rest): after an idle threshold below, re-pack into the
      //    optimal layout once and perform a single critically-damped settle.
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
        layoutMinimap();
      }

      // Gesture ended (idle past threshold) → leave fluid mode and solve into
      // the optimal packing. Snapshot the frozen geometry, solve, snapshot the
      // target, then let the single settle morph ease cards into their slots.
      if (
        engine.fluid &&
        now - engine.lastZoomInput > engine.tune.settleIdleMs
      ) {
        // Capture the user's reading position BEFORE the layout re-solves, so
        // the settle can compensate for rows resizing around it. The world
        // anchor's job is over (the gesture is idle) -- stop re-pinning the
        // camera to that stale world point, which is what pushed the feed
        // down/up when rows changed height.
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
          // Solve for the FINAL resting zoom (target.zoom), not the transient
          // camera.zoom. With continuous (smooth) zoom the camera lags target
          // while converging, so solving at camera.zoom bakes a grid fit to a
          // zoom the camera is only passing through: zoom-out ends with the
          // world narrower than the viewport (empty space both sides), zoom-in
          // ends wider (asymmetric overflow). target.zoom is where the camera
          // comes to rest, so worldW*z == viewportW holds exactly at rest.
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

      // Single settle morph: ease layoutItems from the frozen snapshot toward
      // the solved target with one critically-damped progression. Cards glide
      // into place exactly once; no re-settling while the gesture is live.
      // Guarded on !engine.fluid: while a gesture is active the layout must be
      // immutable, so a settle can NEVER mutate geometry mid-gesture.
      if (!engine.fluid && engine.solveT >= 0) {
        kairosPerf.time("spatial", "settle:morph", () => {
          // Critically-damped spring on the shared settle clock `solveT`: every
          // card glides by the same eased scalar, optionally seeded with bounded
          // momentum from the gesture's end velocity. Convergence is by
          // proximity (not a fixed-duration window), so zoom-out reaches the
          // exact solved layout without the slow asymptotic tail.
          const { eased, done } = advanceSettle(engine, dt);
          morphSettle(engine, eased);
          if (done) {
            morphSettle(engine, 1);
            engine.solveT = -1;
            // The settle already solved for target.zoom (the resting zoom) at
            // settle start and lastGridZ already matches it, so once the camera
            // finishes converging to target.zoom the rest-drift recompute below
            // sees no drift and never re-solves a second time within this
            // gesture (which would be a second layout morph).
            engine.lastGridZ = engine.target.zoom;
          }
          camMoved = true;
        });
      }

      // Follow the captured reading card through the morph AND through the
      // camera's post-settle convergence tail: each frame the card's
      // interpolated position is kept at the same screen focus point, so rows
      // resizing above/below it do not push the viewport up or down. The pin
      // is held past the settle end (solveT -> -1) because the camera is still
      // converging to target.zoom for a few frames after the morph completes
      // (the fluid law is active during the settle, and the snappy ZOOM_EASE
      // base continues after) -- dropping it at solveT=-1 lets that late camera
      // zoom shift the just-settled layout (~3px/fr in the postsettle trace).
      // Release only once the camera rests at target.zoom. A programmatic
      // retarget (Fit / 1:1 / Reset) moves target.zoom away from lastGridZ --
      // the zoom the settle solved for -- so the pin releases immediately and
      // never follows the unrelated convergence.
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

      // Clamp both camera and target against the freshly-derived world bounds.
      // NOTE: `target.zoom > camera.zoom` is NOT reliable for detecting a
      // zoom-in here -- applyZoomAt(instant=true) sets both to the new zoom on
      // the same event, so they are always equal in this tick. Instead compare
      // the live zoom to lastGridZ, the zoom the frozen grid was fit to. While
      // a fluid zoom-IN gesture is active (zoom > that fit basis) the camera is
      // owned by the interaction and the collection is allowed to overflow every
      // viewport edge (magnifier), so clamping is skipped -- cards extend past
      // left, right, top and bottom. A fluid zoom-OUT sits below the fit basis,
      // so the world is narrower than the viewport and clamping centers it (the
      // "whole strip in the middle" behavior). Once the gesture ends (fluid=false)
      // and the fit-to-width layout is recomputed, clamping always resumes and
      // pulls the camera back into legal bounds. Evaluate BOTH camera and target
      // unconditionally: clamping the camera at a boundary returns true every
      // frame, and an `||` short-circuit would then skip clamping the target,
      // leaving it frozen off-screen and the loop animating forever (never
      // reaching the settle branch that drains pending content).
      const magnifyOverflow = engine.fluid && engine.camera.zoom > engine.lastGridZ;
      let clamped = false;
      if (!magnifyOverflow) {
        if (hardClampCamera(engine, engine.camera)) clamped = true;
        if (hardClampCamera(engine, engine.target)) clamped = true;
      }
      if (clamped) {
        camMoved = true;
      }

      // World-anchored zoom: while an anchor is active (during the gesture and
      // the post-gesture settle) the camera is owned by the interaction and
      // re-pinned so the world point captured at gesture start stays under the
      // cursor. This runs AFTER the settle morph and boundary clamp so it sees
      // the CURRENT world bounds each frame: the anchored camera is clamped to
      // legal bounds FIRST, so the world point is preserved exactly whenever
      // that position is inside the world, and degrades gracefully (minimal
      // error, no exposed empty world) only when the layout can no longer
      // contain it -- it never overrides the boundary clamp. Clamping here also
      // makes the re-pin idempotent: once the settled layout is reached the
      // camera converges and the anchor is dropped instead of fighting the
      // clamp forever.
      const anchor = anchorRef.current;
      if (anchor) {
        const z = engine.camera.zoom;
        const cam = cameraForAnchor(anchor, z);
        // While a zoom-IN gesture is live (magnifying past the fit basis) the
        // anchored camera is NOT clamped so the anchored world point stays
        // exactly under the cursor and the cards may overflow every edge.
        // Zoom-out and the post-gesture settle keep clamping so the camera never
        // dangles past the settled world bounds.
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

      // Always render every tick while a fluid gesture is live. During a zoom
      // the grid is frozen and applyZoomAt(instant) stamps camera AND target to
      // the anchored values together, so `camMoved` is false even though the
      // zoom (and thus the card-scale + anchor position) genuinely changed.
      // Treating the gesture as always-dirty is what actually paints the
      // magnified frame -- cards grow outward from the anchor and overflow the
      // viewport edges -- instead of waiting for the post-idle settle re-pack.
      if (camMoved || engine.fluid) {
        kairosPerf.frame("camera", activeMapSize(), engine.layoutLength, dt);
        kairosPerf.time("spatial", "frame:render", () => {
          renderFrame();
        });
        updateMinimap();
        if (Math.round(engine.camera.zoom * 100) !== engine.lastZoomUI) {
          engine.lastZoomUI = Math.round(engine.camera.zoom * 100);
          setZoomPercent(Math.round(engine.camera.zoom * 100));
        }
        engine.raf = requestAnimationFrame(tick);
      } else if (engine.solveT >= 0) {
        // Camera stable but a settle morph may be pending: keep ticking so the
        // idle-settle check fires.
        engine.raf = requestAnimationFrame(tick);
      } else {
        engine.animating = false;
        engine.raf = null;
        // Zoom has converged: the anchor's job is done, drop it so subsequent
        // pans (wheel/drag) are not re-pinned to the stale card.
        clearAnchor();
        if (rendererRef.current?.drainPending()) {
          ensureLoop();
        }
      }
      kairosPerf.end("spatial", "frame:total");
    };
    engine.raf = requestAnimationFrame(tick);
  }, [renderFrame, layoutMinimap, updateMinimap]);

  ensureLoopRef.current = ensureLoop;

  const applyZoomAtRef = useCallback(
    (cx: number, cy: number, nextZoom: number, instant = false, interactive = true) => {
      const engine = engineRef.current;
      if (!engine) return;
      applyZoomAt(engine, cx, cy, nextZoom, instant, interactive);
      ensureLoop();
    },
    [ensureLoop]
  );

  const zoomBy = useCallback(
    (steps: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      // Anchor at the last pointer position when available (so +/- zoom toward
      // the cursor), falling back to the viewport center.
      const ptr = lastPointerRef.current;
      const cx = ptr ? ptr.x : engine.viewportW / 2;
      const cy = ptr ? ptr.y : engine.viewportH / 2;
      engine.fluid = true;
      engine.lastZoomInput = performance.now();
      captureAnchor(cx, cy);
      applyZoomAtRef(cx, cy, engine.target.zoom * Math.pow(ZOOM_STEP_FACTOR, steps), true);
    },
    [applyZoomAtRef, captureAnchor]
  );

  const exitFluid = useCallback((engine: SpatialEngine | null) => {
    if (!engine) return;
    engine.fluid = false;
    engine.solveT = -1;
    engine.solveFrom.length = 0;
    engine.solveTarget.length = 0;
  }, []);

  const fitWorld = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    exitFluid(engine);
    clearAnchor();
    // Fit frames the entire world, so it is exempt from the interactive zoom
    // floor and may go down to zFit (6%).
    applyZoomAtRef(engine.viewportW / 2, engine.viewportH / 2, engine.zFit, false, false);
  }, [applyZoomAtRef, clearAnchor, exitFluid]);

  const detailZoom = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    exitFluid(engine);
    clearAnchor();
    applyZoomAtRef(engine.viewportW / 2, engine.viewportH / 2, 1);
  }, [applyZoomAtRef, clearAnchor, exitFluid]);

  const resetZoom = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    exitFluid(engine);
    clearAnchor();
    engine.target.x = 0;
    engine.target.y = 0;
    engine.target.zoom = 1;
    hardClamp();
    ensureLoop();
  }, [hardClamp, ensureLoop, clearAnchor, exitFluid]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const minimap = minimapRef.current;
    if (!viewport) return;

    let cancelled = false;
    const engine = createSpatialEngine(
      viewport.clientWidth || window.innerWidth,
      viewport.clientHeight || window.innerHeight
    );
    engineRef.current = engine;
    const poolSize = isLowSpecDevice() ? 280 : 1100;
    const renderer = createDomRenderer(worldRef.current!, poolSize, 8);
    rendererRef.current = renderer;
    renderer.createPool();

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;

      if (event.ctrlKey) {
        // Continuous magnifier zoom: every wheel delta maps smoothly onto the
        // zoom range [interactionMinZoom, maxZoom] (20%..450%), with no discrete
        // steps. Deltas compose multiplicatively, so a mouse notch or a
        // trackpad glide both produce a buttery, uninterrupted zoom and the
        // anchored world point stays under the cursor for the whole gesture.
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
          if (engine.fluidSmooth) {
            // Smoothed fluid zoom: capture the world anchor once when the
            // gesture begins and keep it fixed; wheel events only move
            // target.zoom. The camera advances toward that target every rAF
            // with a short critically-damped response, so the gesture is
            // temporally continuous instead of discrete notches.
            if (!engine.fluid) captureAnchor(cx, cy);
            engine.fluid = true;
            engine.lastZoomInput = performance.now();
            engine.target.zoom = nextZoom;
            ensureLoop();
          } else {
            engine.fluid = true;
            engine.lastZoomInput = performance.now();
            captureAnchor(cx, cy);
            applyZoomAtRef(cx, cy, nextZoom, true);
          }
        }
        return;
      }

      clearAnchor();
      engine.target.y += event.deltaY;
      hardClampCamera(engine, engine.target);
      ensureLoop();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest(".spatial-minimap")) return;
      clearAnchor();
      engine.isDragging = true;
      engine.hasDragged = false;
      engine.dragStart = { x: event.clientX, y: event.clientY };
      engine.dragCam = { x: engine.camera.x, y: engine.camera.y, zoom: engine.camera.zoom };
      setDragging(true);
      viewport.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      // Track viewport-relative pointer for cursor-anchored button zoom.
      const rect = viewport.getBoundingClientRect();
      lastPointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!engine.isDragging || !engine.dragStart || !engine.dragCam) return;
      const dx = event.clientX - engine.dragStart.x;
      const dy = event.clientY - engine.dragStart.y;
      if (!engine.hasDragged && dx * dx + dy * dy > DRAG_THRESHOLD_SQ) {
        engine.hasDragged = true;
      }
      const zoom = engine.camera.zoom;
      const maxX = Math.max(0, engine.worldW * zoom - engine.viewportW);
      const maxY = Math.max(0, engine.worldH * zoom - engine.viewportH);
      engine.target.x = applyResistance(engine.dragCam.x - dx * DRAG_SPEED, 0, maxX);
      engine.target.y = applyResistance(engine.dragCam.y - dy * DRAG_SPEED, 0, maxY);
      ensureLoop();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!engine.isDragging) return;
      engine.isDragging = false;
      engine.dragStart = null;
      engine.dragCam = null;
      setDragging(false);
      hardClampCamera(engine, engine.target);
      ensureLoop();
      try {
        viewport.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    };

    const onMinimapPointerDown = (event: PointerEvent) => {
      event.stopPropagation();
      const mw = minimapWorldRef.current;
      if (!mw) return;
      const rect = mw.getBoundingClientRect();
      const fy = (event.clientY - rect.top) / rect.height;
      const z = engine.camera.zoom;
      engine.target.x = 0;
      engine.target.y = fy * engine.worldH * z - engine.viewportH / 2;
      hardClampCamera(engine, engine.target);
      ensureLoop();
    };

    const onWindowResize = () => {
      engine.viewportW = viewport.clientWidth || window.innerWidth;
      engine.viewportH = viewport.clientHeight || window.innerHeight;
      // While a fluid gesture is live the layout is an inert surface and must
      // stay byte-identical — recomputing the grid (or any settle) mid-gesture
      // would repack cards under the pointer. Update the viewport dims so
      // culling/camera adapt, but defer the solve: the settle branch and the
      // rest-state grid recompute below pick up the fresh dims once fluid ends.
      if (engine.fluid) return;
      setEngineViewport(engine, engine.viewportW, engine.viewportH);
      computeGrid(engine, engine.camera.zoom);
      hardClampCamera(engine, engine.camera);
      hardClampCamera(engine, engine.target);
      renderFrame();
      layoutMinimap();
      updateMinimap();
    };

    const init = async () => {
      // Temporally-continuous fluid zoom is the production camera path: wheel
      // updates target.zoom only and the camera eases toward it each rAF, so a
      // pinch/wheel gesture drives one continuously-moving camera. Opt out with
      // ?zinstant=1 to A/B against the old per-event instant-stamp behavior.
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      engine.fluidSmooth = !params?.has("zinstant");
      // Experimental flag: ?wz=1 renders the fluid gesture as ONE world-container
      // transform (single camera matrix) instead of per-card style writes.
      engine.worldTransform = params?.has("wz") ?? false;
      // Gated instrumentation (`?probe`): expose the engine for external
      // verification scripts to fingerprint layout geometry mid-gesture.
      if (params?.has("probe")) {
        (window as unknown as { __spatialProbe?: { engine: SpatialEngine } }).__spatialProbe = { engine };
      }
      const response = await apiFetch("/api/bookmarks?fields=spatial");
      const data = await response.json();
      if (cancelled) return;
      const bookmarks = (Array.isArray(data) ? data : data.bookmarks || data.items || []) as Bookmark[];
      const withMedia = bookmarks.filter((bookmark) => bookmark.images && bookmark.images.length > 0);
      const subset = withMedia;

      loadEngineBookmarks(engine, subset.map(toGridBookmark));
      bookmarkMapRef.current = new Map(subset.map((b) => [b.id, toRenderBookmark(b)]));

      engine.camera = { x: 0, y: 0, zoom: 1 };
      engine.target = { x: 0, y: 0, zoom: 1 };
      computeGrid(engine, engine.camera.zoom);
      engine.lastGridZ = engine.camera.zoom;
      layoutMinimap();

      setCount(subset.length);
      setLoaded(true);
      setZoomPercent(100);
      renderFrame();
      ensureLoop();
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);
    minimap?.addEventListener("pointerdown", onMinimapPointerDown);
    window.addEventListener("resize", onWindowResize);

    init();

    return () => {
      cancelled = true;
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerUp);
      minimap?.removeEventListener("pointerdown", onMinimapPointerDown);
      window.removeEventListener("resize", onWindowResize);
      if (engine.raf !== null) cancelAnimationFrame(engine.raf);
      engine.raf = null;
      renderer.destroy();
    };
  }, [applyZoomAtRef, ensureLoop, renderFrame, layoutMinimap, updateMinimap, captureAnchor, clearAnchor]);

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

  return {
    refs: {
      viewportRef,
      worldRef,
      minimapRef,
      minimapWorldRef,
      minimapViewportRef,
    },
    state: {
      zoomPercent,
      count,
      loaded,
      dragging,
    },
    actions: {
      zoomBy,
      fitWorld,
      detailZoom,
      resetZoom,
    },
  };
}