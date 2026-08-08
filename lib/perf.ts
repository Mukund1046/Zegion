interface Span {
  trigger: string;
  label: string;
  ms: number;
  t: number;
}

interface FrameSample {
  trigger: string;
  t: number;
  dt: number;
  active: number;
  layoutItems: number;
}

const SPANS_MAX = 3000;
const FRAMES_MAX = 1200;

const quantile = (arr: number[], q: number): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(q * (sorted.length - 1)))
  );
  return sorted[idx];
};

/**
 * Minimal, zero-dependency frame-time profiler for the bookmark viewer.
 * Everything is guarded by a single `enabled` flag, so disabled mode adds no
 * meaningful overhead. Enable with `?profile` in the URL or Shift+P at
 * runtime; a small HUD shows live stats and `window.__kairosPerf` exposes the
 * ring buffer + `summary()` for DevTools capture.
 */
class Perf {
  private enabledFlag = false;
  private spans: Span[] = [];
  private frames: FrameSample[] = [];
  private counters = new Map<string, number>();
  private pending: { trigger: string; label: string; start: number }[] = [];
  private hud: HTMLDivElement | null = null;
  private hudRaf = 0;
  private lastHudUpdate = 0;

  get enabled(): boolean {
    return this.enabledFlag;
  }

  enable(): void {
    if (this.enabledFlag) return;
    this.enabledFlag = true;
    this.createHud();
  }

  disable(): void {
    if (!this.enabledFlag) return;
    this.enabledFlag = false;
    this.spans.length = 0;
    this.frames.length = 0;
    this.counters.clear();
    this.pending.length = 0;
    this.destroyHud();
  }

  toggle(): void {
    if (this.enabledFlag) this.disable();
    else this.enable();
  }

  begin(trigger: string, label: string): void {
    if (!this.enabledFlag) return;
    this.pending.push({ trigger, label, start: performance.now() });
  }

  end(trigger: string, label: string): void {
    if (!this.enabledFlag) return;
    const idx = this.pending.length - 1;
    if (idx < 0) return;
    const entry = this.pending[idx];
    if (entry.label !== label) return;
    this.pending.length = idx;
    this.record(trigger, label, performance.now() - entry.start);
  }

  time<T>(trigger: string, label: string, fn: () => T): T {
    if (!this.enabledFlag) return fn();
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.record(trigger, label, performance.now() - start);
    }
  }

  count(label: string, n = 1): void {
    if (!this.enabledFlag) return;
    this.counters.set(label, (this.counters.get(label) || 0) + n);
  }

  frame(trigger: string, active: number, layoutItems: number, dt: number): void {
    if (!this.enabledFlag) return;
    this.frames.push({ trigger, t: performance.now(), dt, active, layoutItems });
    if (this.frames.length > FRAMES_MAX) {
      this.frames.splice(0, this.frames.length - FRAMES_MAX);
    }
  }

  summary(): {
    spans: Record<
      string,
      { count: number; total: number; min: number; max: number; p50: number; p95: number }
    >;
    frames: { count: number; p50: number; p95: number; max: number };
    counters: Record<string, number>;
  } {
    const byLabel = new Map<string, number[]>();
    for (const span of this.spans) {
      const arr = byLabel.get(span.label);
      if (arr) arr.push(span.ms);
      else byLabel.set(span.label, [span.ms]);
    }
    const spans: Record<
      string,
      { count: number; total: number; min: number; max: number; p50: number; p95: number }
    > = {};
    for (const [label, arr] of byLabel) {
      spans[label] = {
        count: arr.length,
        total: arr.reduce((a, b) => a + b, 0),
        min: Math.min(...arr),
        max: Math.max(...arr),
        p50: quantile(arr, 0.5),
        p95: quantile(arr, 0.95),
      };
    }
    const frameDts = this.frames.map((f) => f.dt);
    return {
      spans,
      frames: frameDts.length
        ? {
            count: frameDts.length,
            p50: quantile(frameDts, 0.5),
            p95: quantile(frameDts, 0.95),
            max: Math.max(...frameDts),
          }
        : { count: 0, p50: 0, p95: 0, max: 0 },
      counters: Object.fromEntries(this.counters),
    };
  }

  private record(trigger: string, label: string, ms: number): void {
    this.spans.push({ trigger, label, ms, t: performance.now() });
    if (this.spans.length > SPANS_MAX) {
      this.spans.splice(0, this.spans.length - SPANS_MAX);
    }
  }

  private createHud(): void {
    if (typeof document === "undefined") return;
    if (this.hud) return;
    const hud = document.createElement("div");
    hud.id = "kairos-perf-hud";
    hud.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:99999",
      "background:rgba(10,10,12,0.92)",
      "color:#9be9c8",
      "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
      "padding:8px 10px",
      "border-radius:8px",
      "border:1px solid rgba(255,255,255,0.12)",
      "white-space:pre",
      "pointer-events:none",
      "box-shadow:0 4px 20px rgba(0,0,0,0.5)",
    ].join(";");
    document.body.appendChild(hud);
    this.hud = hud;
    this.lastHudUpdate = 0;
    const tick = () => {
      if (!this.enabledFlag || !this.hud) return;
      const now = performance.now();
      if (now - this.lastHudUpdate >= 250) {
        this.lastHudUpdate = now;
        this.hud.textContent = this.hudText();
      }
      this.hudRaf = requestAnimationFrame(tick);
    };
    this.hudRaf = requestAnimationFrame(tick);
  }

  private destroyHud(): void {
    if (this.hudRaf) cancelAnimationFrame(this.hudRaf);
    this.hudRaf = 0;
    if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud);
    this.hud = null;
  }

  private hudText(): string {
    const s = this.summary();
    const fps = s.frames.p50 > 0 ? Math.round(1000 / s.frames.p50) : 0;
    const lines = [
      "kairos perf ON",
      `frame  p50 ${s.frames.p50.toFixed(1)}  p95 ${s.frames.p95.toFixed(1)}  max ${s.frames.max.toFixed(1)} ms  (~${fps}fps)`,
    ];
    for (const label of ["layout", "retarget", "filter:compute", "rebuild:total", "zoom:rebuild", "rebuild:viewportMode", "rebuild:scrubber", "rebuild:state", "rebuild:transition", "rebuild:render", "render:pool", "render:evict", "content:image", "content:body", "tick:spring", "render:visible", "camera:tick", "cull:visible", "grid:solve", "settle:morph", "frame:render", "frame:total"]) {
      const st = s.spans[label];
      if (st && st.count > 0) {
        lines.push(
          `${label.padEnd(14)} n${st.count}  p95 ${st.p95.toFixed(1)}  max ${st.max.toFixed(1)} ms`
        );
      }
    }
    for (const [label, n] of Object.entries(s.counters)) {
      lines.push(`#${label} ${n}`);
    }
    return lines.join("\n");
  }
}

export const kairosPerf = new Perf();

if (typeof window !== "undefined") {
  try {
    (window as unknown as { __kairosPerf: Perf }).__kairosPerf = kairosPerf;
    if (new URLSearchParams(window.location.search).has("profile")) kairosPerf.enable();
  } catch {
    /* ignore */
  }
}

export default kairosPerf;
