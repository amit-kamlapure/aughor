// @vitest-environment jsdom
/**
 * The real editor, held to what the SQL editor's tabs lean on (2026-11-09): a document replaced from outside — a tab's
 * text arriving — keeps the cursor where it was, at most at its new end, so a statement opened into an empty editor left
 * the cursor at 0 and the next » put its name in front of SELECT; `cursorToEnd` is how a tab that opens holding a
 * statement puts it after it. `SqlMode.test.tsx`'s stand-in editor keeps a cursor the same way.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@/lib/testing";

import { cmDialect } from "@/lib/query/dialect";
import { SqlEditorPane } from "./SqlEditorPane";

type Api = { insert: (t: string) => void; cursorToEnd: () => void };

describe("the SQL editor's cursor", () => {
  it("stays where it was when a tab's text replaces the document, and goes to its end when asked", () => {
    let api: Api | null = null;
    const onChange = vi.fn();
    const dialect = cmDialect({ conn_type: "postgres" });
    const { rerender } = render(<SqlEditorPane value="" dialect={dialect} onChange={onChange} onReady={a => { api = a; }} />);
    expect(api).not.toBeNull();
    rerender(<SqlEditorPane value="SELECT 1" dialect={dialect} onChange={onChange} onReady={a => { api = a; }} />);
    act(() => api!.insert("x"));                                    // the cursor was at 0, and stayed there
    expect(onChange).toHaveBeenLastCalledWith("xSELECT 1");
    act(() => api!.cursorToEnd());
    act(() => api!.insert(" AS one"));
    expect(onChange).toHaveBeenLastCalledWith("xSELECT 1 AS one");
  });
});
