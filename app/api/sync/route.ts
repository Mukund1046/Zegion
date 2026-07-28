import { NextResponse } from "next/server";
import { syncBookmarks } from "@/lib/server-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_CHANNEL = "kairos-sync";

function broadcastSyncComplete() {
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.postMessage("sync-complete");
    channel.close();
  } catch {
    // BroadcastChannel may not be available in all server environments
  }
}

export async function POST() {
  try {
    const payload = await syncBookmarks();
    broadcastSyncComplete();
    return NextResponse.json(payload);
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: statusCode }
    );
  }
}