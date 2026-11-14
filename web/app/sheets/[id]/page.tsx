"use client";

/**
 * `/sheets/<id>`: one spreadsheet as a page of its own — its grid, views, history and everything else the
 * Spreadsheets page shows for it. Opened beside an answer that read the sheet (the coworker's right-hand pane),
 * the way `/receipt/<id>` is opened from a document. A LAYOUT over `SheetView`: same app, same tokens, same auth,
 * and the same sharing — a sheet not shared with the reader says so here as it does there.
 */
import { use } from "react";
import { useRouter } from "next/navigation";

import { SheetView } from "@/components/sheets/SheetView";
import { installAuthFetch } from "@/lib/auth";
import { getApiBase } from "@/lib/config";

if (typeof window !== "undefined") installAuthFetch(getApiBase());

/** A segment may still arrive percent-encoded; a malformed one is used as written. */
function segment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function SheetRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <SheetView key={id} sheetId={segment(id)}
        // Another sheet opened from this one opens here; "back" has no list to go back to on a page of one sheet.
        onOpen={(next) => { if (next) router.push(`/sheets/${encodeURIComponent(next)}`); }}
        onBack={() => undefined} />
    </main>
  );
}
