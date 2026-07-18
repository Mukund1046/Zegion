"use client";

import ProximitySidebar from "@/components/ui/proximity-sidebar";
import { useBookmarkViewer } from "@/hooks/useBookmarkViewer";
import type { FacetType, SortMode, ViewMode } from "@/lib/types";

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
        <div className="control-panel">
          <div className="topbar">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                <img src={helpers.iconPath("bookmark-02")} alt="" />
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
                <img
                  className="ui-icon"
                  src={helpers.iconPath("search-01")}
                  alt=""
                  aria-hidden="true"
                />
                <input
                  type="search"
                  placeholder="Search bookmarks, authors, text..."
                  autoComplete="off"
                  value={state.activeSearch}
                  onChange={(event) => actions.setActiveSearch(event.target.value)}
                />
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
                <div className="search-stats">{state.displayBookmarks.length} found</div>
              </div>
              <div className="sync-status" data-tone={state.syncStatusTone}>
                {state.syncStatusText}
              </div>
              <button
                className="action-pill"
                type="button"
                disabled={state.syncBusy || state.reindexBusy}
                onClick={() =>
                  actions.runServerAction("/api/reindex", "Re-indexing…", "Index refreshed", false)
                }
              >
                <img
                  className="ui-icon"
                  src={helpers.iconPath("arrow-reload-horizontal")}
                  alt=""
                  aria-hidden="true"
                />
                <span className="action-pill-label">Re-index</span>
              </button>
              <button
                className="action-pill action-pill-primary"
                type="button"
                disabled={state.syncBusy || state.reindexBusy}
                onClick={() =>
                  actions.runServerAction("/api/sync", "Syncing…", "Sync complete", true)
                }
              >
                <img
                  className="ui-icon"
                  src={helpers.iconPath("database-sync")}
                  alt=""
                  aria-hidden="true"
                />
                <span className="action-pill-label">Sync</span>
              </button>
              <div className="theme-toggle" role="radiogroup" aria-label="Theme">
                <button
                  className="theme-opt theme-light"
                  type="button"
                  role="radio"
                  aria-checked={!state.darkMode}
                  aria-label="Light mode"
                  onClick={() => actions.setDarkMode(false)}
                >
                  <img
                    className="ui-icon"
                    src={helpers.iconPath("sun-03")}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                <button
                  className="theme-opt theme-dark"
                  type="button"
                  role="radio"
                  aria-checked={state.darkMode}
                  aria-label="Dark mode"
                  onClick={() => actions.setDarkMode(true)}
                >
                  <img
                    className="ui-icon"
                    src={helpers.iconPath("moon-02")}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                <div
                  className={`theme-slider ${state.darkMode ? "dark" : "light"}`}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-row">
              <div className="folder-tabs" role="tablist" aria-label="Bookmark folders">
                {state.folderOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="folder-tab"
                    role="tab"
                    aria-selected={name === state.activeFolder ? "true" : "false"}
                    onClick={() => actions.applyFilter(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="toolbar-tools">
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Toggle filters"
                  aria-expanded={state.sidebarOpen}
                  onClick={() => actions.setSidebarOpen(!state.sidebarOpen)}
                >
                  <img
                    className="ui-icon"
                    src={helpers.iconPath("filter-vertical")}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                <div className="view-toggle" aria-label="Change layout view">
                  <button
                    type="button"
                    className={`view-toggle-btn${state.activeView === "media" ? " active" : ""}`}
                    onClick={() => actions.applyView("media" as ViewMode)}
                  >
                    <img
                      className="ui-icon"
                      src={helpers.iconPath("image-01")}
                      alt="Media view"
                    />
                  </button>
                  <button
                    type="button"
                    className={`view-toggle-btn${state.activeView === "card" ? " active" : ""}`}
                    onClick={() => actions.applyView("card" as ViewMode)}
                  >
                    <img
                      className="ui-icon"
                      src={helpers.iconPath("cards-01")}
                      alt="Cards view"
                    />
                  </button>
                </div>
                <div className={`sort-menu${state.sortMenuOpen ? " open" : ""}`}>
                  <button
                    className="sort-trigger"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={state.sortMenuOpen}
                    aria-label="Sort bookmarks"
                    onClick={() => actions.setSortMenuOpen(!state.sortMenuOpen)}
                  >
                    <img
                      className="ui-icon sort-trigger-icon"
                      src={helpers.iconPath(helpers.sortIcons[state.activeSort])}
                      alt=""
                      aria-hidden="true"
                    />
                    <span>{helpers.getSortLabel(state.activeSort)}</span>
                    <img
                      className="ui-icon sort-chevron"
                      src={helpers.iconPath("arrow-down-01")}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  <div className="sort-dropdown" role="listbox" aria-label="Sort bookmarks">
                    {(["recent", "oldest", "liked"] as SortMode[]).map((sort) => (
                      <button
                        key={sort}
                        type="button"
                        className={`sort-option${state.activeSort === sort ? " active" : ""}`}
                        role="option"
                        aria-selected={state.activeSort === sort}
                        onClick={() => {
                          actions.setActiveSort(sort);
                          actions.setSortMenuOpen(false);
                        }}
                      >
                        <img
                          className="ui-icon sort-option-icon"
                          src={helpers.iconPath(helpers.sortIcons[sort])}
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="sort-option-label">{helpers.getSortLabel(sort)}</span>
                        <img
                          className="ui-icon sort-option-check"
                          src={helpers.iconPath("checkmark-circle-01")}
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </div>
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

        <div className="workspace-shell">
          <div
            className={`sidebar-backdrop${state.sidebarOpen ? " open" : ""}`}
            onClick={() => actions.setSidebarOpen(false)}
          />
          <aside
            className={`sidebar${state.sidebarOpen ? " open" : ""}`}
            aria-label="Bookmark classification filters"
          >
            <div className="sidebar-header">
              <div className="sidebar-header-left">
                <span className="sidebar-title">Browse</span>
                <span className="sidebar-subtitle">Folders, domains, authors, media</span>
              </div>
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
            </div>
            <div className="sidebar-filters">
              {state.sidebarSections.map((section, sectionIndex) => {
                const expanded =
                  state.expandedSections[section.title] ?? sectionIndex === 0;
                return (
                  <section key={section.title} className="sidebar-section" data-section={section.title}>
                    <button
                      type="button"
                      className="sidebar-section-toggle"
                      aria-expanded={expanded}
                      onClick={() => actions.toggleSection(section.title)}
                    >
                      <h3 className="sidebar-section-title">{section.title}</h3>
                      <img
                        className="ui-icon sidebar-section-chevron"
                        src={helpers.iconPath("arrow-down-01")}
                        alt=""
                      />
                    </button>
                    <div
                      className={`sidebar-chip-list${expanded ? "" : " collapsed"}`}
                      style={{ display: expanded ? "flex" : "none" }}
                    >
                      {section.items.map((item) => {
                        const active =
                          item.type === state.activeFacetType &&
                          item.value === state.activeFacetValue;
                        return (
                          <button
                            key={`${item.type}-${item.value}`}
                            type="button"
                            className={`sidebar-filter-btn${active ? " active" : ""}`}
                            onClick={() =>
                              actions.applyFacet(item.type as FacetType, item.value)
                            }
                          >
                            <span className="sidebar-filter-label">{item.value}</span>
                            <span className="sidebar-filter-count">{item.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </aside>

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
                {state.scrubberAnchors.map((anchor) => (
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
                  onSelectSection={handleProximitySelect}
                  sections={scrubberSections}
                  side="right"
                />
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      <div
        ref={refs.overlayRef}
        className={`lightbox-overlay${state.lightboxOpen ? " active" : ""}`}
        onClick={(event) => {
          if (event.target === refs.overlayRef.current) actions.closeLightbox();
        }}
      >
        <button
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
    </div>
  );
}
