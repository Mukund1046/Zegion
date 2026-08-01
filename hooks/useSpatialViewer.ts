"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { kairosPerf } from "@/lib/perf";
import { clamp, isLowSpecDevice, twitterImageUrl } from "@/lib/bookmark-utils";
import type { LayoutItem } from "@/lib/bookmark-utils";
import type { Bookmark } from "@/lib/types";
import { apiFetch } from "@/lib/client-api";

const GAP = 18;
const DRAG_THRESHOLD_SQ = 25;
const ZOOM_WHEEL_THRESHOLD = 60;
const ZOOM_WHEEL_FACTOR = 1.2;
const ZOOM_STEP_FACTOR = 1.25;
const MAX_ZOOM = 4.5;
const FIT_ZOOM = 0.02;
const PROTOTYPE_COUNT = 800;
const CULL_BUFFER = 600;
const MOUNT_SLICE = 6;
const DRAG_SPEED = 1.15;
const DRAG_RESISTANCE = 0.25;
const MAX_OVER_SHOOT = 220;
const ELASTIC_S_MAX = 380;
const ELASTIC_S_OPT = 200;
const REFLOW_DELAY = 160;
const REFLOW_ZOOM_EPS = 0.015;
const REFLOW_THROTTLE_MS = 100;
const SETTLE_PROPAGATION = 0.4;
const VELOCITY_CLAMP_CARDS = 1;
const DOM_WRITE_EPS = 0.25;

type ImageSize = "small" | "medium" | "large";

const IMAGE_SIZES: Record<ImageSize, string> = {
  small: "small",
  medium: "medium",
  large: "large",
};

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface ActiveEntry {
  poolEl: HTMLDivElement;
  zoomBucket: ImageSize;
  lx: number;
  ly: number;
}

const imageBucket = (zoom: number): ImageSize => {
  if (zoom < 0.6) return "small";
  if (zoom < 1.6) return "medium";
  return "large";
};

const damped = (current: number, target: number, k: number) =>
  current + (target - current) * k;

const clampVel = (value: number, limit: number) => {
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
};

interface SpatialLayout {
  items: LayoutItem[];
  worldW: number;
  worldH: number;
  rows: number;
}

/**
 * Finds the lowest-cost contiguous partition for a justified image grid.
 * Every row fills the available world width; card height is therefore the
 * result of the solve rather than a fixed input. The bounded row width keeps
 * the dynamic program inexpensive even for the 800-item prototype.
 */
const solveJustifiedRows = (
  bookmarks: Bookmark[],
  aspects: number[],
  worldW: number,
  gap: number,
  desiredHeight: number
): SpatialLayout => {
  const count = bookmarks.length;
  if (count === 0 || worldW <= gap) {
    return { items: [], worldW: 0, worldH: 0, rows: 0 };
  }

  const totalAspect = aspects.reduce((sum, aspect) => sum + aspect, 0);
  const estimatedRows = Math.round(
    (totalAspect * desiredHeight + count * gap) / worldW
  );
  const rows = clamp(estimatedRows, 1, count);
  const idealItemsPerRow = count / rows;
  const maxItemsPerRow = Math.min(
    count,
    Math.max(8, Math.ceil(idealItemsPerRow * 3.25))
  );
  const prefix = new Float64Array(count + 1);
  for (let index = 0; index < count; index += 1) {
    prefix[index + 1] = prefix[index] + aspects[index];
  }

  let previous = new Float64Array(count + 1);
  previous.fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;
  const starts = new Int16Array((rows + 1) * (count + 1));
  starts.fill(-1);

  for (let row = 1; row <= rows; row += 1) {
    const next = new Float64Array(count + 1);
    next.fill(Number.POSITIVE_INFINITY);
    const minEnd = row;
    const maxEnd = Math.min(count, row * maxItemsPerRow);
    for (let end = minEnd; end <= maxEnd; end += 1) {
      const firstStart = Math.max(row - 1, end - maxItemsPerRow);
      for (let start = firstStart; start < end; start += 1) {
        const prior = previous[start];
        if (!Number.isFinite(prior)) continue;
        const rowCount = end - start;
        const aspectSum = prefix[end] - prefix[start];
        const rowHeight = (worldW - rowCount * gap) / aspectSum;
        if (rowHeight <= 0) continue;
        const heightCost = Math.pow(Math.log(rowHeight / desiredHeight), 2);
        const densityCost =
          Math.pow((rowCount - idealItemsPerRow) / maxItemsPerRow, 2) * 0.04;
        const cost = prior + heightCost + densityCost;
        if (cost < next[end]) {
          next[end] = cost;
          starts[row * (count + 1) + end] = start;
        }
      }
    }
    previous = next;
  }

  const boundaries = new Array<number>(rows + 1);
  boundaries[rows] = count;
  let end = count;
  for (let row = rows; row > 0; row -= 1) {
    const start = starts[row * (count + 1) + end];
    if (start < 0) {
      for (let index = 0; index <= rows; index += 1) {
        boundaries[index] = Math.round((index * count) / rows);
      }
      break;
    }
    boundaries[row - 1] = start;
    end = start;
  }

  const items: LayoutItem[] = [];
  let y = 0;
  for (let row = 0; row < rows; row += 1) {
    const start = boundaries[row];
    const endIndex = boundaries[row + 1];
    const rowCount = endIndex - start;
    const aspectSum = prefix[endIndex] - prefix[start];
    const rowHeight = Math.max(
      1,
      (worldW - rowCount * gap) / Math.max(aspectSum, 0.001)
    );
    let x = gap / 2;
    for (let index = start; index < endIndex; index += 1) {
      const width = aspects[index] * rowHeight;
      items.push({
        key: `${row}-${index}`,
        bookmark: bookmarks[index],
        x,
        y: y + gap / 2,
        w: width,
        h: rowHeight,
      });
      x += width + gap;
    }
    y += rowHeight + gap;
  }

  return { items, worldW, worldH: y, rows };
};

export function useSpatialViewer() {
  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const minimapWorldRef = useRef<HTMLDivElement>(null);
  const minimapViewportRef = useRef<HTMLDivElement>(null);

  const [zoomPercent, setZoomPercent] = useState(100);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  const engineRef = useRef({
    layoutItems: [] as LayoutItem[],
    reflowTargets: null as LayoutItem[] | null,
    layoutR: 1,
    refracting: false,
    settleTimer: null as number | null,
    bookmarks: [] as Bookmark[],
    aspectUnits: [] as number[],
    totalAspect: 0,
    sFit: 1,
    zFit: FIT_ZOOM,
    worldW: 0,
    worldH: 0,
    viewportW: 0,
    viewportH: 0,
    minZoom: FIT_ZOOM,
    maxZoom: MAX_ZOOM,
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    target: { x: 0, y: 0, zoom: 1 } as Camera,
    pool: [] as HTMLDivElement[],
    freePool: [] as HTMLDivElement[],
    activeMap: new Map<string, ActiveEntry>(),
    elToBookmark: new WeakMap<HTMLDivElement, Bookmark>(),
    raf: null as number | null,
    sliceRaf: null as number | null,
    lastT: 0,
    animating: false,
    loaded: false,
    hasUnrendered: false,
    isDragging: false,
    hasDragged: false,
    dragStart: null as { x: number; y: number } | null,
    dragCam: null as { x: number; y: number } | null,
    wheelAccum: 0,
    solveZoom: 1,
    lastReflowAt: 0,
    zoomWasMoving: false,
    poolSize: isLowSpecDevice() ? 260 : Math.max(420, PROTOTYPE_COUNT + 100),
  });

  const ensureLoopRef = useRef<() => void>(() => {});

  const hardClamp = useCallback((cam: Camera) => {
    const engine = engineRef.current;
    const z = cam.zoom;
    const maxX = Math.max(0, engine.worldW * z - engine.viewportW);
    const maxY = Math.max(0, engine.worldH * z - engine.viewportH);
    cam.x = maxX > 0 ? clamp(cam.x, 0, maxX) : (engine.worldW * z - engine.viewportW) / 2;
    cam.y = maxY > 0 ? clamp(cam.y, 0, maxY) : (engine.worldH * z - engine.viewportH) / 2;
  }, []);

  const applyResistance = (value: number, min: number, max: number) => {
    if (value < min) return min - Math.min(min - value, MAX_OVER_SHOOT) * DRAG_RESISTANCE;
    if (value > max) return max + Math.min(value - max, MAX_OVER_SHOOT) * DRAG_RESISTANCE;
    return value;
  };

  const computeFit = useCallback(() => {
    const engine = engineRef.current;
    const vw = engine.viewportW;
    const vh = engine.viewportH;
    const A = engine.totalAspect;
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
    engine.zFit = FIT_ZOOM;
    engine.minZoom = engine.zFit;
  }, []);

  const elasticSize = useCallback((z: number) => {
    const engine = engineRef.current;
    const lnFit = Math.log(engine.zFit);
    const lnMax = Math.log(engine.maxZoom);
    const lnZ = Math.log(z);
    if (lnZ <= 0) {
      const t = clamp((lnZ - lnFit) / (0 - lnFit), 0, 1);
      return engine.sFit + (ELASTIC_S_OPT - engine.sFit) * t;
    }
    const t = clamp(lnZ / lnMax, 0, 1);
    return ELASTIC_S_OPT + (ELASTIC_S_MAX - ELASTIC_S_OPT) * t;
  }, []);

  const computeLayout = useCallback((z: number) => {
    const engine = engineRef.current;
    const vw = engine.viewportW;
    if (engine.bookmarks.length === 0 || vw <= 0 || z <= 0) {
      return { items: [] as LayoutItem[], worldW: 0, worldH: 0, rows: 0 };
    }
    return solveJustifiedRows(
      engine.bookmarks,
      engine.aspectUnits,
      vw / z,
      GAP / z,
      elasticSize(z) / z
    );
  }, [elasticSize]);

  const layoutMinimap = useCallback(() => {
    const engine = engineRef.current;
    const mw = minimapWorldRef.current;
    if (!mw || engine.worldW <= 0 || engine.worldH <= 0) return;
    const aspect = engine.worldW / engine.worldH;
    const maxH = Math.min(180, Math.max(60, engine.viewportH * 0.4));
    const maxW = Math.min(220, engine.viewportW * 0.3);
    let height = maxH;
    let width = height * aspect;
    if (width > maxW) {
      width = maxW;
      height = width / aspect;
    }
    mw.style.width = `${width}px`;
    mw.style.height = `${height}px`;
  }, []);

  const updateMinimap = useCallback(() => {
    const engine = engineRef.current;
    const mw = minimapWorldRef.current;
    const mv = minimapViewportRef.current;
    if (!mw || !mv || !engine.loaded) return;
    const scale = mw.clientWidth / Math.max(1, engine.worldW);
    const z = engine.camera.zoom;
    const worldCamX = engine.camera.x / z;
    const worldCamY = engine.camera.y / z;
    mv.style.left = `${(worldCamX * scale).toFixed(1)}px`;
    mv.style.top = `${(worldCamY * scale).toFixed(1)}px`;
    mv.style.width = `${Math.max(2, (engine.viewportW / z) * scale).toFixed(1)}px`;
    mv.style.height = `${Math.max(2, (engine.viewportH / z) * scale).toFixed(1)}px`;
  }, []);

  const renderCardContent = useCallback(
    (element: HTMLDivElement, bookmark: Bookmark, item: LayoutItem, bucket: ImageSize, heightPx: number) => {
      const mediaWrap = (element as HTMLDivElement & { _media?: HTMLElement })._media;
      const image = element.querySelector<HTMLImageElement>("img");
      const hasImage = bookmark.images && bookmark.images.length > 0;

      if (hasImage && mediaWrap && image) {
        mediaWrap.style.height = `${Math.round(heightPx)}px`;
        mediaWrap.classList.remove("loading-image");
        const source = twitterImageUrl(bookmark.images[0].url, IMAGE_SIZES[bucket]);
        if (image.src !== source) {
          mediaWrap.classList.add("loading-image");
          image.onload = () => mediaWrap.classList.remove("loading-image");
          image.onerror = () => mediaWrap.classList.remove("loading-image");
          image.src = source;
          image.alt = bookmark.text.substring(0, 80);
        }
      } else if (image) {
        image.removeAttribute("src");
        image.alt = "";
        if (mediaWrap) mediaWrap.classList.remove("loading-image");
      }
      element.classList.remove("loading");
    },
    []
  );

  const renderVisibleItems = useCallback(
    (sliceLimit?: number) => {
      const engine = engineRef.current;
      const world = worldRef.current;
      if (!world || !engine.loaded) return;

      const vw = engine.viewportW;
      const vh = engine.viewportH;
      const z = engine.camera.zoom;
      const camX = engine.camera.x;
      const camY = engine.camera.y;
      const visible = new Set<string>();
      engine.hasUnrendered = false;
      let mounted = 0;

      kairosPerf.begin("camera", "render:pool");
      for (const item of engine.layoutItems) {
        const x = item.x * z - camX;
        const y = item.y * z - camY;
        const w = item.w * z;
        const h = item.h * z;
        if (x + w < -CULL_BUFFER || x > vw + CULL_BUFFER || y + h < -CULL_BUFFER || y > vh + CULL_BUFFER)
          continue;

        const id = item.bookmark.id;
        visible.add(id);
        const existing = engine.activeMap.get(id);
        if (existing) {
          if (Math.abs(x - existing.lx) > DOM_WRITE_EPS || Math.abs(y - existing.ly) > DOM_WRITE_EPS) {
            existing.poolEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            existing.lx = x;
            existing.ly = y;
            kairosPerf.count("render:writes");
          }
          const rw = Math.round(w);
          const rh = Math.round(h);
          const mediaWrap = (existing.poolEl as HTMLDivElement & { _media?: HTMLElement })._media;
          if (existing.poolEl.style.width !== `${rw}px`) {
            existing.poolEl.style.width = `${rw}px`;
            existing.poolEl.style.height = `${rh}px`;
            if (mediaWrap) mediaWrap.style.height = `${rh}px`;
          }
          const bucket = imageBucket(z);
          if (bucket !== existing.zoomBucket) {
            existing.zoomBucket = bucket;
            renderCardContent(existing.poolEl, item.bookmark, item, bucket, h);
            kairosPerf.count("render:content");
          }
        } else {
          if (sliceLimit !== undefined && mounted >= sliceLimit) {
            engine.hasUnrendered = true;
            continue;
          }
          mounted += 1;
          const poolEl = engine.freePool.pop();
          if (!poolEl) {
            engine.hasUnrendered = false;
            continue;
          }
          poolEl.style.display = "";
          poolEl.style.width = `${Math.round(w)}px`;
          poolEl.style.height = `${Math.round(h)}px`;
          const bucket = imageBucket(z);
          poolEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          renderCardContent(poolEl, item.bookmark, item, bucket, h);
          kairosPerf.count("render:writes");
          kairosPerf.count("render:content");
          engine.elToBookmark.set(poolEl, item.bookmark);
          engine.activeMap.set(id, { poolEl, zoomBucket: bucket, lx: x, ly: y });
        }
      }
      kairosPerf.end("camera", "render:pool");

      if (sliceLimit !== undefined) return;

      kairosPerf.begin("camera", "render:evict");
      for (const [id, entry] of engine.activeMap) {
        if (!visible.has(id)) {
          entry.poolEl.style.display = "none";
          engine.freePool.push(entry.poolEl);
          engine.elToBookmark.delete(entry.poolEl);
          engine.activeMap.delete(id);
        }
      }
      kairosPerf.end("camera", "render:evict");
    },
    [renderCardContent]
  );

  const createPool = useCallback(() => {
    const world = worldRef.current;
    const engine = engineRef.current;
    if (!world) return;

    world.innerHTML = "";
    engine.pool = [];
    engine.freePool = [];
    engine.activeMap.clear();

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < engine.poolSize; index += 1) {
      const element = document.createElement("div");
      element.className = "grid-item loading";
      element.style.display = "none";
      element.innerHTML = `
        <div class="grid-item-media">
          <img src="" alt="" loading="lazy" decoding="async">
        </div>
      `;
      (element as HTMLDivElement & { _media?: HTMLElement })._media =
        element.querySelector<HTMLElement>(".grid-item-media") ?? undefined;
      fragment.appendChild(element);
      engine.pool.push(element);
      engine.freePool.push(element);
    }
    world.appendChild(fragment);
  }, []);

  const retargetLayout = useCallback(
    (z: number) => {
      const engine = engineRef.current;
      if (Math.abs(z - engine.solveZoom) < REFLOW_ZOOM_EPS) return;
      const layout = computeLayout(z);
      engine.reflowTargets = layout.items;
      engine.layoutR = layout.rows;
      engine.solveZoom = z;
      engine.worldW = layout.worldW;
      engine.worldH = layout.worldH;
      engine.refracting = true;
      engine.lastReflowAt = performance.now();
      layoutMinimap();
      ensureLoopRef.current();
    },
    [computeLayout, layoutMinimap]
  );

  const scheduleReflow = useCallback(() => {
    const engine = engineRef.current;
    if (engine.settleTimer !== null) return;
    engine.settleTimer = window.setTimeout(() => {
      engine.settleTimer = null;
      retargetLayout(engine.camera.zoom);
    }, REFLOW_DELAY);
  }, [retargetLayout]);

  const ensureLoop = useCallback(() => {
    const engine = engineRef.current;
    if (engine.raf !== null) return;
    engine.lastT = performance.now();
    engine.animating = true;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(Math.max(now - engine.lastT, 0), 50);
      engine.lastT = now;
      const cam = engine.camera;
      const target = engine.target;
      const k = 1 - Math.pow(0.78, dt / 16.667);
      let camMoved = false;
      let zoomMoved = false;

      kairosPerf.time("camera", "camera:tick", () => {
        if (Math.abs(target.x - cam.x) > 0.5) {
          cam.x = damped(cam.x, target.x, k);
          camMoved = true;
        } else if (cam.x !== target.x) {
          cam.x = target.x;
        }
        if (Math.abs(target.y - cam.y) > 0.5) {
          cam.y = damped(cam.y, target.y, k);
          camMoved = true;
        } else if (cam.y !== target.y) {
          cam.y = target.y;
        }
        if (Math.abs(target.zoom - cam.zoom) > 0.0005) {
          cam.zoom = damped(cam.zoom, target.zoom, k);
          camMoved = true;
          zoomMoved = true;
        } else if (cam.zoom !== target.zoom) {
          cam.zoom = target.zoom;
        }
      });

      if (zoomMoved) {
        engine.zoomWasMoving = true;
        if (engine.settleTimer !== null) {
          window.clearTimeout(engine.settleTimer);
          engine.settleTimer = null;
        }
      }

      if (engine.refracting) {
        if (zoomMoved && now - engine.lastReflowAt >= REFLOW_THROTTLE_MS) {
          retargetLayout(cam.zoom);
        }
        const tgt = engine.reflowTargets;
        let any = false;
        if (tgt && tgt.length === engine.layoutItems.length) {
          const zs = cam.zoom;
          const vw = engine.viewportW;
          const vh = engine.viewportH;
          for (let i = 0; i < engine.layoutItems.length; i += 1) {
            const t = tgt[i];
            const c = engine.layoutItems[i];
            const baseCap = VELOCITY_CLAMP_CARDS * Math.max(t.w, 1);
            const cap = (delta: number) => Math.max(baseCap, Math.abs(delta) * k);
            const dist = Math.min(
              1,
              Math.hypot((c.x + c.w / 2) * zs - cam.x - vw / 2, (c.y + c.h / 2) * zs - cam.y - vh / 2) /
                Math.max(vw, vh, 1)
            );
            const kk = k * (1 + SETTLE_PROPAGATION * (0.5 - dist));
            const dx = clampVel((t.x - c.x) * kk, cap(t.x - c.x));
            const dy = clampVel((t.y - c.y) * kk, cap(t.y - c.y));
            const dw = clampVel((t.w - c.w) * kk, cap(t.w - c.w));
            const dh = clampVel((t.h - c.h) * kk, cap(t.h - c.h));
            c.x += dx;
            c.y += dy;
            c.w += dw;
            c.h += dh;
            if (Math.abs(dx * zs) > 0.1 || Math.abs(dy * zs) > 0.1 || Math.abs(dw * zs) > 0.1 || Math.abs(dh * zs) > 0.1) {
              any = true;
            }
          }
        }
        if (!any) {
          engine.refracting = false;
          engine.reflowTargets = null;
        }
        camMoved = camMoved || any;
      } else if (zoomMoved) {
        if (now - engine.lastReflowAt >= REFLOW_THROTTLE_MS) {
          retargetLayout(cam.zoom);
        }
        camMoved = true;
      } else if (engine.settleTimer === null) {
        scheduleReflow();
      }

      if (!zoomMoved && engine.zoomWasMoving) {
        engine.zoomWasMoving = false;
        retargetLayout(cam.zoom);
        if (engine.refracting) camMoved = true;
      }

      if (camMoved) {
        hardClamp(cam);
        hardClamp(target);
        kairosPerf.frame("camera", engine.activeMap.size, engine.layoutItems.length, dt);
        renderVisibleItems();
        updateMinimap();
        if (zoomMoved) setZoomPercent(Math.round(cam.zoom * 100));
        engine.raf = requestAnimationFrame(tick);
      } else {
        engine.raf = null;
        engine.animating = false;
      }
    };
    engine.raf = requestAnimationFrame(tick);
  }, [hardClamp, renderVisibleItems, updateMinimap, scheduleReflow, retargetLayout]);

  ensureLoopRef.current = ensureLoop;

  const applyZoomAt = useCallback(
    (cx: number, cy: number, nextZoom: number) => {
      const engine = engineRef.current;
      const clamped = clamp(nextZoom, engine.minZoom, engine.maxZoom);
      if (clamped === engine.target.zoom) return;
      const cam = engine.camera;
      const worldX = (cx + cam.x) / cam.zoom;
      const worldY = (cy + cam.y) / cam.zoom;
      engine.target.zoom = clamped;
      engine.target.x = worldX * clamped - cx;
      engine.target.y = worldY * clamped - cy;
      hardClamp(engine.target);
      ensureLoop();
    },
    [hardClamp, ensureLoop]
  );

  const zoomBy = useCallback(
    (steps: number) => {
      const engine = engineRef.current;
      applyZoomAt(engine.viewportW / 2, engine.viewportH / 2, engine.target.zoom * Math.pow(ZOOM_STEP_FACTOR, steps));
    },
    [applyZoomAt]
  );

  const fitWorld = useCallback(() => {
    const engine = engineRef.current;
    applyZoomAt(engine.viewportW / 2, engine.viewportH / 2, engine.zFit);
  }, [applyZoomAt]);

  const detailZoom = useCallback(() => {
    const engine = engineRef.current;
    applyZoomAt(engine.viewportW / 2, engine.viewportH / 2, 1);
  }, [applyZoomAt]);

  const resetZoom = useCallback(() => {
    const engine = engineRef.current;
    engine.target.x = 0;
    engine.target.y = 0;
    engine.target.zoom = 1;
    hardClamp(engine.target);
    ensureLoop();
  }, [hardClamp, ensureLoop]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const minimap = minimapRef.current;
    const engine = engineRef.current;
    if (!viewport) return;

    let cancelled = false;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!engine.loaded) return;
      const rect = viewport.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;

      if (event.ctrlKey) {
        engine.wheelAccum += event.deltaY;
        const steps = Math.trunc(engine.wheelAccum / ZOOM_WHEEL_THRESHOLD);
        if (steps !== 0) {
          engine.wheelAccum -= steps * ZOOM_WHEEL_THRESHOLD;
          applyZoomAt(cx, cy, engine.target.zoom * Math.pow(ZOOM_WHEEL_FACTOR, steps));
        }
        return;
      }

      engine.target.y += event.deltaY;
      hardClamp(engine.target);
      ensureLoop();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest(".spatial-minimap")) return;
      engine.isDragging = true;
      engine.hasDragged = false;
      engine.dragStart = { x: event.clientX, y: event.clientY };
      engine.dragCam = { x: engine.camera.x, y: engine.camera.y };
      setDragging(true);
      viewport.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!engine.isDragging || !engine.dragStart) return;
      const dx = event.clientX - engine.dragStart.x;
      const dy = event.clientY - engine.dragStart.y;
      if (!engine.hasDragged && dx * dx + dy * dy > DRAG_THRESHOLD_SQ) {
        engine.hasDragged = true;
      }
      const zoom = engine.camera.zoom;
      const maxY = Math.max(0, engine.worldH * zoom - engine.viewportH);
      engine.target.y = applyResistance(engine.dragCam!.y - dy * DRAG_SPEED, 0, maxY);
      ensureLoop();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!engine.isDragging) return;
      engine.isDragging = false;
      engine.dragStart = null;
      engine.dragCam = null;
      setDragging(false);
      hardClamp(engine.target);
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
      if (!mw || !engine.loaded) return;
      const rect = mw.getBoundingClientRect();
      const fy = (event.clientY - rect.top) / rect.height;
      const z = engine.camera.zoom;
      engine.target.x = 0;
      engine.target.y = fy * engine.worldH * z - engine.viewportH / 2;
      hardClamp(engine.target);
      ensureLoop();
    };

    const snapLayout = () => {
      const layout = computeLayout(engine.camera.zoom);
      engine.layoutItems = layout.items;
      engine.layoutR = layout.rows;
      engine.solveZoom = engine.camera.zoom;
      engine.worldW = layout.worldW;
      engine.worldH = layout.worldH;
      engine.reflowTargets = null;
      engine.refracting = false;
    };

    const onWindowResize = () => {
      if (!engine.loaded) return;
      engine.viewportW = viewport.clientWidth || window.innerWidth;
      engine.viewportH = viewport.clientHeight || window.innerHeight;
      computeFit();
      snapLayout();
      hardClamp(engine.camera);
      hardClamp(engine.target);
      renderVisibleItems();
      layoutMinimap();
      updateMinimap();
    };

    const init = async () => {
      engine.viewportW = viewport.clientWidth || window.innerWidth;
      engine.viewportH = viewport.clientHeight || window.innerHeight;

      const response = await apiFetch("/api/bookmarks");
      const data = await response.json();
      if (cancelled) return;
      const bookmarks = (Array.isArray(data) ? data : data.bookmarks || []) as Bookmark[];
      const withMedia = bookmarks.filter(
        (bookmark) => bookmark.images && bookmark.images.length > 0
      );
      const subset = withMedia.slice(0, PROTOTYPE_COUNT);
      engine.bookmarks = subset;
      engine.aspectUnits = subset.map((bookmark) => {
        const image = bookmark.images?.[0];
        const aspect = image && image.width > 0 && image.height > 0 ? image.width / image.height : 1;
        return aspect;
      });
      engine.totalAspect = engine.aspectUnits.reduce((sum, aspect) => sum + aspect, 0);

      computeFit();
      engine.maxZoom = MAX_ZOOM;
      engine.camera = { x: 0, y: 0, zoom: 1 };
      engine.target = { x: 0, y: 0, zoom: 1 };
      snapLayout();

      createPool();
      engine.loaded = true;
      layoutMinimap();
      setCount(subset.length);
      setLoaded(true);
      setZoomPercent(100);

      const mountNext = () => {
        renderVisibleItems(MOUNT_SLICE);
        if (engineRef.current.hasUnrendered) {
          engineRef.current.sliceRaf = requestAnimationFrame(mountNext);
        } else {
          engineRef.current.sliceRaf = null;
          updateMinimap();
        }
      };
      mountNext();
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
      const current = engineRef.current;
      if (current.raf !== null) cancelAnimationFrame(current.raf);
      if (current.sliceRaf !== null) cancelAnimationFrame(current.sliceRaf);
      if (current.settleTimer !== null) window.clearTimeout(current.settleTimer);
      current.raf = null;
      current.sliceRaf = null;
      current.settleTimer = null;
    };
  }, [
    applyZoomAt,
    computeFit,
    computeLayout,
    createPool,
    elasticSize,
    ensureLoop,
    hardClamp,
    layoutMinimap,
    renderVisibleItems,
    updateMinimap,
  ]);

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
