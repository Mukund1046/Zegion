"use client";

import { useSpatialViewer } from "@/hooks/useSpatialViewer";

export default function SpatialViewer() {
  const { refs, state, actions } = useSpatialViewer();

  return (
    <div className="spatial-shell">
      <header className="spatial-toolbar">
        <span className="spatial-title">Spatial renderer prototype</span>
        <div className="spatial-controls">
          <button
            type="button"
            className="spatial-btn"
            aria-label="Zoom out"
            onClick={() => actions.zoomBy(-1)}
          >
            −
          </button>
          <span className="spatial-zoom">{state.zoomPercent}%</span>
          <button
            type="button"
            className="spatial-btn"
            aria-label="Zoom in"
            onClick={() => actions.zoomBy(1)}
          >
            +
          </button>
          <span className="spatial-divider" />
          <button
            type="button"
            className="spatial-btn"
            aria-label="Fit entire world in view"
            onClick={actions.fitWorld}
          >
            Fit
          </button>
          <button
            type="button"
            className="spatial-btn"
            aria-label="Zoom to 1:1"
            onClick={actions.detailZoom}
          >
            1:1
          </button>
          <button
            type="button"
            className="spatial-btn"
            aria-label="Reset zoom"
            onClick={actions.resetZoom}
          >
            Reset
          </button>
        </div>
        <span className="spatial-count">{state.loaded ? `${state.count} bookmarks` : "Loading…"}</span>
      </header>
      <main
        ref={refs.viewportRef}
        className={`spatial-viewport${state.dragging ? " dragging" : ""}`}
        aria-label="Spatial bookmarks"
      >
        <div ref={refs.worldRef} className="spatial-world" />
        <div ref={refs.minimapRef} className="spatial-minimap" aria-hidden="true">
          <div ref={refs.minimapWorldRef} className="spatial-minimap-world">
            <div ref={refs.minimapViewportRef} className="spatial-minimap-viewport" />
          </div>
        </div>
      </main>
      <footer className="spatial-hint">
        Scroll — pan · Ctrl+Scroll — zoom · Drag — pan
      </footer>
    </div>
  );
}
