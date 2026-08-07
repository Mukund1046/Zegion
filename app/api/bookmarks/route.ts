import { NextResponse } from "next/server";
import { readBookmarksData } from "@/lib/server-jobs";
import { requireLocalOrApiKey } from "@/lib/api-auth";
import type { Bookmark } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  const data = readBookmarksData();
  const url = new URL(request.url);
  const fields = url.searchParams.get("fields");

  if (fields === "spatial") {
    const bookmarks = data.bookmarks.map((bookmark: Bookmark) => ({
      id: bookmark.id,
      text: bookmark.text || "",
      images: (bookmark.images || []).map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
      })),
    }));
    return NextResponse.json(bookmarks, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
