"use client";

/**
 * AugTable — Ant Design Table wired to Aughor's dark design tokens.
 *
 * Usage (raw SQL results):
 *   <SqlResultTable columns={["id","name","revenue"]} rows={rows} />
 *
 * Usage (typed data):
 *   <AugTable<MyRow> columns={antColumns} dataSource={data} />
 *
 * A result (`SqlResultTable`) is drawn as a grid — the Spreadsheets grid's line on every cell's edge (2026-11-09) —
 * and each of its columns carries a ▾ that sorts and filters the rows on the page (`components/query/ColumnFilterMenu`).
 */

import React, { useEffect, useMemo, useState } from "react";
import { Table, ConfigProvider, theme, type ThemeConfig } from "antd";
import type { TableProps, TableColumnsType } from "antd";
import { cleanLabel, formatMoney, formatTableNumber, formatPercent, displayCellValue, formatNumberAs,
  type NumberFormat } from "@/lib/format";
import { isMoneyColumn, columnCurrencySymbol, currencyFromColumn, effectiveCurrencySymbol,
  unconfirmedCurrencyNote } from "@/lib/orgSettings";
import { sqlColKey, sqlRowObjects } from "@/lib/sqlTable";
import { useOrgSettings } from "@/lib/useOrgSettings";
import { rawCells, TableActions } from "@/components/TableActions";
import { useRowHeight } from "@/lib/look";
import { tokenColor, tokenPx } from "@/lib/tokenColor";
import { useThemeStamp } from "@/lib/useThemeStamp";
import type { TokenName } from "@/lib/tokenFallback";
import { GRID_HEAD_TOKEN, GRID_LINE_TOKEN } from "@/lib/gridLines";
import {
  columnKind, filteredWords, isFiltering, isNumericValue, keptRows, sortRows,
  type ColumnFilter, type ColumnSort,
} from "@/lib/query/columnFilter";
import { ColumnFilterButton, ColumnFilterMenu } from "@/components/query/ColumnFilterMenu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// ── Aughor tokens for Ant Design — READ from the live token sheet ────────────
// Ant's theme tokens must be real colours (it derives shades in script), so it cannot be
// handed `var(--bg-0)`. Both skins are built from the page's own tokens instead, read through
// `lib/tokenColor.ts` — which also turns a Radix step into sRGB, since on a wide-gamut screen
// a step is `color(display-p3 …)` and Ant's parser makes black of that. The grid is read
// again whenever <html> changes skin or look (`useThemeStamp`), so it follows a person's
// accent, grey and radius like everything else. Off the page the values are
// `lib/tokenFallback.ts`: the same steps at the default look.

// Selected-row hover: a stronger tint of the selection wash — no dedicated token.
const ROW_SELECTED_HOVER: Record<"dark" | "light", string> = {
  dark: "rgba(90, 159, 214, 0.22)",
  light: "rgba(31, 119, 180, 0.16)",
};

/** `grid`: a result's cells, drawn as the Spreadsheets grid draws them — its line on every edge and its head's ground
 *  (`lib/gridLines.ts`). Without it, a list of things: hairline rows, the head a step down. */
function buildAntTheme(mode: "dark" | "light", grid = false, rowHeight = 36): ThemeConfig {
  const v = (name: TokenName) => tokenColor(name, mode);
  return {
    algorithm: mode === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: {
      // Backgrounds
      colorBgBase:          v("--bg-0"),
      colorBgContainer:     v("--bg-1"),
      colorBgElevated:      v("--bg-2"),
      colorBgLayout:        v("--bg-0"),
      // Borders (hairlines)
      colorBorder:          v("--b1"),
      colorBorderSecondary: v("--b0"),
      colorSplit:           v("--b0"),
      // Text
      colorText:            v("--t1"),
      colorTextSecondary:   v("--t2"),
      colorTextDescription: v("--t3"),
      colorTextDisabled:    v("--t4"),
      // Brand (interaction accent)
      colorPrimary:         v("--blue3"),
      colorPrimaryHover:    v("--blue4"),
      // Misc — grid stays Inter (text columns readable); numeric formatting keeps tabular alignment
      fontSize:             12,
      fontFamily:           "'Inter', system-ui, sans-serif",
      borderRadius:         tokenPx("--r2", 6),   // the Theme's radius, as a control wears it
      borderRadiusSM:       tokenPx("--r1", 4),
      controlHeight:        30,
      lineWidth:            1,
    },
    components: {
      Table: {
        // Header
        headerBg:           v(grid ? GRID_HEAD_TOKEN : "--bg-3"),
        headerColor:        v("--t2"),
        headerSortActiveBg: v(grid ? GRID_HEAD_TOKEN : "--bg-3"),
        headerSortHoverBg:  v("--bg-4"),
        headerSplitColor:   v(grid ? GRID_LINE_TOKEN : "--b1"),
        // Rows
        rowHoverBg:         v("--bg-hover"),
        rowSelectedBg:      v("--bg-sel"),
        rowSelectedHoverBg: ROW_SELECTED_HOVER[mode],
        bodySortBg:         v("--bg-1"),
        // Borders — every edge of every cell, in a grid
        borderColor:        v(grid ? GRID_LINE_TOKEN : "--b0"),
        // Cell sizing
        cellFontSize:       12,
        cellPaddingInline:  14,
        // A 20px line padded to the person's Rows height (32 · 36 · 44px, 2026-11-10), as the other tables are.
        cellPaddingBlock:   Math.max(4, Math.round((rowHeight - 20) / 2)),
      },
      Pagination: {
        colorBgContainer:   v("--bg-1"),
        itemActiveBg:       v("--bg-sel"),
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORDINAL_COL = /\bid\b|_id$|^id$|id$|Id$|ID$/i;
const SHARE_COL   = /pct|percent|share|rate|ratio|proportion/i;
// Temporal/grouping KEY columns (departure_month=6, departure_quarter=2, year=2024). These are
// labels, not measures: summing them is meaningless and metric-formatting turns a year into
// "2.02K". Treat as identifiers — render the raw value and exclude from the Σ totals.
const DIMENSION_KEY_COL = /(?<![a-z])(?:year|quarter|qtr|month|week|weekday|dow|day_of_week|hour|fiscal_period|period_no)(?![a-z])/i;

/** A present cell's words as the table shows them, and whether they are a figure (set in tabular numerals). The cells
 *  and the checklist of a column's values in its ▾ menu read the same words. */
function cellText(col: string, v: unknown): { text: string; figure: boolean } {
  const s = String(v);
  // Percentage columns: stored ratio (|v|≤1) ×100, else already a percentage.
  if (SHARE_COL.test(col)) {
    const n = Number(v);
    if (!isNaN(n)) return { text: formatPercent(n, 1), figure: true };
  }
  // Monetary columns — to the cent, with the currency symbol when one is known. A column that names
  // its own currency (refund_chf → CHF) overrides the workspace default. 359,224.30 read "359,224.3"
  // (2026-10-02): an amount that drops its last zero reads unlike the cents beside it.
  if (isMoneyColumn(col)) {
    const money = Number(v);
    if (!isNaN(money) && s.trim() !== "") return { text: formatMoney(money, columnCurrencySymbol(col)), figure: true };
  }
  // Large / numeric cells — the FULL number with separators, never K/M/B: a column is read
  // down, and a per-row magnitude suffix makes two cells incomparable at a glance. Skip key
  // columns (ids + temporal grouping keys) so a month "6" or year "2024" renders raw.
  const n = Number(v);
  if (!isNaN(n) && !ORDINAL_COL.test(col) && !DIMENSION_KEY_COL.test(col) && s.trim() !== "") {
    return { text: formatTableNumber(n), figure: true };
  }
  // Collapse a DATE_TRUNC'd midnight timestamp ("2025-04-01 00:00:00") to its date.
  return { text: displayCellValue(s), figure: false };
}

function fmt(col: string, v: unknown): React.ReactNode {
  if (v == null) {
    return <span style={{ color: "var(--t3)", userSelect: "none" }}>—</span>;
  }
  const { text, figure } = cellText(col, v);
  return figure ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{text}</span> : text;
}

// ── Core AugTable component ──────────────────────────────────────────────────

export function AugTable<T extends object = Record<string, unknown>>(
  { grid = false, ...props }: TableProps<T> & {
    /** Draw every cell's edges as the Spreadsheets grid does — a result's cells. A list of things leaves it off. */
    grid?: boolean;
  },
) {
  // Re-read the tokens whenever <html> changes skin or look: the stamp is its attributes.
  const stamp = useThemeStamp();
  const mode = stamp.startsWith("light") ? "light" : "dark";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the stamp IS the dependency: tokens are read from the page
  const rowHeight = useRowHeight();
  const antTheme = useMemo(() => buildAntTheme(mode, grid, rowHeight), [mode, stamp, grid, rowHeight]);
  return (
    <ConfigProvider theme={antTheme}>
      <Table<T>
        size="small"
        showSorterTooltip={false}
        bordered={grid}
        {...props}
      />
    </ConfigProvider>
  );
}

// ── SqlResultTable — converts raw SQL columns/rows ───────────────────────────

interface SqlResultTableProps {
  columns: string[];
  rows: unknown[][];
  maxHeight?: number;
  /** Extra column overrides, keyed by column name */
  columnOverrides?: Record<string, Partial<TableColumnsType<Record<string, unknown>>[number]>>;
  /** Show the "Σ Totals" on/off toggle (when there's at least one summable column). Default true. */
  totals?: boolean;
  /** Max rendered width (px) per cell — long text truncates with an ellipsis + tooltip. Default 320. */
  maxColWidth?: number;
  /** Names the CSV a reader downloads from the table's Copy / CSV actions. Default "table". */
  name?: string;
}

/** The column position a data key names: "c3" → 3. */
const colOfKey = (key: React.Key | undefined) => Number(String(key ?? "").slice(1));

export function SqlResultTable({
  columns,
  rows,
  maxHeight = 320,
  columnOverrides = {},
  totals = true,
  maxColWidth = 320,
  name = "table",
}: SqlResultTableProps) {
  // Re-render when org settings change (currency/date) so the inline cell formatting
  // below re-reads them — tables previously read at render but never subscribed.
  useOrgSettings();
  // Each column's ▾ — its two sorts, a checklist of its values, a condition — over the rows on the page. Every caller
  // shows a result's rows, so every one has it (measured 2026-11-09: the visual builder, a chat answer, a report's
  // exhibits, the catalog's and the Configure tab's samples, an object's linked rows, the fact-check, a chart card's
  // table, the calibration classes); a table of one row has nothing to sort or narrow, and draws none.
  const filterable = rows.length > 1;
  const [showTotals, setShowTotals] = useState(false);
  // The ▾ menus' state: one sort, a filter per column (by position), and which menu is open, under its arrow.
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const [colFilters, setColFilters] = useState<Record<number, ColumnFilter | undefined>>({});
  const [menu, setMenu] = useState<{ col: number; anchor: DOMRect } | null>(null);
  // The ▾ menu's own column actions (the user, 2026-11-09): pinned at the left, and how a number column is shown —
  // what its cells SHOW; copying, CSV and the filters read the values themselves.
  const [pinned, setPinned] = useState<number[]>([]);
  const [formats, setFormats] = useState<Record<number, NumberFormat>>({});
  const currency = effectiveCurrencySymbol();

  // A new result's columns are a new table: a filter or a sort on the old ones would point at nothing.
  const shape = columns.join("\u0000");
  useEffect(() => { setSort(null); setColFilters({}); setMenu(null); setPinned([]); setFormats({}); }, [shape]);

  // Each column's kind — text, number or date — for its sort, its conditions and the words of both.
  const kinds = useMemo(() => columns.map((_c, i) => columnKind(rows.map(r => (r as unknown[])[i]))), [columns, rows]);
  const filtering = Object.values(colFilters).some(isFiltering);
  // The rows on screen, by position in `rows`: the filters keep them, the sort orders them.
  const shownIdx = useMemo(
    () => sortRows(rows, filtering ? keptRows(rows, colFilters, kinds) : rows.map((_r, i) => i), sort, kinds),
    [rows, colFilters, kinds, sort, filtering],
  );
  const shownRows = useMemo(() => shownIdx.map(i => rows[i] as unknown[]), [shownIdx, rows]);

  // Per-column summable detection, over every row; the sums over the rows shown — a total under a filtered table
  // adds up what is above it, and says so.
  // Summable = every non-blank value is numeric, and the column is not an
  // identifier (id/_id) nor a share/percent/rate column (summing those is meaningless).
  const summable = useMemo(
    () =>
      columns.map((col, idx) => {
        if (ORDINAL_COL.test(col) || SHARE_COL.test(col) || DIMENSION_KEY_COL.test(col)) return false;
        let saw = false;
        for (const r of rows) {
          const v = (r as unknown[])[idx];
          if (v == null || v === "") continue;
          if (isNaN(Number(v))) return false;
          saw = true;
        }
        return saw;
      }),
    [columns, rows],
  );
  const sums = useMemo(
    () => summable.map((ok, idx) => (ok ? shownRows.reduce((a, r) => (r[idx] == null || r[idx] === "" ? a : a + Number(r[idx])), 0) : null)),
    [summable, shownRows],
  );
  const hasSummable = summable.some(Boolean);
  const firstTextCol = summable.findIndex(s => !s);

  // Build Ant Design column defs. Data keys are POSITIONAL (`c0`, `c1`, …), never the
  // column name: a result can legally carry two columns with the same name (a join, a
  // headerless import named 0,1,2…), and name-keyed rows silently collapsed the
  // duplicate's values (Object.fromEntries last-wins) while React warned about the
  // duplicate key. The name stays what the reader SEES; the position is what the
  // table is keyed by. (`columns.indexOf(col)` had the same disease — for a
  // duplicated name it always answered the FIRST occurrence.)
  const unordered: TableColumnsType<Record<string, unknown>> = columns.map((col, idx) => {
    const dataKey = sqlColKey(idx);
    const isNum = !ORDINAL_COL.test(col) && rows.length > 0 && isNumericValue(rows[0]?.[idx]);
    const sorted = sort?.col === idx ? sort.dir : null;
    const filtered = isFiltering(colFilters[idx]);
    // what shows at rest, and what only where the pointer is: the sort and the ▾ at the head's right edge, each drawn
    // while it is in force — a sort, a filter, an open menu — as the SQL Editor's grid does (the user, 2026-11-09)
    const onHover = "hidden group-hover:inline-flex group-focus-within:inline-flex";
    const open = menu?.col === idx;
    return {
      key: dataKey,
      fixed: pinned.includes(idx) ? ("left" as const) : undefined,
      onHeaderCell: () => ({ className: "group" }),
      title: (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span title={cleanLabel(col)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
            flex: "1 1 auto", textAlign: isNum ? "right" : "left" }}>
            {pinned.includes(idx) && <Icon name="pin" size={10} label="Pinned" />} {cleanLabel(col)}
          </span>
          {/* The sort: the head's own carets are not drawn (`sortIcon`); a click on the head sorts. */}
          <span aria-hidden className={sorted ? "inline-flex" : onHover}
            style={{ flexShrink: 0, color: sorted ? "var(--blue4)" : "var(--t3)" }}>
            <Icon name={sorted === "asc" ? "sortasc" : sorted === "desc" ? "sortdesc" : "sort"} size={13} />
          </span>
          {filterable && (
            <span className={filtered || open ? "inline-flex" : onHover} style={{ flexShrink: 0 }}>
              <ColumnFilterButton column={cleanLabel(col)} filtered={filtered} open={open}
                onOpen={anchor => setMenu(m => (m?.col === idx ? null : { col: idx, anchor }))} />
            </span>
          )}
        </span>
      ),
      dataIndex: dataKey,
      ellipsis: true,
      align: isNum ? "right" : "left",
      // The head still sorts on a click; the rows are sorted here, by the column's kind with blanks last
      // (`lib/query/columnFilter.ts`), so `sorter: true` only hands Ant the click.
      sorter: true,
      sortOrder: sorted === "asc" ? "ascend" : sorted === "desc" ? "descend" : null,
      sortIcon: () => null,
      render: (val: unknown) => (
        <span
          title={val == null ? undefined : String(val)}
          style={{
            display: "block", maxWidth: maxColWidth,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "var(--font-mono)", fontSize: 11,
          }}
        >
          {formats[idx] ? formatNumberAs(val, formats[idx], currency) : fmt(col, val)}
        </span>
      ),
      ...columnOverrides[col],
    };
  });
  // A pinned column is drawn first, in the order pinned, and stays at the left as the rest scroll under it.
  const antCols = [...pinned.map(i => unordered[i]).filter(Boolean), ...unordered.filter((_c, i) => !pinned.includes(i))];

  const allObjects = useMemo(() => sqlRowObjects(columns, rows as unknown[][]), [columns, rows]);
  const dataSource = useMemo(() => shownIdx.map(i => allObjects[i]), [shownIdx, allObjects]);

  const showToggle = totals && hasSummable && rows.length > 0;

  const summary =
    showToggle && showTotals
      ? () => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              {columns.map((col, i) => (
                <Table.Summary.Cell index={i} key={sqlColKey(i)} align={sums[i] !== null ? "right" : "left"}>
                  {sums[i] !== null ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>
                      {fmt(col, sums[i] as number)}
                    </span>
                  ) : i === firstTextCol ? (
                    <span style={{ color: "var(--t3)", fontWeight: 600 }}>{filtering ? "Total of those shown" : "Total"}</span>
                  ) : null}
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        )
      : undefined;

  const clearAll = () => { setColFilters({}); setMenu(null); };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          {showToggle && (<Button
            variant={showTotals ? "secondary" : "outline"} size="xs"
            onClick={() => setShowTotals(v => !v)}
            title="Show a totals row summing numeric columns"
          >
            Σ Totals {showTotals ? "on" : "off"}
          </Button>)}
          {/* Withheld is said: while a filter is on, how many rows it leaves of how many, and the way back to all. */}
          {filtering && (
            <>
              <span className="aug-fs-xs" data-testid="table-filtered" style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}>
                {filteredWords(shownRows.length, rows.length)}
              </span>
              <Button variant="ghost" size="xs" onClick={clearAll} data-testid="table-clear-filters">Clear filters</Button>
            </>
          )}
          {/* The rows shown, in the order shown — every one, raw: the grid pages a hundred at a time and its header is a
              separate table. Filtered, the actions say they take the rows shown. */}
          <div className="ml-auto">
            <TableActions name={name} read={() => ({ columns, rows: rawCells(shownRows) })}
              shown={filtering ? { rows: shownRows.length, of: rows.length } : undefined} />
          </div>
        </div>
      )}
      <AugTable<Record<string, unknown>>
        grid
        columns={antCols}
        dataSource={dataSource}
        scroll={{ x: "max-content", y: maxHeight }}
        pagination={dataSource.length > 100 ? { pageSize: 100, size: "small", showSizeChanger: false } : false}
        summary={summary}
        style={{ fontSize: 12 }}
        locale={filtering ? { emptyText: "No rows match these filters" } : undefined}
        onChange={(_p, _f, sorter, extra) => {
          if (extra.action !== "sort") return;
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          setSort(s?.order ? { col: colOfKey(s.columnKey), dir: s.order === "descend" ? "desc" : "asc" } : null);
        }}
      />
      {menu && filterable && menu.col < columns.length && (
        <ColumnFilterMenu
          key={`${shape}|${menu.col}`}
          column={cleanLabel(columns[menu.col])}
          kind={kinds[menu.col]}
          rows={rows}
          col={menu.col}
          only={filtering ? keptRows(rows, colFilters, kinds, menu.col) : undefined}
          filter={colFilters[menu.col]}
          filtered={isFiltering(colFilters[menu.col])}
          sortDir={sort?.col === menu.col ? sort.dir : null}
          label={v => cellText(columns[menu.col], v).text}
          anchor={menu.anchor}
          onCopyName={() => { navigator.clipboard?.writeText(columns[menu.col]).catch(() => {}); }}
          pinned={pinned.includes(menu.col)}
          onPin={() => setPinned(p => (p.includes(menu.col) ? p.filter(x => x !== menu.col) : [...p, menu.col]))}
          format={formats[menu.col] ?? ""}
          onFormat={kinds[menu.col] === "number" ? f => setFormats(m => ({ ...m, [menu.col]: f })) : undefined}
          currency={currency}
          onSort={dir => setSort({ col: menu.col, dir })}
          onApply={f => setColFilters(prev => ({ ...prev, [menu.col]: f ?? undefined }))}
          onClear={() => setColFilters(prev => ({ ...prev, [menu.col]: undefined }))}
          onClose={() => setMenu(null)}
        />
      )}
      {/* Said once, beside the amounts it is about: a money column whose dataset's currency no person has
          confirmed prints plain, never under a default "$" (2026-10-23, the Olist study's Gap 14). */}
      {rows.length > 0 && columns.some(c => isMoneyColumn(c) && !currencyFromColumn(c)) && unconfirmedCurrencyNote() && (
        <span className="aug-fs-xs" data-testid="table-currency-note" style={{ color: "var(--t3)" }}>
          {unconfirmedCurrencyNote()}
        </span>
      )}
    </div>
  );
}
