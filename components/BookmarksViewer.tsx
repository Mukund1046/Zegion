"use client";

import Image from "next/image";
import { SquircleClip } from "@/components/ui/squircle-clip";
import SortPickerDial from "@/components/ui/sort-picker-dial";
import ProximitySidebar from "@/components/ui/proximity-sidebar";
import { useBookmarkViewer } from "@/hooks/useBookmarkViewer";
import type { FacetType, ViewMode } from "@/lib/types";

function ToolbarRegion({
  state,
  actions,
  helpers,
}: {
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
  helpers: ReturnType<typeof useBookmarkViewer>["helpers"];
}) {
  return (
    <div className="control-panel">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Image src={helpers.iconPath("bookmark-02")} alt="" width={16} height={16} unoptimized />
          </div>
          <div className="brand-copy">
            <span className="brand-title-row">
              <span className="brand-title">Kairos</span>
              <span className="brand-count">{state.allBookmarks.length}</span>
            </span>
          </div>
        </div>

        <div className="topbar-actions">
          <div
            className={`search-shell${state.activeSearch.trim() ? " has-text" : ""}`}
          >
            <Image
              className="ui-icon"
              src={helpers.iconPath("search-01")}
              alt=""
              aria-hidden="true"
              width={16} height={16} unoptimized
            />
            <input
              type="search"
              placeholder="Search bookmarks, authors, text..."
              autoComplete="off"
              value={state.activeSearch}
              onChange={(event) => actions.setActiveSearch(event.target.value)}
            />
            <SquircleClip asChild cornerRadius={6} cornerSmoothing={1}>
              <button
                className="search-clear"
                type="button"
                aria-label="Clear search"
                onClick={actions.clearSearch}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </SquircleClip>
            <div className="search-stats">{state.displayBookmarks.length} found</div>
          </div>
          <div className="sync-status" data-tone={state.syncStatusTone}>
            {state.syncStatusText}
          </div>
          <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
            <button
              className="action-pill"
              type="button"
              disabled={state.syncBusy || state.reindexBusy}
              onClick={() =>
                actions.runServerAction("/api/reindex", "Re-indexing…", "Index refreshed", false)
              }
            >
              <Image
                className="ui-icon"
                src={helpers.iconPath("arrow-reload-horizontal")}
                alt=""
                aria-hidden="true"
                width={16} height={16} unoptimized
              />
              <span className="action-pill-label">Re-index</span>
            </button>
          </SquircleClip>
          <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
            <button
              className="action-pill action-pill-primary"
              type="button"
              disabled={state.syncBusy || state.reindexBusy}
              onClick={() =>
                actions.runServerAction("/api/sync", "Syncing…", "Sync complete", true)
              }
            >
              <Image
                className="ui-icon"
                src={helpers.iconPath("database-sync")}
                alt=""
                aria-hidden="true"
                width={16} height={16} unoptimized
              />
              <span className="action-pill-label">Sync</span>
            </button>
          </SquircleClip>
          <div className="theme-toggle" role="radiogroup" aria-label="Theme">
            <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
              <button
                className="theme-opt theme-light"
                type="button"
                role="radio"
                aria-checked={!state.darkMode}
                aria-label="Light mode"
                onClick={() => actions.setDarkMode(false)}
              >
                <Image
                  className="ui-icon"
                  src={helpers.iconPath("sun-03")}
                  alt=""
                  aria-hidden="true"
                  width={16} height={16} unoptimized
                />
              </button>
            </SquircleClip>
            <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
              <button
                className="theme-opt theme-dark"
                type="button"
                role="radio"
                aria-checked={state.darkMode}
                aria-label="Dark mode"
                onClick={() => actions.setDarkMode(true)}
              >
                <Image
                  className="ui-icon"
                  src={helpers.iconPath("moon-02")}
                  alt=""
                  aria-hidden="true"
                  width={16} height={16} unoptimized
                />
              </button>
            </SquircleClip>
            <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
              <div
                className={`theme-slider ${state.darkMode ? "dark" : "light"}`}
                aria-hidden="true"
              />
            </SquircleClip>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-row">
          <div className="folder-tabs" role="tablist" aria-label="Bookmark folders">
            {state.folderOptions.map((name) => (
              <SquircleClip asChild cornerRadius={8} cornerSmoothing={1} key={name}>
                <button
                  type="button"
                  className="folder-tab"
                  role="tab"
                  aria-selected={name === state.activeFolder ? "true" : "false"}
                  onClick={() => actions.applyFilter(name)}
                >
                  {name}
                </button>
              </SquircleClip>
            ))}
          </div>
          <div className="toolbar-tools">
            <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
              <button
                className="icon-btn"
                type="button"
                aria-label="Toggle filters"
                aria-expanded={state.sidebarOpen}
                onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
              >
                <Image
                  className="ui-icon"
                  src={helpers.iconPath("filter-vertical")}
                  alt=""
                  aria-hidden="true"
                  width={16} height={16} unoptimized
                />
              </button>
            </SquircleClip>
            <div className="view-toggle" aria-label="Change layout view">
              <SquircleClip asChild cornerRadius={8} cornerSmoothing={1}>
                <button
                  type="button"
                  className={`view-toggle-btn${state.activeView === "media" ? " active" : ""}`}
                  onClick={() => actions.applyView("media" as ViewMode)}
                >
                  <Image
                    className="ui-icon"
                    src={helpers.iconPath("image-01")}
                    alt="Media view"
                    width={16} height={16} unoptimized
                  />
                </button>
              </SquircleClip>
              <SquircleClip asChild cornerRadius={8} cornerSmoothing={1}>
                <button
                  type="button"
                  className={`view-toggle-btn${state.activeView === "card" ? " active" : ""}`}
                  onClick={() => actions.applyView("card" as ViewMode)}
                >
                  <Image
                    className="ui-icon"
                    src={helpers.iconPath("cards-01")}
                    alt="Cards view"
                    width={16} height={16} unoptimized
                  />
                </button>
              </SquircleClip>
            </div>
            <SortPickerDial
              value={state.activeSort}
              onChange={(sort) => actions.setActiveSort(sort)}
            />
          </div>
        </div>

        <div className="toolbar-row-sub">
          <div className="status-copy">
            <strong>
              {state.displayBookmarks.length} {state.resultsNoun}
            </strong>
            <span>
              {state.facetLabel} • {state.searchLabel}
            </span>
          </div>
          <div className="assistive-copy">
            <span>Scroll</span>
            <span>Esc to close</span>
            <span>Media / Cards</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarRegion({
  state,
  actions,
  helpers,
}: {
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
  helpers: ReturnType<typeof useBookmarkViewer>["helpers"];
}) {
  return (
    <>
      <button
        className={`sidebar-backdrop${state.sidebarOpen ? " open" : ""}`}
        aria-label="Close sidebar"
        type="button"
        onClick={() => actions.setSidebarOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            actions.setSidebarOpen(false)
          }
        }}
      ></button>
      <aside
        className={`sidebar${state.sidebarOpen ? " open" : ""}`}
        aria-label="Bookmark classification filters"
      >
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <span className="sidebar-title">Browse</span>
            <span className="sidebar-subtitle">Folders, domains, authors, media</span>
          </div>
          <SquircleClip asChild cornerRadius={10} cornerSmoothing={1}>
            <button
              className="sidebar-close"
              type="button"
              aria-label="Close filters"
              onClick={() => actions.setSidebarOpen(false)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </SquircleClip>
        </div>
        <div className="sidebar-filters">
          {state.sidebarSections.map((section, sectionIndex) => {
            const expanded =
              state.expandedSections[section.title] ?? sectionIndex === 0;
            return (
              <section key={section.title} className="sidebar-section" data-section={section.title}>
                <SquircleClip asChild cornerRadius={9} cornerSmoothing={1}>
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    aria-expanded={expanded}
                    onClick={() => actions.toggleSection(section.title)}
                  >
                  <h3 className="sidebar-section-title">{section.title}</h3>
                  <Image
                    className="ui-icon sidebar-section-chevron"
                    src={helpers.iconPath("arrow-down-01")}
                    alt=""
                    width={16} height={16} unoptimized
                  />
                </button>
                </SquircleClip>
                <div
                  className={`sidebar-chip-list${expanded ? "" : " collapsed"}`}
                  style={{ display: expanded ? "flex" : "none" }}
                >
                  {section.items.map((item) => {
                    const active =
                      item.type === state.activeFacetType &&
                      item.value === state.activeFacetValue;
                    return (
                      <SquircleClip asChild cornerRadius={8} cornerSmoothing={1} key={`${item.type}-${item.value}`}>
                        <button
                          type="button"
                          className={`sidebar-filter-btn${active ? " active" : ""}`}
                          onClick={() =>
                            actions.applyFacet(item.type as FacetType, item.value)
                          }
                        >
                          <span className="sidebar-filter-label">{item.value}</span>
                          <span className="sidebar-filter-count">{item.count}</span>
                        </button>
                      </SquircleClip>
                    );
                  })}
              </div>
              </section>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function FeedRegion({
  refs,
  state,
  scrubberAnchors,
  scrubberSections,
  onProximitySelect,
}: {
  refs: ReturnType<typeof useBookmarkViewer>["refs"];
  state: ReturnType<typeof useBookmarkViewer>["state"];
  scrubberAnchors: { id: string; top: number }[];
  scrubberSections: { id: string; label: string; kind: "section" }[];
  onProximitySelect: (id: string) => void;
}) {
  return (
    <div ref={refs.feedShellRef} className="feed-shell">
      <main
        ref={refs.viewportRef}
        id="viewport"
        className={`viewport${state.feedMode ? " feed-mode" : ""}`}
        aria-label="Bookmarks feed"
      >
        <div
          ref={refs.containerRef}
          id="container"
          style={
            state.containerHeight
              ? { height: `${state.containerHeight}px` }
              : undefined
          }
        >
          {scrubberAnchors.map((anchor) => (
            <div
              key={anchor.id}
              id={anchor.id}
              className="scrubber-anchor"
              style={{ top: `${anchor.top}px` }}
              aria-hidden="true"
            />
          ))}
          <div
            ref={refs.gridRef}
            id="grid"
            style={{
              opacity: state.gridOpacity,
              width: state.gridWidth ? `${state.gridWidth}px` : undefined,
              height: state.gridHeight ? `${state.gridHeight}px` : undefined,
            }}
          />
        </div>
      </main>
      <aside
        ref={refs.scrubberRef}
        className={`scrubber${state.scrubberVisible ? " visible" : ""}${
          state.scrubberActive ? " active" : ""
        } proximity-scrubber`}
        aria-label="Feed navigation"
        style={{
          top: `${state.scrubberFrame.top}px`,
          height: `${state.scrubberFrame.height}px`,
        }}
      >
        {scrubberSections.length > 1 ? (
          <ProximitySidebar
            className="proximity-sidebar-shell"
            onSelectSection={onProximitySelect}
            sections={scrubberSections}
            side="right"
          />
        ) : null}
      </aside>
    </div>
  );
}

function LightboxOverlay({
  refs,
  state,
  actions,
}: {
  refs: ReturnType<typeof useBookmarkViewer>["refs"];
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
}) {
  return (
    <div
      ref={refs.overlayRef}
      className={`lightbox-overlay${state.lightboxOpen ? " active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Lightbox"
      onClick={(event) => {
        if (event.target === refs.overlayRef.current) actions.closeLightbox();
      }}
    >
      <SquircleClip asChild cornerRadius={12} cornerSmoothing={1}>
        <button
          type="button"
          className="lightbox-close"
          aria-label="Close"
          onClick={(event) => {
            event.stopPropagation();
            actions.closeLightbox();
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </SquircleClip>
      <div ref={refs.lightboxInfoRef} className="lightbox-info">
        <h2 className="lightbox-title">{state.lightboxTitle}</h2>
        <a
          className="lightbox-link"
          href={state.lightboxLinkHref}
          target="_blank"
          rel="noopener"
        >
          {state.lightboxLinkText}
        </a>
        <div className="lightbox-meta">{state.lightboxMeta}</div>
      </div>
    </div>
  );
}

export default function BookmarksViewer() {
  const { refs, state, actions, helpers } = useBookmarkViewer();
  const scrubberSections = state.scrubberAnchors.map((anchor) => ({
    id: anchor.id,
    label: anchor.label,
    kind: "section" as const,
  }));
  const handleProximitySelect = (id: string) => {
    const targetIndex = state.scrubberAnchors.findIndex((anchor) => anchor.id === id);
    if (targetIndex >= 0) {
      actions.jumpToScrubberMarker(targetIndex);
    }
  };

  return (
    <div className="app-shell">
      <section className="content-shell">
        <ToolbarRegion state={state} actions={actions} helpers={helpers} />
        <div className="workspace-shell">
          <SidebarRegion state={state} actions={actions} helpers={helpers} />
          <FeedRegion
            refs={refs}
            state={state}
            scrubberAnchors={state.scrubberAnchors}
            scrubberSections={scrubberSections}
            onProximitySelect={handleProximitySelect}
          />
        </div>
      </section>
      <LightboxOverlay refs={refs} state={state} actions={actions} />
    </div>
  );
}
