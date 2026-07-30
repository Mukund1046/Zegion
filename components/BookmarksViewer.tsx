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
  Link01Icon,
  Copy01Icon,
  CheckmarkCircle01Icon,
  UserIcon,
  TextIcon,
} from '@hugeicons/core-free-icons'
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import type { Bookmark } from "@/lib/types";
import {
  ContextMenu,
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

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
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
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
                    transition={{ type: "spring", stiffness: 520, damping: 38 }}
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
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
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

  const [barHover, setBarHover] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [scrollMax, setScrollMax] = useState(0);
  const barTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = refs.viewportRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollY(el.scrollTop);
      setScrollMax(el.scrollHeight - el.clientHeight);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [refs.viewportRef]);

  const showScrollTop = scrollY > 800 && state.feedMode;

  const showBar = barHover || state.feedMode === false;

  return (
    <div
      ref={refs.feedShellRef}
      className="feed-shell"
      onMouseEnter={() => {
        clearTimeout(barTimerRef.current);
        setBarHover(true);
      }}
      onMouseLeave={() => {
        barTimerRef.current = setTimeout(() => setBarHover(false), 300);
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{ height: 80 }}
        onMouseEnter={() => {
          clearTimeout(barTimerRef.current);
          setBarHover(true);
        }}
      />
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
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            key="scroll-top"
            type="button"
            aria-label="Scroll to top"
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            onClick={() => refs.viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              position: "absolute",
              bottom: mobile ? 8 : 12,
              insetInlineEnd: mobile ? 8 : 12,
              zIndex: 20,
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
      <div className="feed-bottom-bar">
        <motion.div
          animate={{ y: showBar ? 0 : 80, opacity: showBar ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 38 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: `${bar.gap as number}px`,
            padding: `${bar.paddingY as number}px ${bar.paddingX as number}px`,
            borderRadius: 12,
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
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
      </motion.div>
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const stableResultsRef = useRef<typeof state.allBookmarks>([]);
  const pointerMoveCountRef = useRef(0);
  const lastPointeroverCountRef = useRef(0);
  const lastKeyTimeRef = useRef(0);

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
    width: [500, 320, 800, 20],
    maxHeight: [460, 200, 800, 20],
    borderRadius: [24, 0, 32, 1],
    strokeColor: { type: "color", default: "var(--border)" },
    bgColor: { type: "color", default: "var(--popover)" },
    hoverBg: { type: "color", default: "#ececec" },
    hoverBgDark: { type: "color", default: "var(--muted)" },
    cardPaddingX: [4, 0, 24, 1],
    cardPaddingY: [4, 0, 24, 1],
    inputPaddingX: [12, 4, 32, 1],
    inputPaddingY: [10, 4, 24, 1],
    inputFontSize: [16, 10, 24, 1],
    itemGap: [0, 0, 16, 1],
    itemPaddingX: [8, 4, 32, 1],
    itemPaddingY: [8, 2, 20, 1],
    hoverPaddingX: [4, 0, 16, 1],
    hoverPaddingY: [4, 0, 12, 1],
    maxResults: [50, 5, 200, 5],
    badgeFontSize: [11, 9, 16, 1],
    pillPaddingX: [10, 0, 32, 1],
    pillPaddingY: [4, 0, 16, 1],
    prefixBadgeBg: { type: "color", default: "#e8e8ed" },
    prefixBadgeBgDark: { type: "color", default: "#252527" },
    monoFontSize: [9, 9, 20, 1],
    placeholderIndent: [0, -20, 40, 1],
  });

  const prefix = useMemo(() => {
    if (query.startsWith("@")) return "author" as const;
    if (query.startsWith("#")) return "category" as const;
    if (query.startsWith("domain:") || query.startsWith("!domain:")) return "domain" as const;
    if (query.startsWith("sites:") || query.startsWith("!sites:")) return "site" as const;
    return null;
  }, [query]);

  const prefixQuery = useMemo(() => {
    if (query.startsWith("@")) return query.slice(1).toLowerCase();
    if (query.startsWith("#")) return query.slice(1).toLowerCase();
    if (query.startsWith("!domain:")) return query.slice(8).toLowerCase();
    if (query.startsWith("domain:")) return query.slice(7).toLowerCase();
    if (query.startsWith("!sites:")) return query.slice(7).toLowerCase();
    if (query.startsWith("sites:")) return query.slice(6).toLowerCase();
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
      const list = b.domains?.length ? b.domains : b.domain ? [b.domain] : [];
      for (const domain of list) {
        if (domain === "x.com" || domain === "twitter.com") continue;
        map.set(domain, (map.get(domain) || 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [state.allBookmarks]);

  const sites = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of state.allBookmarks) {
      for (const site of b.linkedDomains ?? []) {
        map.set(site, (map.get(site) || 0) + 1);
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

  const filteredSites = useMemo(() => {
    if (!prefixQuery) return sites.slice(0, cmdParams.maxResults as number);
    return sites
      .filter((s) => s.name.toLowerCase().includes(prefixQuery))
      .slice(0, cmdParams.maxResults as number);
  }, [sites, prefixQuery, cmdParams.maxResults]);

  const maxBookmarkResults = cmdParams.maxResults as number;

  const bookmarkResults = useMemo(() => {
    if (prefix) return [];
    const q = query.trim().toLowerCase();
    const candidates = q
      ? state.allBookmarks.filter((b) =>
          b.text.toLowerCase().includes(q) ||
          b.authorName.toLowerCase().includes(q) ||
          b.authorHandle.toLowerCase().includes(q)
        ).slice(0, maxBookmarkResults)
      : state.allBookmarks.slice(0, maxBookmarkResults);

    const prev = stableResultsRef.current;
    if (!prev.length || !candidates.length) {
      stableResultsRef.current = candidates;
      return candidates;
    }

    const nextSet = new Map<string, Bookmark>();
    const nextIds = new Set<string>();
    for (const b of candidates) {
      nextSet.set(b.id, b);
      nextIds.add(b.id);
    }

    const merged: Bookmark[] = [];
    const used = new Set<string>();
    let focusedId = "";

    if (prev.some((b) => b.url === stableResultsRef.current[prev.length - 1]?.url)) {
      if (
        focusedIndex >= 0 &&
        focusedIndex < prev.length &&
        nextIds.has(prev[focusedIndex].id)
      ) {
        focusedId = prev[focusedIndex].id;
      }
    }

    for (const b of prev) {
      if (b.id === focusedId || nextIds.has(b.id)) {
        merged.push(b);
        used.add(b.id);
      }
    }

    for (const b of candidates) {
      if (!used.has(b.id)) {
        merged.push(b);
        used.add(b.id);
      }
    }

    stableResultsRef.current = merged;
    return merged;
  }, [query, state.allBookmarks, prefix, maxBookmarkResults, focusedIndex]);

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
    } else if (prefix === "site" && filteredSites.length > 0) {
      handleApplyFacet("site", filteredSites[0].name);
    } else if (!prefix && bookmarkResults.length > 0 && focusedIndex >= 0 && focusedIndex < bookmarkResults.length) {
      const bookmark = bookmarkResults[focusedIndex];
      onOpenChange(false);
      window.open(bookmark.url, "_blank");
    } else if (!prefix) {
      actions.setActiveSearch(query, true);
      onOpenChange(false);
    }
  }, [prefix, filteredAuthors, filteredCategories, filteredDomains, filteredSites, bookmarkResults, focusedIndex, query, actions, onOpenChange, handleApplyFacet]);

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
  const mfs = cmdParams.monoFontSize as number;
  const monoStyle = { fontSize: mfs, textTransform: "uppercase" as const, fontFamily: "var(--font-dm-mono), DM Mono, monospace" };

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
        className="flex flex-col gap-0 overflow-hidden ring-0 sm:max-w-none"
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
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
              stableResultsRef.current = [];
            }}
            onKeyDown={(e) => {
              const total = bookmarkResults.length;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex((i) => (i < total - 1 ? i + 1 : 0));
                lastKeyTimeRef.current = Date.now();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex((i) => (i > 0 ? i - 1 : total - 1));
                lastKeyTimeRef.current = Date.now();
              } else if (e.key === 'Enter') {
                handleEnter();
              }
            }}
            placeholder="Search or use @author, #category, domain:, sites:…"
            wrapperClassName="!bg-transparent !max-w-none !rounded-none !p-0 !border-0 !outline-none search-cmd-input-wrapper"
            className="outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 search-cmd-input"
            style={{ fontSize: ifs, textIndent: cmdParams.placeholderIndent as number }}
          />
        </div>
        <div
          className="search-scrollbar flex-1 overflow-y-auto overflow-x-hidden"
          style={{ padding: `${cpY}px ${cpX}px` }}
          onPointerMove={() => { pointerMoveCountRef.current++; }}
        >
          {prefix === "author" && (
            <div className="flex flex-col" style={{ gap: ig }}>
              {filteredAuthors.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">No authors matching &quot;{prefixQuery}&quot;</div>
              )}
              {filteredAuthors.map((author) => (
                <button
                  key={author.handle}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                  style={{
                    paddingLeft: ipX2 + hpX,
                    paddingRight: ipX2 + hpX,
                    paddingTop: ipY2 + hpY,
                    paddingBottom: ipY2 + hpY,
                    backgroundColor: "transparent",
                  }}
                  onClick={() => handleApplyFacet("author", author.name)}
                   onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = state.darkMode ? cmdParams.hoverBgDark as string : cmdParams.hoverBg as string; }}
                   onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                 >
                   <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                     {author.name.charAt(0).toUpperCase()}
                   </div>
                   <div className="flex min-w-0 flex-1 flex-col">
                     <span className="truncate text-sm font-medium text-foreground">{author.name}</span>
                     <span className="truncate text-xs text-muted-foreground" style={monoStyle}>@{author.handle}</span>
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
                <div className="py-6 text-center text-sm text-muted-foreground">No categories matching &quot;{prefixQuery}&quot;</div>
              )}
              {filteredCategories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                  style={{
                    paddingLeft: ipX2 + hpX,
                    paddingRight: ipX2 + hpX,
                    paddingTop: ipY2 + hpY,
                    paddingBottom: ipY2 + hpY,
                    backgroundColor: "transparent",
                  }}
                  onClick={() => handleApplyFacet("category", cat.name)}
                   onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = state.darkMode ? cmdParams.hoverBgDark as string : cmdParams.hoverBg as string; }}
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
                 <div className="py-6 text-center text-sm text-muted-foreground">{prefixQuery ? `No domains matching "${prefixQuery}"` : "No classified domains — run domain classification first"}</div>
               )}
               {filteredDomains.map((domain) => (
                 <button
                   key={domain.name}
                   type="button"
                   className="flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                   style={{
                     paddingLeft: ipX2 + hpX,
                     paddingRight: ipX2 + hpX,
                     paddingTop: ipY2 + hpY,
                     paddingBottom: ipY2 + hpY,
                     backgroundColor: "transparent",
                   }}
                   onClick={() => handleApplyFacet("domain", domain.name)}
                   onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = state.darkMode ? cmdParams.hoverBgDark as string : cmdParams.hoverBg as string; }}
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
                     <span className="truncate text-sm font-medium text-foreground" style={{ textTransform: "capitalize" }}>{domain.name}</span>
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
           {prefix === "site" && (
             <div className="flex flex-col" style={{ gap: ig }}>
               {filteredSites.length === 0 && (
                 <div className="py-6 text-center text-sm text-muted-foreground">{prefixQuery ? `No sites matching "${prefixQuery}"` : "No linked sites in bookmarks"}</div>
               )}
               {filteredSites.map((site) => (
                 <button
                   key={site.name}
                   type="button"
                   className="flex w-full items-center gap-3 rounded-xl text-left transition-colors"
                   style={{
                     paddingLeft: ipX2 + hpX,
                     paddingRight: ipX2 + hpX,
                     paddingTop: ipY2 + hpY,
                     paddingBottom: ipY2 + hpY,
                     backgroundColor: "transparent",
                   }}
                   onClick={() => handleApplyFacet("site", site.name)}
                   onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = state.darkMode ? cmdParams.hoverBgDark as string : cmdParams.hoverBg as string; }}
                   onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                 >
                   <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                       <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                       <line x1="8" y1="21" x2="16" y2="21" />
                       <line x1="12" y1="17" x2="12" y2="21" />
                     </svg>
                   </div>
                   <div className="flex min-w-0 flex-1 flex-col">
                     <span className="truncate text-sm font-medium text-foreground">{site.name}</span>
                   </div>
                   <span
                     className="shrink-0 rounded-md text-xs font-semibold capitalize tracking-wide"
                     style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY, fontSize: bfs, background: state.darkMode ? cmdParams.prefixBadgeBgDark as string : cmdParams.prefixBadgeBg as string }}
                   >
                     {site.count}
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
                {bookmarkResults.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {query.trim() ? (
                      <span>No results for &quot;{query}&quot; — try <span className="text-foreground/70" style={monoStyle}>@author</span>, <span className="text-foreground/70" style={monoStyle}>#category</span>, <span className="text-foreground/70" style={monoStyle}>domain:</span>, or <span className="text-foreground/70" style={monoStyle}>sites:</span></span>
                    ) : (
                      <span>No bookmarks found</span>
                    )}
                  </div>
                ) : (
                  bookmarkResults.map((bookmark, index) => {
                    const isFocused = index === focusedIndex;
                    return (
                      <button
                        key={bookmark.id}
                        type="button"
                        className="flex w-full items-start rounded-xl text-left transition-colors"
                        style={{
                          gap: ig,
                          paddingLeft: ipX2 + hpX,
                          paddingRight: ipX2 + hpX,
                          paddingTop: ipY2 + hpY,
                          paddingBottom: ipY2 + hpY,
                          backgroundColor: isFocused ? (state.darkMode ? cmdParams.hoverBgDark as string : cmdParams.hoverBg as string) : "transparent",
                        }}
                        onClick={() => {
                          appliedRef.current = true;
                          onOpenChange(false);
                          window.open(bookmark.url, "_blank");
                        }}
                        onPointerEnter={() => {
                          if (Date.now() - lastKeyTimeRef.current > 50) {
                            lastPointeroverCountRef.current = pointerMoveCountRef.current;
                            setFocusedIndex(index);
                          }
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{bookmark.authorName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground" style={monoStyle}>@{bookmark.authorHandle}</span>
                          </div>
                          {(bookmark.linkedDomains?.[0] || bookmark.domain) && (
                            <span className="truncate text-xs text-muted-foreground/50" style={monoStyle}>
                              {bookmark.linkedDomains?.[0] || bookmark.domain}
                            </span>
                          )}
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {highlightText(bookmark.text, query)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <Badge variant="outline" size="sm" className="truncate tracking-wide" style={{ paddingLeft: ppX, paddingRight: ppX, paddingTop: ppY, paddingBottom: ppY, ...monoStyle }}>{bookmark.category || (bookmark.folders[0] ?? "Uncategorized")}</Badge>
                        </div>
                      </button>
                    );
                  })
                )}
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
  const contextAnchorRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyingRef = useRef(false);

  const handleCopy = useCallback((item: "link" | "text" | "handle") => {
    const text = item === "link" ? state.contextMenuBookmark!.url
      : item === "text" ? state.contextMenuBookmark!.text
      : `@${state.contextMenuBookmark!.authorHandle}`;
    navigator.clipboard.writeText(text);
    actions.setCopiedItem(item);
    copyingRef.current = true;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      actions.setCopiedItem(null);
      actions.clearContextMenu();
      copyTimeoutRef.current = null;
      copyingRef.current = false;
    }, 1500);
  }, [state.contextMenuBookmark, actions]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !copyingRef.current) actions.clearContextMenu();
    if (open) copyingRef.current = false;
  }, [actions]);

  const ctx = useDialKit("Context Menu", {
    popupRadius: [16, 0, 24, 1],
    itemRadius: [12, 0, 20, 1],
    popupPaddingX: [6, 0, 24, 1],
    popupPaddingY: [6, 0, 24, 1],
    itemPaddingX: [10, 0, 24, 1],
    itemPaddingY: [6, 0, 20, 1],
    hoverBg: { type: "color", default: "#ececec" },
    hoverBgDark: { type: "color", default: "var(--muted)" },
  });

  useEffect(() => {
    if (state.contextMenuBookmark && contextAnchorRef.current) {
      contextAnchorRef.current.style.left = `${state.contextMenuPos.x}px`;
      contextAnchorRef.current.style.top = `${state.contextMenuPos.y}px`;
    }
  }, [state.contextMenuBookmark, state.contextMenuPos]);

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
      <ContextMenu
        open={!!state.contextMenuBookmark}
        onOpenChange={handleOpenChange}
      >
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
      <div ref={contextAnchorRef} className="fixed pointer-events-none" style={{ width: 1, height: 1 }} />
      {state.contextMenuBookmark && (
        <ContextMenuPopup
          align="start"
          side="bottom"
          sideOffset={0}
          anchor={contextAnchorRef.current ?? undefined}
          style={{
            borderRadius: ctx.popupRadius as number,
            padding: `${ctx.popupPaddingY as number}px ${ctx.popupPaddingX as number}px`,
            border: "none",
            boxShadow: "none",
            ["--ctx-hover-bg" as string]: state.darkMode ? ctx.hoverBgDark as string : ctx.hoverBg as string,
            ["--ctx-hover-text" as string]: undefined,
          }}
        >
          <ContextMenuItem
            style={{
              borderRadius: ctx.itemRadius as number,
              padding: `${ctx.itemPaddingY as number}px ${ctx.itemPaddingX as number}px`,
            }}
            onClick={() => { window.open(state.contextMenuBookmark!.url, "_blank"); actions.clearContextMenu(); }}
          >
            <HugeiconsIcon icon={Link01Icon} size={14} />
            Open in new tab
          </ContextMenuItem>
          <ContextMenuItem
            style={{
              borderRadius: ctx.itemRadius as number,
              padding: `${ctx.itemPaddingY as number}px ${ctx.itemPaddingX as number}px`,
            }}
            onClick={() => handleCopy("link")}
          >
            <div className="relative" style={{ width: 14, height: 14 }}>
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{
                  scale: state.copiedItem === "link" ? 0.5 : 1,
                  opacity: state.copiedItem === "link" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={Copy01Icon} size={14} />
              </motion.div>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{
                  scale: state.copiedItem === "link" ? 1 : 0.5,
                  opacity: state.copiedItem === "link" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
              </motion.div>
            </div>
            <div className="relative overflow-hidden whitespace-nowrap" style={{ width: 130, height: "1.5em" }}>
              <motion.span
                initial={{ y: 0, opacity: 1 }}
                animate={{
                  y: state.copiedItem === "link" ? -24 : 0,
                  opacity: state.copiedItem === "link" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                Copy link
              </motion.span>
              <motion.span
                initial={{ y: 24, opacity: 0 }}
                animate={{
                  y: state.copiedItem === "link" ? 0 : 24,
                  opacity: state.copiedItem === "link" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0, display: "inline-block" }}
              >
                Copied link
              </motion.span>
            </div>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            style={{
              borderRadius: ctx.itemRadius as number,
              padding: `${ctx.itemPaddingY as number}px ${ctx.itemPaddingX as number}px`,
            }}
            onClick={() => handleCopy("text")}
          >
            <div className="relative" style={{ width: 14, height: 14 }}>
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{
                  scale: state.copiedItem === "text" ? 0.5 : 1,
                  opacity: state.copiedItem === "text" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={TextIcon} size={14} />
              </motion.div>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{
                  scale: state.copiedItem === "text" ? 1 : 0.5,
                  opacity: state.copiedItem === "text" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
              </motion.div>
            </div>
            <div className="relative overflow-hidden whitespace-nowrap" style={{ width: 130, height: "1.5em" }}>
              <motion.span
                initial={{ y: 0, opacity: 1 }}
                animate={{
                  y: state.copiedItem === "text" ? -24 : 0,
                  opacity: state.copiedItem === "text" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                Copy text
              </motion.span>
              <motion.span
                initial={{ y: 24, opacity: 0 }}
                animate={{
                  y: state.copiedItem === "text" ? 0 : 24,
                  opacity: state.copiedItem === "text" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0, display: "inline-block" }}
              >
                Copied text
              </motion.span>
            </div>
          </ContextMenuItem>
          <ContextMenuItem
            style={{
              borderRadius: ctx.itemRadius as number,
              padding: `${ctx.itemPaddingY as number}px ${ctx.itemPaddingX as number}px`,
            }}
            onClick={() => handleCopy("handle")}
          >
            <div className="relative" style={{ width: 14, height: 14 }}>
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{
                  scale: state.copiedItem === "handle" ? 0.5 : 1,
                  opacity: state.copiedItem === "handle" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={UserIcon} size={14} />
              </motion.div>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{
                  scale: state.copiedItem === "handle" ? 1 : 0.5,
                  opacity: state.copiedItem === "handle" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
              </motion.div>
            </div>
            <div className="relative overflow-hidden whitespace-nowrap" style={{ width: 130, height: "1.5em" }}>
              <motion.span
                initial={{ y: 0, opacity: 1 }}
                animate={{
                  y: state.copiedItem === "handle" ? -24 : 0,
                  opacity: state.copiedItem === "handle" ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0 }}
              >
                Copy @handle
              </motion.span>
              <motion.span
                initial={{ y: 24, opacity: 0 }}
                animate={{
                  y: state.copiedItem === "handle" ? 0 : 24,
                  opacity: state.copiedItem === "handle" ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                style={{ position: "absolute", inset: 0, display: "inline-block" }}
              >
                Copied @handle
              </motion.span>
            </div>
          </ContextMenuItem>
        </ContextMenuPopup>
      )}
    </ContextMenu>
  );
}
