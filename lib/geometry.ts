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
  velocity: { x: number; y: number; w: number; h: number };
  start: number;
  duration: number;
  done: boolean;
}

/** Matches the existing lightbox FLIP ease. */
export const EASE_SPATIAL = [0.22, 1, 0.36, 1] as const;

export const SPATIAL_DURATION = 360;

/**
 * Critically damped spring (zeta = 1) used for feed layout transitions.
 * Tuned so a single step settles in ~220-260ms with zero overshoot, while
 * retargets preserve the current value and velocity instead of restarting.
 */
export const SPRING_OMEGA = 27; // rad/s

export const SPRING_EPSILON_POS = 0.5; // px
export const SPRING_EPSILON_VEL = 0.05; // px/ms

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
  velocity: { x: 0, y: 0, w: 0, h: 0 },
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

const advanceAxis = (
  pos: number,
  vel: number,
  target: number,
  dt: number,
  omega: number
): [number, number] => {
  const accel = -omega * omega * (pos - target) - 2 * omega * vel;
  const nextVel = vel + accel * dt;
  const nextPos = pos + nextVel * dt;
  return [nextPos, nextVel];
};

/** Max integration step (ms). Semi-implicit Euler diverges for dt*omega > ~0.8. */
const SPRING_MAX_STEP = 16;

/**
 * Advances a geometry state with a critically damped spring over dt (ms).
 * Retargeting only needs to update `target`; current position and velocity
 * carry through, so rapid input glides instead of restarting from rest.
 *
 * Long frame gaps (a dropped frame, GC, a heavy rebuild) can push dt past the
 * integrator's stability limit, so the step is subdivided; each substep stays
 * well below the divergence threshold regardless of how long the stall was.
 */
export const advanceSpring = (g: GeometryState, dt: number): boolean => {
  if (g.done) return true;
  const omega = SPRING_OMEGA / 1000;
  const axes = ["x", "y", "w", "h"] as const;
  let remaining = dt;
  while (remaining > 0) {
    const step = Math.min(remaining, SPRING_MAX_STEP);
    for (const axis of axes) {
      const [pos, vel] = advanceAxis(
        g.current[axis],
        g.velocity[axis],
        g.target[axis],
        step,
        omega
      );
      g.current[axis] = pos;
      g.velocity[axis] = vel;
    }
    remaining -= step;
  }
  let settled = true;
  for (const axis of axes) {
    if (
      Math.abs(g.current[axis] - g.target[axis]) > SPRING_EPSILON_POS ||
      Math.abs(g.velocity[axis]) > SPRING_EPSILON_VEL
    ) {
      settled = false;
    }
  }
  if (settled) {
    g.current = { ...g.target };
    g.done = true;
  }
  return g.done;
};
