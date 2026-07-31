export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeometryState {
  prev: Rect;
  target: Rect;
  current: Rect;
  start: number;
  duration: number;
  done: boolean;
}

/** Matches the existing lightbox FLIP ease. */
export const EASE_SPATIAL = [0.22, 1, 0.36, 1] as const;

export const SPATIAL_DURATION = 360;

export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

export const interpolateRect = (prev: Rect, target: Rect, t: number): Rect => ({
  x: prev.x + (target.x - prev.x) * t,
  y: prev.y + (target.y - prev.y) * t,
  w: prev.w + (target.w - prev.w) * t,
  h: prev.h + (target.h - prev.h) * t,
});

export const makeGeometryState = (
  prev: Rect,
  target: Rect,
  now: number,
  duration = SPATIAL_DURATION
): GeometryState => ({
  prev,
  target,
  current: { ...prev },
  start: now,
  duration,
  done: false,
});

/** Advances a geometry state toward its target. Returns true when complete. */
export const advanceGeometry = (g: GeometryState, now: number): boolean => {
  if (g.done) return true;
  const elapsed = now - g.start;
  if (elapsed >= g.duration) {
    g.current = { ...g.target };
    g.done = true;
    return true;
  }
  const t = easeOutQuart(elapsed / g.duration);
  g.current = interpolateRect(g.prev, g.target, t);
  return false;
};
