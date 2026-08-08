/**
 * DOM pool renderer for the spatial engine. Consumes a per-frame VisibleItem[]
 * (plus the visible-id set) and diffs against the currently mounted set:
 * mounts new, moves changed, evicts gone. Owns the image cache + preload
 * pipeline and the pool of reused divs. This is the layer a LeaferJS/WebGL
 * backend would replace later, so it only talks in VisibleItem[].
 */
import { twitterImageUrl } from "@/lib/bookmark-utils";
import { kairosPerf } from "@/lib/perf";
import type { Camera, VisibleItem, ImageSize } from "@/lib/spatial/spatial-engine";
import { DOM_WRITE_EPS, imageRank } from "@/lib/spatial/spatial-engine";

/** How card geometry is applied this frame.
 *  - `screen`: the camera is baked into screen-space x/y/w/h (rest + settle).
 *  - `scale`: cards stay at frozen WORLD geometry; only the compositor transform
 *    changes per frame (`translate3d(world*z - cam) scale(z)`). No layout/re-raster
 *    during the fluid gesture — width/height/borders/radius/shadow/DOM are immutable.
 *  - `world`: the whole camera is one container transform (`?wz=1`); cards are
 *    world-positioned with no scale of their own. */
export type RenderMode = "screen" | "scale" | "world";

const IMAGE_SIZES: Record<ImageSize, string> = {
  small: "small",
  medium: "medium",
  large: "large",
};

export interface BookmarkForRender {
  id: string;
  text: string;
  images: { url: string; width: number; height: number }[];
}

interface ActiveEntry {
  poolEl: HTMLDivElement;
  loadedBucket: ImageSize | null;
  /** The rendering contract this card is currently in. `screen`, `scale` and
   *  `world` are different contracts — the cached geometry below is only valid
   *  for the mode in which it was written. Any mode change must rewrite BOTH the
   *  transform and the size atomically so the first frame after a flip is
   *  internally consistent (rendered size == world size × camera zoom, exactly
   *  once). */
  mode: RenderMode;
  /** Last-written projected position (cache key within a mode). */
  lx: number;
  ly: number;
  /** Last-written width/height (cache key within a mode). */
  lw: number;
  lh: number;
}

export interface DomRenderer {
  world: HTMLDivElement;
  poolSize: number;
  preloadBudget: number;
  createPool: () => void;
  /** Render a frame; `visibleIds` drives eviction, `bookmarks` supplies content. */
  render: (
    visible: VisibleItem[],
    visibleIds: Set<string>,
    bookmarks: Map<string, BookmarkForRender>,
    mode?: RenderMode,
    camera?: Camera
  ) => void;
  /** Start preloads queued because the per-frame budget was hit (call on idle rAF).
   *  Returns true when more work remains and the caller should schedule another pass. */
  drainPending: () => boolean;
  activeMapSize: () => number;
  destroy: () => void;
}

export const createDomRenderer = (
  world: HTMLDivElement,
  poolSize: number,
  preloadBudget = 8
): DomRenderer => {
  const activeMap = new Map<string, ActiveEntry>();
  const elToBookmark = new WeakMap<HTMLDivElement, BookmarkForRender>();
  const imageCache = new Map<string, { src: string; bucket: ImageSize }>();
  let freePool: HTMLDivElement[] = [];
  const pendingPreload: VisibleItem[] = [];
  let bookmarks = new Map<string, BookmarkForRender>();

  const hasMedia = (bookmark: BookmarkForRender) =>
    bookmark.images && bookmark.images.length > 0;

  const showEmpty = (element: HTMLDivElement) => {
    const image = element.querySelector<HTMLImageElement>("img");
    const mediaWrap = (element as HTMLDivElement & { _media?: HTMLElement })._media;
    if (image) {
      image.removeAttribute("src");
      image.alt = "";
    }
    mediaWrap?.classList.remove("loading-image");
    element.classList.remove("loading");
  };

  const renderCardContent = (
    element: HTMLDivElement,
    bookmark: BookmarkForRender,
    bucket: ImageSize
  ) => {
    const mediaWrap = (element as HTMLDivElement & { _media?: HTMLElement })._media;
    const image = element.querySelector<HTMLImageElement>("img");

    if (!hasMedia(bookmark) || !mediaWrap || !image) {
      showEmpty(element);
      return;
    }

    // mediaWrap height is 100% of the card via CSS; never write it inline here
    // or it desyncs from the card when a bucket upgrade runs mid-zoom (the card
    // size only updates on width change, leaving the image half-filling a
    // stale-height container).

    const desired = twitterImageUrl(bookmark.images[0].url, IMAGE_SIZES[bucket]);
    const cached = imageCache.get(bookmark.id);

    if (cached && imageRank[cached.bucket] >= imageRank[bucket]) {
      if (image.src !== cached.src) image.src = cached.src;
      image.alt = bookmark.text.substring(0, 80);
      mediaWrap.classList.remove("loading-image");
      element.classList.remove("loading");
      return;
    }

    mediaWrap.classList.add("loading-image");
    element.classList.remove("loading");
    image.alt = bookmark.text.substring(0, 80);

    // Load directly into the visible <img> so the browser starts fetching the
    // moment the card is served (no throwaway preload that stalls the skeleton
    // on a second network round-trip). Keep the shimmer on until our own load
    // event resolves, then cache the decoded bucket.
    image.onload = () => {
      // The pool element may have been evicted and recycled for a different
      // bookmark before this load resolves -- touching it here would paint the
      // wrong image onto the wrong card. Verify ownership first.
      if (elToBookmark.get(element) !== bookmark) return;
      const latest = imageCache.get(bookmark.id);
      if (latest && imageRank[latest.bucket] > imageRank[bucket]) return;
      mediaWrap.classList.remove("loading-image");
      imageCache.set(bookmark.id, { src: desired, bucket });
    };
    image.onerror = () => {
      if (elToBookmark.get(element) !== bookmark) return;
      const latest = imageCache.get(bookmark.id);
      if (latest && imageRank[latest.bucket] > imageRank[bucket]) return;
      mediaWrap.classList.remove("loading-image");
    };
    if (image.src !== desired) image.src = desired;
  };

  const renderImpl = (
    visible: VisibleItem[],
    visibleIds: Set<string>,
    mode: RenderMode = "screen",
    camera?: Camera
  ) => {
    kairosPerf.begin("camera", "render:pool");
    let budget = preloadBudget;
    const z = mode === "scale" && camera ? camera.zoom : 1;
    const camX = mode === "scale" && camera ? camera.x : 0;
    const camY = mode === "scale" && camera ? camera.y : 0;
    // During a live fluid gesture (`mode === "scale"`), cards are pinned to their
    // frozen world geometry and the zoom is applied ONLY as a compositor transform.
    // LOD bucket upgrades (higher-res image src swaps) are deferred until the
    // gesture settles so no card re-renders its content mid-zoom.
    const deferUpgrade = mode === "scale";

    for (const item of visible) {
      const id = item.bookmarkId;
      const existing = activeMap.get(id);
      // Per-mode screen geometry: `scale` keeps world size but moves the camera
      // into the transform; `screen`/`world` pass geometry through untouched.
      const px = mode === "scale" ? item.x * z - camX : item.x;
      const py = mode === "scale" ? item.y * z - camY : item.y;
      const rw = item.w;
      const rh = item.h;
      const transform =
        mode === "scale"
          ? `translate3d(${px}px, ${py}px, 0) scale(${z})`
          : `translate3d(${px}px, ${py}px, 0)`;
      if (existing) {
        // A mode transition is a new render contract: the transform semantics
        // and the geometry representation change together, so both must be
        // rewritten in the same frame regardless of EPS. Comparing mode here
        // (not just px/py) is what prevents a stale `scale(z)` transform from
        // surviving across a screen<->scale flip.
        const modeChanged = existing.mode !== mode;
        if (
          modeChanged ||
          Math.abs(px - existing.lx) > DOM_WRITE_EPS ||
          Math.abs(py - existing.ly) > DOM_WRITE_EPS
        ) {
          existing.poolEl.style.transform = transform;
          existing.lx = px;
          existing.ly = py;
          kairosPerf.count("render:writes");
        }
        if (
          modeChanged ||
          Math.abs(rw - existing.lw) > DOM_WRITE_EPS ||
          Math.abs(rh - existing.lh) > DOM_WRITE_EPS
        ) {
          existing.poolEl.style.width = `${rw}px`;
          existing.poolEl.style.height = `${rh}px`;
          existing.lw = rw;
          existing.lh = rh;
        }
        existing.mode = mode;
        const bucket = item.bucket;
        if (bucket !== existing.loadedBucket && !deferUpgrade) {
          const cached = imageCache.get(id);
          const isUpgrade = cached ? imageRank[bucket] > imageRank[cached.bucket] : true;
          if (isUpgrade) {
            existing.loadedBucket = bucket;
            const bookmark = bookmarks.get(id);
            if (bookmark) renderCardContent(existing.poolEl, bookmark, bucket);
            kairosPerf.count("render:content");
          }
        }
      } else {
        const bookmark = bookmarks.get(id);
        if (!bookmark) continue;
        const poolEl = freePool.pop();
        if (!poolEl) {
          pendingPreload.push(item);
          continue;
        }
        poolEl.style.display = "";
        poolEl.style.width = `${rw}px`;
        poolEl.style.height = `${rh}px`;
        poolEl.style.transform = transform;
        // loadedBucket stays null until content is actually rendered below (or
        // in drainPending); marking it eagerly would make drainPending skip this
        // entry and the card would stay blank after budget exhaustion.
        activeMap.set(id, { poolEl, loadedBucket: null, mode, lx: px, ly: py, lw: rw, lh: rh });
        elToBookmark.set(poolEl, bookmark);
        kairosPerf.count("render:writes");

        if (budget > 0) {
          budget -= 1;
          renderCardContent(poolEl, bookmark, item.bucket);
          const entry = activeMap.get(id);
          if (entry) entry.loadedBucket = item.bucket;
          kairosPerf.count("render:content");
        } else {
          pendingPreload.push(item);
        }
      }
    }
    kairosPerf.end("camera", "render:pool");

    kairosPerf.begin("camera", "render:evict");
    for (const [id, entry] of activeMap) {
      if (!visibleIds.has(id)) {
        entry.poolEl.style.display = "none";
        const image = entry.poolEl.querySelector<HTMLImageElement>("img");
        // Reset the recycled card to its canonical skeleton state so a card
        // waiting on the preload budget never shows stale alt text in place of
        // the shimmer: clear src AND alt, drop the loaded-content shimmer class
        // and restore the element-level skeleton (the card's default state in
        // createPool). Without the alt clear, a recycled card whose content is
        // deferred to pendingPreload displays the PREVIOUS bookmark's alt text.
        if (image) {
          image.removeAttribute("src");
          image.alt = "";
        }
        (entry.poolEl as HTMLDivElement & { _media?: HTMLElement })._media?.classList.remove(
          "loading-image"
        );
        entry.poolEl.classList.add("loading");
        freePool.push(entry.poolEl);
        elToBookmark.delete(entry.poolEl);
        activeMap.delete(id);
      }
    }
    kairosPerf.end("camera", "render:evict");
  };

  const renderer: DomRenderer = {
    world,
    poolSize,
    preloadBudget,
    createPool() {
      world.innerHTML = "";
      freePool = [];
      activeMap.clear();

      const fragment = document.createDocumentFragment();
      for (let index = 0; index < poolSize; index += 1) {
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
        freePool.push(element);
      }
      world.appendChild(fragment);
    },
    render(visible, visibleIds, bookmarks_, mode = "screen", camera) {
      bookmarks = bookmarks_;
      renderImpl(visible, visibleIds, mode, camera);
    },
    drainPending() {
      const budget = preloadBudget;
      let count = 0;
      const remaining: VisibleItem[] = [];
      for (const item of pendingPreload) {
        if (count >= budget) {
          remaining.push(item);
          continue;
        }
        const entry = activeMap.get(item.bookmarkId);
        if (!entry) continue;
        if (entry.loadedBucket === item.bucket) continue;
        const bookmark = bookmarks.get(item.bookmarkId);
        if (!bookmark) continue;
        entry.loadedBucket = item.bucket;
        renderCardContent(entry.poolEl, bookmark, item.bucket);
        kairosPerf.count("render:content");
        count += 1;
      }
      pendingPreload.length = 0;
      // Keep the unprocessed tail so a subsequent drain (driven by the
      // controller re-triggering the loop) can finish it; dropping it here
      // would leave cards permanently blank when a single frame mounts more
      // items than the per-frame budget.
      for (const item of remaining) pendingPreload.push(item);
      return remaining.length > 0;
    },
    activeMapSize() {
      return activeMap.size;
    },
    destroy() {
      world.innerHTML = "";
      activeMap.clear();
      freePool = [];
      pendingPreload.length = 0;
      imageCache.clear();
    },
  };

  return renderer;
};