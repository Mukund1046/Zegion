"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { SquircleClip } from "@/components/ui/squircle-clip";
import SortPickerDial from "@/components/ui/sort-picker-dial";
import { SmoothInput } from "@/components/ui/skiper-ui/skiper106";
import ShineText from "@/components/ui/smoothui/shine-text";
import { ThinkingOrb } from "thinking-orbs";
import { useBookmarkViewer } from "@/hooks/useBookmarkViewer";
import type { FacetType, ViewMode } from "@/lib/types";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/animate-ui/components/radix/popover'
import { useDialKit } from "dialkit";
import { Badge } from "@/components/reui/badge";
import SyncSettingsDialog from "@/components/ui/sync-settings-dialog";
import { apiFetch } from "@/lib/client-api";

import { HugeiconsIcon } from '@hugeicons/react'
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Search01Icon,
  Cancel01Icon,
  CommandIcon,
  EllipsisIcon,
} from '@hugeicons/core-free-icons'
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import type { Bookmark } from "@/lib/types";

function ToolbarRegion({
  state,
  actions,
  helpers,
  onSearchOpenChange,
}: {
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
  helpers: ReturnType<typeof useBookmarkViewer>["helpers"];
  onSearchOpenChange: (open: boolean) => void;
}) {
  const btnParams = useDialKit("Search Button", {
    bgColor: { type: "color", default: "#f4f4f9" },
    darkBgColor: { type: "color", default: "#181818" },
    strokeColor: { type: "color", default: "var(--border)" },
    borderRadius: [12, 0, 32, 1],
    gap: [8, 0, 32, 1],
    minWidth: [200, 80, 600, 10],
    paddingX: [8, 4, 32, 1],
    paddingY: [4, 0, 20, 1],
    borderWidth: [0, 0, 4, 0.5],
    statsSize: [24, 12, 32, 1],
    statsFontSize: [10, 7, 16, 1],
    statsBorderRadius: [8, 0, 20, 1],
    statsPaddingX: [2, 0, 16, 1],
    statsPaddingY: [2, 0, 12, 1],
    kbdPaddingX: [6, 0, 20, 1],
    kbdPaddingY: [4, 0, 12, 1],
    kbdBorderRadius: [6, 0, 20, 1],
    kbdBg: { type: "color", default: "var(--muted)" },
    kbdBgDark: { type: "color", default: "#262626" },
  });

  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false);
  const [cookieLabel, setCookieLabel] = useState("");

  useEffect(() => {
    if (!syncSettingsOpen) {
      apiFetch("/api/cookies")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d) return;
          const m = d.cookieMode;
          if (m === "auto:firefox") setCookieLabel("(auto: Firefox)");
          else if (m === "auto:edge") setCookieLabel("(auto: Edge)");
          else if (m === "auto:chrome") setCookieLabel("(auto: Chrome)");
          else if (m === "auto:brave") setCookieLabel("(auto: Brave)");
          else if (m === "manual-runtime") setCookieLabel("(manual)");
          else if (m === "manual-firefox") setCookieLabel("(env)");
          else setCookieLabel("");
        })
        .catch(() => {});
    }
  }, [syncSettingsOpen]);

  const moreParams = useDialKit("More Popover", {
    popoverPaddingX: [4, 0, 24, 1],
    popoverPaddingY: [4, 0, 24, 1],
    hoverPaddingX: [8, 0, 24, 1],
    hoverPaddingY: [6, 0, 20, 1],
    itemGap: [4, 0, 12, 1],
    hoverColor: { type: "color", default: "var(--muted)" },
    hoverColorDark: { type: "color", default: "var(--muted)" },
    hoverBorderRadius: [6, 0, 20, 1],
    popoverBg: { type: "color", default: "var(--popover)" },
    dividerColor: { type: "color", default: "#f4f4f9" },
    dividerColorDark: { type: "color", default: "#262626" },
    popoverFontSize: [12, 10, 24, 1],
    popoverIconSize: [12, 12, 32, 1],
  });

  return (
    <div className="control-panel">
      <div className="toolbar">
        <div className="toolbar-row">
          <div className="toolbar-left">
            <div className="brand" onClick={() => actions.resetFilters()} onKeyDown={(e) => { if (e.key === 'Enter') actions.resetFilters(); }} tabIndex={0} role="button" aria-label="Reset all filters">
              <div className="brand-mark" aria-hidden="true">
                <Image
                  src={state.darkMode ? "/Zegion_white.svg" : "/Zegion_Dark.svg"}
                  alt=""
                  width={36}
                  height={28}
                  unoptimized
                  style={{ display: "block" }}
                />
              </div>
              <div className="brand-copy">
                <span className="brand-title-row">
                  <span className="brand-title" style={{ fontFamily: "var(--font-faculty-glyphic)" }}>Zegion</span>
                  <span className="brand-count">{state.allBookmarks.length}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="toolbar-center">
            <SquircleClip
              asChild
              cornerRadius={btnParams.borderRadius as number}
              cornerSmoothing={1}
              stroke={btnParams.strokeColor}
              strokeWidth={btnParams.borderWidth as number}
            >
              <motion.button
                className="action-pill"
                type="button"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                onClick={() => onSearchOpenChange(true)}
                style={{
                  minWidth: state.activeSearch ? (btnParams.minWidth as number) : undefined,
                  gap: btnParams.gap as number,
                  paddingLeft: btnParams.paddingX as number,
                  paddingRight: btnParams.paddingX as number,
                  paddingTop: btnParams.paddingY as number,
                  paddingBottom: btnParams.paddingY as number,
                  background: state.darkMode ? (btnParams.darkBgColor as string) : (btnParams.bgColor as string),
                }}
              >
                <HugeiconsIcon icon={Search01Icon} size={16} className="shrink-0 opacity-50" />
                {state.activeSearch ? (
                  <span className="flex-1 text-left text-sm font-normal text-foreground truncate">{state.activeSearch}</span>
                ) : null}
                {state.activeSearch ? (
                  <>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Clear search"
                      className="flex cursor-pointer items-center justify-center bg-muted-foreground/10 text-muted-foreground transition-colors hover:bg-muted-foreground/20"
                      style={{
                        minWidth: btnParams.statsSize as number,
                        minHeight: btnParams.statsSize as number,
                        paddingLeft: btnParams.statsPaddingX as number,
                        paddingRight: btnParams.statsPaddingX as number,
                        paddingTop: btnParams.statsPaddingY as number,
                        paddingBottom: btnParams.statsPaddingY as number,
                        borderRadius: btnParams.statsBorderRadius as number,
                      }}
                      onClick={(e) => { e.stopPropagation(); actions.setActiveSearch("", true); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          actions.setActiveSearch("", true);
                        }
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} />
                    </span>
                    <span
                      className="flex items-center justify-center bg-muted-foreground/10 font-semibold text-muted-foreground"
                      style={{
                        minWidth: btnParams.statsSize as number,
                        minHeight: btnParams.statsSize as number,
                        fontSize: btnParams.statsFontSize as number,
                        paddingLeft: btnParams.statsPaddingX as number,
                        paddingRight: btnParams.statsPaddingX as number,
                        paddingTop: btnParams.statsPaddingY as number,
                        paddingBottom: btnParams.statsPaddingY as number,
                        borderRadius: btnParams.statsBorderRadius as number,
                      }}
                    >
                      {state.displayBookmarks.length}
                    </span>
                  </>
                ) : (
                  <kbd
                    className="inline-flex items-center gap-1 border border-border text-[10px] font-medium leading-none text-muted-foreground/60"
                    style={{
                      paddingLeft: btnParams.kbdPaddingX as number,
                      paddingRight: btnParams.kbdPaddingX as number,
                      paddingTop: btnParams.kbdPaddingY as number,
                      paddingBottom: btnParams.kbdPaddingY as number,
                      borderRadius: btnParams.kbdBorderRadius as number,
                      background: state.darkMode ? (btnParams.kbdBgDark as string) : (btnParams.kbdBg as string),
                    }}
                  >
                    <HugeiconsIcon icon={CommandIcon} size={12} />
                    K
                  </kbd>
                )}
              </motion.button>
            </SquircleClip>
          </div>
          <div className="toolbar-right">
            <div className="sync-status" data-tone={state.syncStatusTone}>
              <AnimatePresence mode="popLayout">
                {(state.syncBusy || state.reindexBusy) && (
                  <motion.span
                    key="orb"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    <ThinkingOrb state="composing" size={20} aria-label="Working" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <motion.button
                  className="action-pill"
                  type="button"
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.5 }}
                >
                  <HugeiconsIcon icon={EllipsisIcon} size={16} className="opacity-50" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-44 border border-border shadow-lg"
                style={{
                  borderRadius: 9,
                  padding: `${moreParams.popoverPaddingY as number}px ${moreParams.popoverPaddingX as number}px`,
                  background: moreParams.popoverBg as string,
                }}
              >
                <div className="flex flex-col" style={{ gap: moreParams.itemGap as number }}>
                  <div
                    className="flex w-full items-center gap-2 text-xs font-normal text-muted-foreground"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                    }}
                  >
                    {state.syncStatusTone === "working" ? (
                      <span className="truncate min-w-0">
                        <ShineText
                          duration={2}
                          repeatDelay={0.4}
                          baseColor="var(--color-muted-foreground)"
                          shineColor="var(--color-foreground)"
                        >
                          {state.syncStatusText}
                        </ShineText>
                      </span>
                    ) : (
                      <span className="truncate min-w-0">{state.syncStatusText}{cookieLabel ? <span className="ml-1 shrink-0 opacity-60">{cookieLabel}</span> : null}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-progress"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                      borderRadius: moreParams.hoverBorderRadius as number,
                      background: "transparent",
                      fontSize: moreParams.popoverFontSize as number,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = state.darkMode
                        ? (moreParams.hoverColorDark as string)
                        : (moreParams.hoverColor as string)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
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
                      width={moreParams.popoverIconSize as number}
                      height={moreParams.popoverIconSize as number}
                      unoptimized
                    />
                    Re-index
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-progress"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                      borderRadius: moreParams.hoverBorderRadius as number,
                      background: "transparent",
                      fontSize: moreParams.popoverFontSize as number,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = state.darkMode
                        ? (moreParams.hoverColorDark as string)
                        : (moreParams.hoverColor as string)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
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
                      width={moreParams.popoverIconSize as number}
                      height={moreParams.popoverIconSize as number}
                      unoptimized
                    />
                    Sync
                  </button>
                  <div className="border-t my-1 mx-2" style={{ borderColor: state.darkMode ? moreParams.dividerColorDark as string : moreParams.dividerColor as string }} />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 font-medium transition-colors"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                      borderRadius: moreParams.hoverBorderRadius as number,
                      background: "transparent",
                      fontSize: moreParams.popoverFontSize as number,
                      color: "var(--foreground)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = state.darkMode
                        ? (moreParams.hoverColorDark as string)
                        : (moreParams.hoverColor as string)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                    onClick={() => setSyncSettingsOpen(true)}
                  >
                    <svg width={moreParams.popoverIconSize as number} height={moreParams.popoverIconSize as number} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    </svg>
                    Sync Settings
                  </button>
                  <div className="border-t my-1 mx-2" style={{ borderColor: state.darkMode ? moreParams.dividerColorDark as string : moreParams.dividerColor as string }} />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-progress"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                      borderRadius: moreParams.hoverBorderRadius as number,
                      background: "transparent",
                      fontSize: moreParams.popoverFontSize as number,
                      color: "var(--foreground)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = state.darkMode
                        ? (moreParams.hoverColorDark as string)
                        : (moreParams.hoverColor as string)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                    onClick={() => actions.setDarkMode(false)}
                  >
                    <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {!state.darkMode && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--foreground)", flexShrink: 0 }} />}
                    </span>
                    <Image
                      className="ui-icon"
                      src={helpers.iconPath("sun-03")}
                      alt=""
                      aria-hidden="true"
                      width={moreParams.popoverIconSize as number}
                      height={moreParams.popoverIconSize as number}
                      unoptimized
                    />
                    Light mode
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-progress"
                    style={{
                      padding: `${moreParams.hoverPaddingY as number}px ${moreParams.hoverPaddingX as number}px`,
                      borderRadius: moreParams.hoverBorderRadius as number,
                      background: "transparent",
                      fontSize: moreParams.popoverFontSize as number,
                      color: "var(--foreground)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = state.darkMode
                        ? (moreParams.hoverColorDark as string)
                        : (moreParams.hoverColor as string)
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                    onClick={() => actions.setDarkMode(true)}
                  >
                    <span style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {state.darkMode && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--foreground)", flexShrink: 0 }} />}
                    </span>
                    <Image
                      className="ui-icon"
                      src={helpers.iconPath("moon-02")}
                      alt=""
                      aria-hidden="true"
                      width={moreParams.popoverIconSize as number}
                      height={moreParams.popoverIconSize as number}
                      unoptimized
                    />
                    Dark mode
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <SyncSettingsDialog
        open={syncSettingsOpen}
        onOpenChange={setSyncSettingsOpen}
        onSaved={() => {
          setCookieLabel("");
          apiFetch("/api/cookies")
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
              if (!d) return;
              const m = d.cookieMode;
              if (m === "auto:firefox") setCookieLabel("(auto: Firefox)");
              else if (m === "auto:edge") setCookieLabel("(auto: Edge)");
              else if (m === "auto:chrome") setCookieLabel("(auto: Chrome)");
              else if (m === "auto:brave") setCookieLabel("(auto: Brave)");
              else if (m === "manual-runtime") setCookieLabel("(manual)");
              else if (m === "manual-firefox") setCookieLabel("(env)");
              else setCookieLabel("");
            })
            .catch(() => {});
        }}
      />
    </div>
  );
}

function FeedRegion({
  refs,
  state,
  actions,
  helpers,
  mobile,
}: {
  refs: ReturnType<typeof useBookmarkViewer>["refs"];
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
  helpers: ReturnType<typeof useBookmarkViewer>["helpers"];
  mobile: boolean;
}) {
  const bar = useDialKit("Feed Bottom Bar", {
    paddingX: [4, 4, 32, 1],
    paddingY: [4, 2, 24, 1],
    gap: [8, 0, 24, 1],
    iconSize: [16, 12, 28, 1],
    togglePadding: [4, 0, 12, 1],
    toggleGap: [2, 0, 12, 1],
    btnPadding: [4, 0, 16, 1],
  });

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
          <div
            ref={refs.gridRef}
            id="grid"
            style={{
              width: state.gridWidth ? `${state.gridWidth}px` : undefined,
              height: state.gridHeight ? `${state.gridHeight}px` : undefined,
            }}
          />
        </div>
      </main>
      <div
        className="feed-bottom-bar"
        style={{
          padding: `${bar.paddingY as number}px ${bar.paddingX as number}px`,
          gap: `${bar.gap as number}px`,
        }}
      >
        <div
          className="view-toggle"
          role="radiogroup"
          aria-label="Change layout view"
          style={{
            padding: `${bar.togglePadding as number}px`,
            gap: `${bar.toggleGap as number}px`,
          }}
        >
          <button
            type="button"
            aria-label="Media view"
            role="radio"
            aria-checked={state.activeView === "media"}
            className={`view-toggle-btn${state.activeView === "media" ? " active" : ""}`}
            onClick={() => actions.applyView("media" as ViewMode)}
            style={{ padding: `${bar.btnPadding as number}px` }}
          >
            <Image
              className="ui-icon"
              src={helpers.iconPath("image-01")}
              alt=""
              aria-hidden="true"
              width={bar.iconSize as number}
              height={bar.iconSize as number}
              unoptimized
            />
          </button>
          <button
            type="button"
            aria-label="Cards view"
            role="radio"
            aria-checked={state.activeView === "card"}
            className={`view-toggle-btn${state.activeView === "card" ? " active" : ""}`}
            onClick={() => actions.applyView("card" as ViewMode)}
            style={{ padding: `${bar.btnPadding as number}px` }}
          >
            <Image
              className="ui-icon"
              src={helpers.iconPath("cards-01")}
              alt=""
              aria-hidden="true"
              width={bar.iconSize as number}
              height={bar.iconSize as number}
              unoptimized
            />
          </button>
        </div>
        <SortPickerDial
          value={state.activeSort}
          onChange={(sort) => actions.setActiveSort(sort)}
          mobile={mobile}
        />
      </div>
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

function SearchCommand({
  open,
  onOpenChange,
  state,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ReturnType<typeof useBookmarkViewer>["state"];
  actions: ReturnType<typeof useBookmarkViewer>["actions"];
}) {
  const [query, setQuery] = useState("");
  const appliedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      appliedRef.current = false;
    }
  }, [open]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !appliedRef.current && state.activeSearch) {
        actions.clearSearch();
      }
      onOpenChange(nextOpen);
    },
    [state.activeSearch, actions, onOpenChange],
  );

  const cmdParams = useDialKit("Search Command", {
    width: [560, 320, 800, 20],
    maxHeight: [460, 200, 800, 20],
    borderRadius: [15, 0, 32, 1],
    strokeColor: { type: "color", default: "var(--border)" },
    bgColor: { type: "color", default: "var(--popover)" },
    hoverBg: { type: "color", default: "var(--muted)" },
    cardPaddingX: [4, 0, 24, 1],
    cardPaddingY: [4, 0, 24, 1],
    inputPaddingX: [12, 4, 32, 1],
    inputPaddingY: [10, 4, 24, 1],
    inputFontSize: [14, 10, 24, 1],
    itemGap: [0, 0, 16, 1],
    itemPaddingX: [8, 4, 32, 1],
    itemPaddingY: [8, 2, 20, 1],
    hoverPaddingX: [4, 0, 16, 1],
    hoverPaddingY: [0, 0, 12, 1],
    maxResults: [50, 5, 200, 5],
    badgeFontSize: [11, 9, 16, 1],
    pillPaddingX: [10, 0, 32, 1],
    pillPaddingY: [4, 0, 16, 1],
    prefixBadgeBg: { type: "color", default: "#e8e8ed" },
    prefixBadgeBgDark: { type: "color", default: "#2a2a2a" },
  });

  const prefix = useMemo(() => {
    if (query.startsWith("@")) return "author" as const;
    if (query.startsWith("#")) return "category" as const;
    if (query.startsWith("domain:") || query.startsWith("!domain:")) return "domain" as const;
    return null;
  }, [query]);

  const prefixQuery = useMemo(() => {
    if (query.startsWith("@")) return query.slice(1).toLowerCase();
    if (query.startsWith("#")) return query.slice(1).toLowerCase();
    if (query.startsWith("!domain:")) return query.slice(8).toLowerCase();
    if (query.startsWith("domain:")) return query.slice(7).toLowerCase();
    return "";
  }, [query]);

  const authors = useMemo(() => {
    const map = new Map<string, { name: string; handle: string; count: number }>();
    for (const b of state.allBookmarks) {
      const key = b.authorHandle.toLowerCase();
      if (!map.has(key)) map.set(key, { name: b.authorName, handle: b.authorHandle, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [state.allBookmarks]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of state.allBookmarks) {
      const cat = b.category || "unclassified";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return [...map.entries()]
      .filter(([name]) => name !== "unclassified")
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [state.allBookmarks]);

  const domains = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of state.allBookmarks) {
      const list = b.linkedDomains?.length ? b.linkedDomains : b.domains ?? [];
      for (const domain of list) {
        map.set(domain, (map.get(domain) || 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [state.allBookmarks]);

  const filteredAuthors = useMemo(() => {
    if (!prefixQuery) return authors.slice(0, cmdParams.maxResults as number);
    return authors
      .filter(
        (a) =>
          a.handle.toLowerCase().includes(prefixQuery) ||
          a.name.toLowerCase().includes(prefixQuery),
      )
      .slice(0, cmdParams.maxResults as number);
  }, [authors, prefixQuery, cmdParams.maxResults]);

  const filteredCategories = useMemo(() => {
    if (!prefixQuery) return categories.slice(0, cmdParams.maxResults as number);
    return categories
      .filter((c) => c.name.toLowerCase().includes(prefixQuery))
      .slice(0, cmdParams.maxResults as number);
  }, [categories, prefixQuery, cmdParams.maxResults]);

  const filteredDomains = useMemo(() => {
    if (!prefixQuery) return domains.slice(0, cmdParams.maxResults as number);
    return domains
      .filter((d) => d.name.toLowerCase().includes(prefixQuery))
      .slice(0, cmdParams.maxResults as number);
  }, [domains, prefixQuery, cmdParams.maxResults]);

  const handleApplyFacet = useCallback(
    (type: FacetType, value: string) => {
      appliedRef.current = true;
      actions.applyFacet(type, value);
      onOpenChange(false);
    },
    [actions, onOpenChange],
  );

  const handleEnter = useCallback(() => {
    appliedRef.current = true;
    if (prefix === "author" && filteredAuthors.length > 0) {
      handleApplyFacet("author", filteredAuthors[0].name);
    } else if (prefix === "category" && filteredCategories.length > 0) {
      handleApplyFacet("category", filteredCategories[0].name);
    } else if (prefix === "domain" && filteredDomains.length > 0) {
      handleApplyFacet("domain", filteredDomains[0].name);
    } else {
      actions.setActiveSearch(query, true);
      onOpenChange(false);
    }
  }, [prefix, filteredAuthors, filteredCategories, filteredDomains, query, actions, onOpenChange, handleApplyFacet]);

  const w = cmdParams.width as number;
  const mh = cmdParams.maxHeight as number;
  const br = cmdParams.borderRadius as number;
  const cpX = cmdParams.cardPaddingX as number;
  const cpY = cmdParams.cardPaddingY as number;
  const ipX = cmdParams.inputPaddingX as number;
  const ipY = cmdParams.inputPaddingY as number;
  const ifs = cmdParams.inputFontSize as number;
  const ig = cmdParams.itemGap as number;
  const ipX2 = cmdParams.itemPaddingX as number;
  const ipY2 = cmdParams.itemPaddingY as number;
  const hpX = cmdParams.hoverPaddingX as number;
  const hpY = cmdParams.hoverPaddingY as number;
  const bfs = cmdParams.badgeFontSize as number;
  const ppX = cmdParams.pillPaddingX as number;
  const ppY = cmdParams.pillPaddingY as number;

  function highlightText(text: string, q: string) {
    if (!q.trim()) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="rounded-sm bg-accent/40 px-0.5 text-accent-foreground">{part}</mark>
        : part
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden ring-0"
        style={{
          width: w,
          maxHeight: mh,
          borderRadius: br,
          background: cmdParams.bgColor as string,
          padding: 0,
          boxShadow: `0 0 0 1px ${cmdParams.strokeColor}`,
        } as React.CSSProperties}
        showCloseButton={false}
      >
        <div
          className="flex items-center gap-2 border-b border-border"
          style={{
            paddingLeft: ipX,
            paddingRight: ipX,
            paddingTop: ipY,
            paddingBottom: ipY,
          }}
        >
          <HugeiconsIcon icon={Search01Icon} size={16} className="shrink-0 text-muted-foreground/50" />
          <SmoothInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnter(); }}
            placeholder="Search or use @author, #category, domain:…"
            wrapperClassName="!bg-transparent !max-w-none !rounded-none !p-0 !border-0 !outline-none search-cmd-input-wrapper"
            className="outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ fontSize: ifs }}
          />
        </div>
        <div
          className="search-scrollbar flex-1 overflow-y-auto"
          style={{ padding: `${cpY}px ${cpX}px` }}
        >
          {prefix === "author" && (
            <div className="flex flex-col" style={{ gap: ig }}>
              {filteredAuthors.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">No authors found.</div>
              )}
              {filteredAuthors.map((author) => (
                <button
                  key={author.handle}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg text-left transition-colors"
                  style={{
                    paddingLeft: ipX2 + hpX,
                    paddingRight: ipX2 + hpX,
                    paddingTop: ipY2 + hpY,
                    paddingBottom: ipY2 + hpY,
                    backgroundColor: "transparent",
                  }}
                  onClick={() => handleApplyFacet("author", author.name)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = cmdParams.hoverBg as string; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {author.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{author.name}</span>
                    <span className="truncate text-xs text-muted-foreground">@{author.handle}</span>
                  </div>
                  <span
                    className="shrink-0 rounded-md text-xs font-semibold capitalize tracking-wide"
                    style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY, fontSize: bfs, background: state.darkMode ? cmdParams.prefixBadgeBgDark as string : cmdParams.prefixBadgeBg as string }}
                  >
                    {author.count}
                  </span>
                </button>
              ))}
            </div>
          )}
          {prefix === "category" && (
            <div className="flex flex-col" style={{ gap: ig }}>
              {filteredCategories.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">No categories found.</div>
              )}
              {filteredCategories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg text-left transition-colors"
                  style={{
                    paddingLeft: ipX2 + hpX,
                    paddingRight: ipX2 + hpX,
                    paddingTop: ipY2 + hpY,
                    paddingBottom: ipY2 + hpY,
                    backgroundColor: "transparent",
                  }}
                  onClick={() => handleApplyFacet("category", cat.name)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = cmdParams.hoverBg as string; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm">
                    #
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {cat.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAi\b/g, 'AI')}
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-md text-xs font-semibold capitalize tracking-wide"
                    style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY, fontSize: bfs, background: state.darkMode ? cmdParams.prefixBadgeBgDark as string : cmdParams.prefixBadgeBg as string }}
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          )}
          {prefix === "domain" && (
            <div className="flex flex-col" style={{ gap: ig }}>
              {filteredDomains.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">No domains found.</div>
              )}
              {filteredDomains.map((domain) => (
                <button
                  key={domain.name}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg text-left transition-colors"
                  style={{
                    paddingLeft: ipX2 + hpX,
                    paddingRight: ipX2 + hpX,
                    paddingTop: ipY2 + hpY,
                    paddingBottom: ipY2 + hpY,
                    backgroundColor: "transparent",
                  }}
                  onClick={() => handleApplyFacet("domain", domain.name)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = cmdParams.hoverBg as string; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{domain.name}</span>
                  </div>
                  <span
                    className="shrink-0 rounded-md text-xs font-semibold capitalize tracking-wide"
                    style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY, fontSize: bfs, background: state.darkMode ? cmdParams.prefixBadgeBgDark as string : cmdParams.prefixBadgeBg as string }}
                  >
                    {domain.count}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!prefix && (
            <>
              <div
                className="flex items-center justify-between text-xs text-muted-foreground/60"
                style={{
                  paddingTop: 4,
                  paddingRight: 12,
                  paddingBottom: 8,
                  paddingLeft: 12,
                }}
              >
                <span>Bookmark results</span>
              </div>
              <div className="flex flex-col" style={{ gap: ig }}>
                {(() => {
                  const max = cmdParams.maxResults as number;
                  const results = !query.trim()
                    ? state.allBookmarks.slice(0, max)
                    : state.allBookmarks.filter((b) => {
                        const q = query.toLowerCase();
                        return (
                          b.text.toLowerCase().includes(q) ||
                          b.authorName.toLowerCase().includes(q) ||
                          b.authorHandle.toLowerCase().includes(q)
                        );
                      }).slice(0, max);
                  return results.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>
                  ) : (
                    results.map((bookmark) => (
                      <button
                        key={bookmark.id}
                        type="button"
                        className="flex w-full items-start rounded-lg text-left transition-colors"
                        style={{
                          gap: ig,
                          paddingLeft: ipX2 + hpX,
                          paddingRight: ipX2 + hpX,
                          paddingTop: ipY2 + hpY,
                          paddingBottom: ipY2 + hpY,
                          backgroundColor: "transparent",
                        }}
                        onClick={() => {
                          appliedRef.current = true;
                          onOpenChange(false);
                          window.open(bookmark.url, "_blank");
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = cmdParams.hoverBg as string; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{bookmark.authorName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">@{bookmark.authorHandle}</span>
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {highlightText(bookmark.text, query)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline" size="sm" className="capitalize tracking-wide" style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY }}>{bookmark.category || (bookmark.folders[0] ?? "Uncategorized")}</Badge>
                        </div>
                      </button>
                    ))
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BookmarksViewer() {
  const { refs, state, actions, helpers } = useBookmarkViewer();
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="app-shell">
      <section className="content-shell">
        <ToolbarRegion
          state={state}
          actions={actions}
          helpers={helpers}
          onSearchOpenChange={setSearchOpen}
        />
        <div className="workspace-shell">
          <FeedRegion refs={refs} state={state} actions={actions} helpers={helpers} mobile={isMobile} />
        </div>
      </section>
      <SearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        state={state}
        actions={actions}
      />
      <LightboxOverlay refs={refs} state={state} actions={actions} />
    </div>
  );
}
