/**
 * The lines and the head of a grid of cells — the Spreadsheets grid's own (`components/sheets/SheetGrid.tsx`: its
 * `LINE`, and the `--bg-2` its column heads sit on).
 *
 * The user, 2026-11-09, on the SQL Editor's result table: "Let the table be similar to spreadsheets.. properly
 * bordered cells.. let other features be as is..". A result read as a list — faint rules between rows, no line between
 * columns — beside a sheet that reads as a grid. So every result grid (`SqlResultTable`, the SQL Editor's
 * `ResultsGrid`) draws each cell's right and bottom edge with these, the head and the row numbers included, and the two
 * read as one product in both skins. The two grids' tests (`components/SqlResultTable.filters.test.tsx`,
 * `components/query/ResultsGrid.test.tsx`) hold the line equal to the sheet's and assert it on the cells.
 */
import type { TokenName } from "@/lib/tokenFallback";

/** A cell's edge: drawn inside the cell (border-box), so a 30px row stays 30px. */
export const GRID_LINE = "1px solid var(--b2)";
/** The edge's colour as a token — for Ant Design's table, which takes a colour, not a CSS line. */
export const GRID_LINE_TOKEN: TokenName = "--b2";
/** The ground a column's head sits on. */
export const GRID_HEAD_BG = "var(--bg-2)";
export const GRID_HEAD_TOKEN: TokenName = "--bg-2";
