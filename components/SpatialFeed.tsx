"use client";

import type { Bookmark, ViewMode } from "@/lib/types";
import { useSpatialFeed } from "@/hooks/useSpatialFeed";

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
  onOpenLightbox,
  onOpenContextMenu,
}: {
  bookmarks: Bookmark[];
  activeView: ViewMode;
  onOpenLightbox: (element: HTMLDivElement, bookmark: Bookmark) => void;
  onOpenContextMenu: (bookmark: Bookmark, x: number, y: number) => void;
}) {
  const { refs } = useSpatialFeed(bookmarks, activeView, {
    onOpenLightbox,
    onOpenContextMenu,
  });

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