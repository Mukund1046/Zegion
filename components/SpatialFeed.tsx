"use client";

import type { Bookmark, ViewMode } from "@/lib/types";
import { useSpatialFeed, type SpatialCameraApi } from "@/hooks/useSpatialFeed";
import type { RefObject } from "react";

/**
 * The main-feed spatial surface. It renders the app's `displayBookmarks` on the
 * same spatial engine + renderer as the /spatial prototype, in the app's shell.
 * Application ownership (filter/search/sort/persistence/sync/lightbox/context
 * menu/dark mode) stays in `useBookmarkViewer`; this component only mounts the
 * spatial viewport and forwards interactions back to the app through handlers.
 */
export default function SpatialFeed({
  bookmarks,
  activeView,
  isFilterActive,
  onOpenLightbox,
  onOpenContextMenu,
  cameraApiRef,
}: {
  bookmarks: Bookmark[];
  activeView: ViewMode;
  /** True only while the app shell is showing a search or filtered subset. */
  isFilterActive: boolean;
  onOpenLightbox: (element: HTMLDivElement, bookmark: Bookmark) => void;
  onOpenContextMenu: (bookmark: Bookmark, x: number, y: number) => void;
  /** Filled by the hook with snapshot/restore fns (no re-renders). */
  cameraApiRef?: RefObject<SpatialCameraApi | null>;
}) {
  const { refs, actions } = useSpatialFeed(bookmarks, activeView, isFilterActive, {
    onOpenLightbox,
    onOpenContextMenu,
  });

  if (cameraApiRef) {
    cameraApiRef.current = {
      snapshotCamera: actions.snapshotCamera,
      requestRestore: actions.requestRestore,
    };
  }

  return (
    <main
      ref={refs.viewportRef}
      className="spatial-viewport"
      aria-label="Bookmarks feed"
    >
      <div ref={refs.worldRef} className="spatial-world" />
    </main>
  );
}
