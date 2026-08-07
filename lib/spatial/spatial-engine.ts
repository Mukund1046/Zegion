/**
 * Pure, renderer-agnostic spatial engine: layout, camera, culling, and LOD.
 * No DOM, no React, no rendering. Emits a per-frame visible set that any
 * renderer (DOM pool today, LeaferJS/WebGL later) can consume.
 */

export const GAP = 18;
export const DRAG_THRESHOLD_SQ = 25;
export const ZOOM_WHEEL_PX_PER_STEP = 100;
export const ZOOM_WHEEL_FACTOR = 1.3;
export const ZOOM_STEP_FACTOR = 1.35;
export const MAX_ZOOM = 4.5;
export const FIT_ZOOM = 0.06;
/** Lower bound for interactive zoom (wheel / +/- buttons). Fit is exempt so it
 *  can still frame the entire world at FIT_ZOOM. Cards below this level do not
 *  grow (elasticSize is still under the MIN_CARD_HEIGHT floor), so interactive
 *  zoom stops here. */
export const INTERACTION_MIN_ZOOM = 0.2;
export const MIN_CARD_HEIGHT = 84;
export const MIN_RENDER_HEIGHT = 40;
/** Cap a single card's width as a fraction of the viewport so a singleton or
 *  near-empty row (e.g. the last bookmark) can't stretch one card full-width. */
export const MAX_CARD_FRACTION = 0.55;
export const CULL_BUFFER = 600;
export const DRAG_SPEED = 1.15;
export const DRAG_RESISTANCE = 0.25;
export const MAX_OVER_SHOOT = 220;
export const ELASTIC_S_MAX = 380;
export const ELASTIC_S_OPT = 200;
export const DOM_WRITE_EPS = 0.25;
export const GRID_REZ_EPS = 0.0004;
export const PAN_EASE = 0.76;
export const ZOOM_EASE = 0.44;
/** Time constant (ms) for the `?zsmooth=1` experimental fluid-zoom response.
 *  A short, essentially critically-damped exponential (~100ms) so continuous
 *  wheel gestures read as one unbroken temporal motion instead of discrete
 *  notches, without feeling floaty or overshooting. */
export const FLUID_ZOOM_TAU = 100;

export type ImageSize = "small" | "medium" | "large";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface GridItem {
  bookmarkId: string;
  /** World-space (unzoomed) coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisibleItem {
  bookmarkId: string;
  /** Screen-space coordinates (camera-applied). */
  x: number;
  y: number;
  w: number;
  h: number;
  bucket: ImageSize;
}

export interface GridBookmark {
  bookmarkId: string;
  aspect: number;
}

export interface SpatialEngine {
  bookmarks: GridBookmark[];
  viewportW: number;
  viewportH: number;
  worldW: number;
  worldH: number;
  zFit: number;
  sFit: number;
  minZoom: number;
  interactionMinZoom: number;
  maxZoom: number;
  camera: Camera;
  target: Camera;
  /** Preallocated grid buffers. */
  gridPre: Float64Array;
  gridStarts: number[];
  layoutItems: GridItem[];
  layoutLength: number;
  /** Set of bookmark ids considered visible last frame (for LOD bookkeeping). */
  lastVisible: Set<string>;
  /** True while a camera motion is in progress. */
  animating: boolean;
  /** rAF handle for the controller loop. */
  raf: number | null;
  lastT: number;
  lastZoomUI: number;
  lastGridZ: number;
  lastZoom: number;
  isDragging: boolean;
  hasDragged: boolean;
  dragStart: { x: number; y: number } | null;
  dragCam: Camera | null;
  /** True while the user is actively zooming: the layout is an inert surface
   *  (frozen at gesture start) and the camera alone scales it about the
   *  anchored world point. Layout refinement is suspended until idle settle. */
  fluid: boolean;
  /** Experimental (`?zsmooth=1`): when fluid, wheel events update only
   *  `target.zoom` and the camera advances toward it each rAF with a short
   *  critically-damped response, instead of stamping `camera = target`. */
  fluidSmooth: boolean;
  /** Experimental (`?wz=1`): during an active fluid gesture the camera is
   *  applied as a single `translate + scale` transform on the world container
   *  instead of being baked into every card, so the collection magnifies as one
   *  composited surface. Reverts to per-card rendering after the gesture. */
  worldTransform: boolean;
  /** Last timestamp of zoom input (performance.now) for the post-gesture
   *  idle settle. */
  lastZoomInput: number;
  /** Idle settle morph progress. -1 = not settling, else 0..1. */
  solveT: number;
  /** Geometry snapshot captured at settle start (frozen layout) to morph from. */
  solveFrom: GridItem[];
  /** Solved layout snapshot to morph toward (stable across settle frames). */
  solveTarget: GridItem[];
  /** World dims captured at settle start (frozen) and after solve. */
  solveW0: number;
  solveH0: number;
  solveW1: number;
  solveH1: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const imageRank: Record<ImageSize, number> = { small: 0, medium: 1, large: 2 };

export const imageBucketForZoom = (zoom: number): ImageSize => {
  if (zoom < 0.6) return "small";
  if (zoom < 1.6) return "medium";
  return "large";
};

const damped = (current: number, target: number, k: number) =>
  current + (target - current) * k;

/** Critically-damped settle progression: the layout's single refinement pass
 *  after a zoom gesture ends. One continuous, non-overshooting ease (the
 *  second-order critical step response) so cards glide to their solved slots
 *  exactly once. Normalized so f(0)=0 and f(1)=1. */
export const criticalSettle = (t: number) => {
  const t1 = Math.min(1, Math.max(0, t));
  // f(t) = 1 - (1 + w*t)*e^(-w*t), w chosen so it has essentially converged
  // by t=1 while still moving fast enough to feel responsive.
  const w = 6.5;
  const value = 1 - (1 + w * t1) * Math.exp(-w * t1);
  const end = 1 - (1 + w) * Math.exp(-w);
  return value / end;
};

const elasticSize = (engine: SpatialEngine, z: number) => {
  const lnFit = Math.log(engine.zFit);
  const lnMax = Math.log(engine.maxZoom);
  const lnZ = Math.log(z);
  if (lnZ <= 0) {
    const t = clamp((lnZ - lnFit) / (0 - lnFit), 0, 1);
    return engine.sFit + (ELASTIC_S_OPT - engine.sFit) * t;
  }
  const t = clamp(lnZ / lnMax, 0, 1);
  return ELASTIC_S_OPT + (ELASTIC_S_MAX - ELASTIC_S_OPT) * t;
};

export const computeFit = (engine: SpatialEngine) => {
  const vw = engine.viewportW;
  const vh = engine.viewportH;
  const A = engine.bookmarks.reduce((sum, b) => sum + b.aspect, 0);
  const N = engine.bookmarks.length;
  if (A <= 0 || N === 0 || vw <= 0 || vh <= 0) {
    engine.sFit = 1;
    return;
  }
  const B = A * GAP + N * GAP;
  const C = vw * vh - N * GAP * GAP;
  const disc = B * B + 4 * A * C;
  let sFit = (-B + Math.sqrt(disc)) / (2 * A);
  if (!isFinite(sFit) || sFit <= 0) sFit = Math.sqrt((vw * vh) / A);
  engine.sFit = sFit;
  engine.minZoom = engine.zFit;
};

/**
 * Continuous, analytic grid packing. Every box's geometry is a pure function
 * of the current zoom. Row membership is decided by a cumulative aspect-flow
 * whose boundary moves continuously with zoom, and each row is re-flushed to
 * exactly fill the current viewport width. Zero DOM, zero per-frame allocation.
 */
export const computeGrid = (engine: SpatialEngine, zoom: number) => {
  const vw = engine.viewportW;
  const count = engine.bookmarks.length;
  if (count === 0 || vw <= 0) return;

  const z = zoom > 0 ? zoom : engine.zFit || 1;
  const rowTargetHeight = Math.max(elasticSize(engine, z), MIN_CARD_HEIGHT);
  const rowAspectCapacity = Math.max((vw - GAP) / rowTargetHeight, 0.5);
  if (isNaN(rowAspectCapacity) || rowAspectCapacity <= 0) return;

  const pre = engine.gridPre;
  let acc = 0;
  for (let i = 0; i < count; i += 1) {
    acc += engine.bookmarks[i].aspect;
    pre[i + 1] = acc;
  }

  const starts = engine.gridStarts;
  starts.length = 0;
  starts.push(0);
  for (let e = 1; e < count; e += 1) {
    const thisRow = Math.floor(pre[e] / rowAspectCapacity);
    const prevRow = Math.floor(pre[e - 1] / rowAspectCapacity);
    if (thisRow !== prevRow) starts.push(e);
  }
  starts.push(count);

  const items = engine.layoutItems;
  let y = GAP / 2;
  let slot = 0;
  for (let r = 0; r < starts.length - 1; r += 1) {
    const s = starts[r];
    const n = starts[r + 1];
    const rowCount = n - s;
    const rowSum = pre[n] - pre[s];
    // Left-align rows of one/small count so a lone card doesn't stretch across
    // the whole viewport. Cap this row's height so the widest card in it never
    // exceeds MAX_CARD_FRACTION of the viewport width.
    let rowH = (vw - rowCount * GAP) / Math.max(rowSum, 0.00001);
    let widest = 0;
    for (let i = s; i < n; i += 1) {
      const a = engine.bookmarks[i].aspect;
      if (a > widest) widest = a;
    }
    const capH = (vw * MAX_CARD_FRACTION) / Math.max(widest, 0.00001);
    if (rowH > capH) rowH = capH;
    let x = GAP / 2;
    for (let i = s; i < n; i += 1) {
      const width = engine.bookmarks[i].aspect * rowH;
      const item = items[slot];
      item.bookmarkId = engine.bookmarks[i].bookmarkId;
      item.x = x / z;
      item.y = y / z;
      item.w = width / z;
      item.h = rowH / z;
      slot += 1;
      x += width + GAP;
    }
    y += rowH + GAP;
  }

  engine.worldW = vw / z;
  engine.worldH = y / z;
  engine.layoutLength = slot;
};

/** Capture the current layout geometry (for a settle morph source). */
export const captureLayout = (engine: SpatialEngine) => {
  const from = engine.solveFrom;
  from.length = 0;
  for (let i = 0; i < engine.layoutLength; i += 1) {
    const it = engine.layoutItems[i];
    from.push({ ...it });
  }
};

/** Snapshot the just-solved layout as the settle morph target. */
export const captureTarget = (engine: SpatialEngine) => {
  const target = engine.solveTarget;
  target.length = 0;
  for (let i = 0; i < engine.layoutLength; i += 1) {
    const it = engine.layoutItems[i];
    target.push({ ...it });
  }
};

/** Write the interpolated geometry into layoutItems, and lerp the world dims
 *  toward the solved ones so the camera clamp eases along with the cards
 *  (otherwise a narrower solved worldW snaps the camera on the first settle
 *  frame). Both `from`/`target` snapshots stay fixed so the morph converges.
 *
 *  This is the single refinement pass after the gesture ends: every card eases
 *  to its solved slot with the same critically-damped progression. No locality
 *  cascade, no per-frame cap -- one coherent settle, no re-settling. */
export const morphSettle = (engine: SpatialEngine, t: number) => {
  const from = engine.solveFrom;
  const target = engine.solveTarget;
  const items = engine.layoutItems;
  const n = Math.min(from.length, Math.min(target.length, engine.layoutLength));
  for (let i = 0; i < n; i += 1) {
    const a = from[i];
    const b = target[i];
    const it = items[i];
    // Shared progress: every card samples the SAME t. Neighboring cards never
    // diverge because of differing animation progress — the gap between any two
    // of them evolves monotonically with the single global settle curve.
    it.x = a.x + (b.x - a.x) * t;
    it.y = a.y + (b.y - a.y) * t;
    it.w = a.w + (b.w - a.w) * t;
    it.h = a.h + (b.h - a.h) * t;
  }
  engine.worldW = engine.solveW0 + (engine.solveW1 - engine.solveW0) * t;
  engine.worldH = engine.solveH0 + (engine.solveH1 - engine.solveH0) * t;
};

/**
 * Cull + LOD filter: project world-space grid items into screen space, skip
 * anything off-viewport (with cull buffer) or too small to render (LOD).
 * Reuses a caller-provided output array and a persistent visible-set.
 */
export const cullVisible = (
  engine: SpatialEngine,
  out: VisibleItem[],
  visibleSet: Set<string>,
  worldSpace = false
) => {
  out.length = 0;
  visibleSet.clear();
  const z = engine.camera.zoom;
  const camX = engine.camera.x;
  const camY = engine.camera.y;
  const vw = engine.viewportW;
  const vh = engine.viewportH;
  const bucket = imageBucketForZoom(z);

  // During a live zoom gesture (engine.fluid) the layout is frozen and the
  // camera magnifies it as one inert surface: cards are allowed to overflow
  // every viewport edge and are clipped visually by the viewport's
  // `overflow: hidden`, not culled away. Widen the cull window by the zoom
  // ratio since the grid froze (lastGridZ) so every card that was on screen at
  // gesture start stays mounted and keeps growing past the edges. At rest the
  // window snaps back to the tight CULL_BUFFER.
  const cull = engine.fluid && engine.lastGridZ > 0
    ? (z / engine.lastGridZ) * Math.max(vw, vh)
    : CULL_BUFFER;

  for (let i = 0; i < engine.layoutLength; i += 1) {
    const item = engine.layoutItems[i];
    const sx = item.x * z - camX;
    const sy = item.y * z - camY;
    const sw = item.w * z;
    const sh = item.h * z;
    if (sx + sw < -cull || sx > vw + cull || sy + sh < -cull || sy > vh + cull)
      continue;
    if (sh < MIN_RENDER_HEIGHT) continue;
    visibleSet.add(item.bookmarkId);
    // The experiment mode (`?wz=1`) renders cards in fixed world coordinates
    // and applies the entire camera as one transform on the world container, so
    // the surface magnifies as a single composited layer. Culling/LOD still use
    // screen space above; only the emitted geometry is world-space (unscaled).
    out.push(
      worldSpace
        ? {
            bookmarkId: item.bookmarkId,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            bucket,
          }
        : {
            bookmarkId: item.bookmarkId,
            x: sx,
            y: sy,
            w: sw,
            h: sh,
            bucket,
          }
    );
  }
};

export interface ZoomAnchor {
  /** World-space interaction point beneath the cursor, captured at gesture
   *  start. During an active zoom the camera is owned by the interaction and
   *  re-pinned to keep exactly this world point under the cursor; cards are
   *  NOT tracked (they may slide across the point while the gesture runs). */
  worldX: number;
  worldY: number;
  /** Viewport-relative cursor position at capture. */
  cursorX: number;
  cursorY: number;
}

/** Reconstruct the camera that keeps the anchor's world point under the cursor
 *  at a given zoom: cam = worldPoint * zoom - cursor. */
export const cameraForAnchor = (
  anchor: ZoomAnchor,
  zoom: number
): Camera => {
  return {
    x: anchor.worldX * zoom - anchor.cursorX,
    y: anchor.worldY * zoom - anchor.cursorY,
    zoom,
  };
};

export const createSpatialEngine = (viewportW: number, viewportH: number): SpatialEngine => {
  return {
    bookmarks: [],
    viewportW,
    viewportH,
    worldW: 0,
    worldH: 0,
    zFit: FIT_ZOOM,
    sFit: 1,
    minZoom: FIT_ZOOM,
    interactionMinZoom: INTERACTION_MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    camera: { x: 0, y: 0, zoom: 1 },
    target: { x: 0, y: 0, zoom: 1 },
    gridPre: new Float64Array(0),
    gridStarts: [],
    layoutItems: [],
    layoutLength: 0,
    lastVisible: new Set<string>(),
    animating: false,
    raf: null,
    lastT: 0,
    lastZoomUI: 100,
    lastGridZ: -1,
    lastZoom: 1,
    isDragging: false,
    hasDragged: false,
    dragStart: null,
    dragCam: null,
    fluid: false,
    fluidSmooth: false,
    worldTransform: false,
    lastZoomInput: 0,
    solveT: -1,
    solveFrom: [],
    solveTarget: [],
    solveW0: 0,
    solveH0: 0,
    solveW1: 0,
    solveH1: 0,
  };
};

export const loadEngineBookmarks = (engine: SpatialEngine, layouts: GridBookmark[]) => {
  engine.bookmarks = layouts;
  engine.gridPre = new Float64Array(layouts.length + 1);
  engine.gridStarts = new Array(layouts.length + 2).fill(0);
  engine.layoutItems = layouts.map((b) => ({
    bookmarkId: b.bookmarkId,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  }));
  engine.layoutLength = 0;
  engine.fluid = false;
  engine.solveT = -1;
  engine.solveFrom.length = 0;
  engine.solveTarget.length = 0;
  computeFit(engine);
};

export const setEngineViewport = (engine: SpatialEngine, w: number, h: number) => {
  engine.viewportW = w;
  engine.viewportH = h;
  computeFit(engine);
  computeGrid(engine, engine.camera.zoom);
};

export const hardClampCamera = (engine: SpatialEngine, cam: Camera) => {
  const z = cam.zoom;
  const maxX = Math.max(0, engine.worldW * z - engine.viewportW);
  const maxY = Math.max(0, engine.worldH * z - engine.viewportH);
  const nx = maxX > 0 ? clamp(cam.x, 0, maxX) : (engine.worldW * z - engine.viewportW) / 2;
  const ny = maxY > 0 ? clamp(cam.y, 0, maxY) : (engine.worldH * z - engine.viewportH) / 2;
  const changed = nx !== cam.x || ny !== cam.y;
  cam.x = nx;
  cam.y = ny;
  return changed;
};

export const applyResistance = (value: number, min: number, max: number) => {
  if (value < min) return min - Math.min(min - value, MAX_OVER_SHOOT) * DRAG_RESISTANCE;
  if (value > max) return max + Math.min(value - max, MAX_OVER_SHOOT) * DRAG_RESISTANCE;
  return value;
};

/**
 * Advance camera toward target with exponential damping. Does NOT clamp --
 * the controller must call hardClampCamera AFTER the grid is recomputed for the
 * new zoom, because clamping uses worldW/worldH which is only fresh post-grid.
 * Returns true if any component still differs (keep animating).
 */
export const tickCamera = (engine: SpatialEngine, k: number): boolean => {
  const cam = engine.camera;
  const target = engine.target;
  if (Math.abs(target.x - cam.x) > 0.5) {
    cam.x = damped(cam.x, target.x, k);
  } else if (cam.x !== target.x) {
    cam.x = target.x;
  }
  if (Math.abs(target.y - cam.y) > 0.5) {
    cam.y = damped(cam.y, target.y, k);
  } else if (cam.y !== target.y) {
    cam.y = target.y;
  }
  if (Math.abs(target.zoom - cam.zoom) > 0.0001) {
    cam.zoom = damped(cam.zoom, target.zoom, k);
  } else if (cam.zoom !== target.zoom) {
    cam.zoom = target.zoom;
  }
  return cam.x !== target.x || cam.y !== target.y || cam.zoom !== target.zoom;
};

export const applyZoomAt = (
  engine: SpatialEngine,
  cx: number,
  cy: number,
  nextZoom: number,
  instant = false,
  interactive = true
) => {
  // Interactive zoom (wheel, +/- buttons) floors at INTERACTION_MIN_ZOOM so
  // cards always grow while gesturing. Programmatic framing (Fit) may pass
  // interactive=false to reach the full-world zFit below that floor.
  const floor = interactive ? engine.interactionMinZoom : engine.minZoom;
  const clamped = clamp(nextZoom, floor, engine.maxZoom);
  if (clamped === engine.target.zoom) return;
  const cam = engine.camera;
  const worldX = (cx + cam.x) / cam.zoom;
  const worldY = (cy + cam.y) / cam.zoom;
  const nx = worldX * clamped - cx;
  const ny = worldY * clamped - cy;
  if (instant) {
    engine.camera.x = nx;
    engine.camera.y = ny;
    engine.camera.zoom = clamped;
    engine.target.x = nx;
    engine.target.y = ny;
    engine.target.zoom = clamped;
  } else {
    engine.target.zoom = clamped;
    engine.target.x = nx;
    engine.target.y = ny;
  }
  // NOTE: no clamping here on purpose. worldW/worldH are only fresh AFTER the
  // grid is recomputed for `clamped` zoom, and clamping against the previous
  // zoom's bounds is what previously pushed rows off-center. The controller's
  // render loop clamps both camera and target with fresh bounds right after
  // computeGrid and before any render.
};
