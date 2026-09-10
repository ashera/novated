import { NextResponse } from "next/server";
import { BUILD, APP_VERSION } from "@/lib/version";

// Always evaluated fresh (never cached), so a long-open tab can compare the build it
// was served against the currently-deployed build and offer a reload.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: BUILD, version: APP_VERSION },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
