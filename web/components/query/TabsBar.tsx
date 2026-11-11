"use client";

/**
 * SE-2 PR D — editor tabs, persisted per connection.
 *
 * Tabs live in `localStorage["aug.sqledit.tabs:<connId>"]`, capped at 20 with LRU
 * eviction. Per connection rather than globally because a tab holds SQL written
 * against a specific warehouse's tables — carrying it to another connection would
 * offer the user a query that cannot run.
 *
 * The cap exists because this is unbounded user input in a bounded store: without it
 * a heavy session eventually throws QuotaExceededError on write, and the failure would
 * surface as "my tabs stopped saving" long after the cause.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Dot } from "@/components/clarity/kit";
import { queryTabName } from "@/lib/format";
import type { ParamDef, ParamValue } from "@/lib/query/paramDefs";
import { Input } from "@/components/ui/input";

export interface EditorTab {
  id: string;
  name: string;
  sql: string;
  savedQueryId?: string;
  /** Last run outcome, for the per-tab status chip. */
  status?: "ok" | "error";
  /** SE-4 H — values for this tab's `:name` parameters, persisted with the draft.
   *  Per TAB, not per editor: two tabs may both use `:region` and mean different
   *  things, and a shared value would silently rewrite the other tab's query.
   *  SE-8C widened a value to `string | string[]` — the array is a multiselect. */
  params?: Record<string, ParamValue>;
  /** SE-8C — how each parameter renders as a widget. Rides the tab (and the saved
   *  query, as `param_defs`) so a configured dropdown survives a reload. */
  paramDefs?: Record<string, ParamDef>;
  /** SE-8A — the row cap this tab runs with; absent means the 500 default. Part of
   *  the tab, not the editor: the limit describes the QUERY ("show me everything in
   *  this small dimension table"), and carrying it across tabs would silently cap or
   *  uncap a different query. */
  limit?: number;
  /** SE-8A — when set, Run and ⌘↵ run every statement in order. ⌘⇧↵ stays the
   *  single-statement escape hatch either way. */
  runAll?: boolean;
  /** Epoch ms of last activity — the LRU key. */
  touched: number;
}

const MAX_TABS = 20;
const VERSION = 1;
interface TabStore { v: number; tabs: EditorTab[]; activeId: string }

function key(connId: string): string {
  return `aug.sqledit.tabs:${connId}`;
}

export function readTabs(connId: string): TabStore | null {
  try {
    const raw = localStorage.getItem(key(connId));
    if (!raw) return null;
    const s = JSON.parse(raw) as TabStore;
    return s && s.v === VERSION && Array.isArray(s.tabs) ? s : null;
  } catch { return null; }
}

export function writeTabs(connId: string, tabs: EditorTab[], activeId: string): void {
  try {
    // LRU: keep the most recently touched, always including the active one.
    const kept = [...tabs]
      .sort((a, b) => b.touched - a.touched)
      .slice(0, MAX_TABS);
    if (activeId && !kept.some(t => t.id === activeId)) {
      const active = tabs.find(t => t.id === activeId);
      if (active) kept[kept.length - 1] = active;
    }
    // Preserve the user's visible ORDER rather than the LRU order — a bar that
    // reshuffled itself on every run would be unusable.
    const ordered = tabs.filter(t => kept.some(k => k.id === t.id));
    localStorage.setItem(key(connId), JSON.stringify({ v: VERSION, tabs: ordered, activeId }));
  } catch { /* storage full or disabled — tabs stay in memory for this session */ }
}

export function newTab(name = queryTabName()): EditorTab {
  return {
    // crypto.randomUUID is available in every browser this app targets; the fallback
    // keeps a non-secure context (plain http on a LAN) from throwing.
    id: globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`,
    name,
    sql: "",
    touched: Date.now(),
  };
}

/** The open tab's look: cut from the editor's own surface, over the strip's foot line, with its own line beneath it. */
const OPEN_TAB: React.CSSProperties = {
  background: "var(--bg-0)", marginBottom: -1, boxShadow: "inset 0 -2px 0 var(--t1)", color: "var(--t1)", fontWeight: 500,
};

export function TabsBar({
  tabs, activeId, onSelect, onNew, onClose, onRename, trailing, onOpenExisting, startLabel,
}: {
  tabs: EditorTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** Controls that ride on the RIGHT of the tab strip rather than in a bar of their
   *  own. The editor had four stacked horizontal bars above the code; a reference
   *  console has two, and the difference was rows that each carried three controls.
   *  Anything a tab does not own — the connection, the saved state — comes in here. */
  trailing?: React.ReactNode;
  /** SE-8F — when present, "+" opens a two-option menu (new / open existing)
   *  instead of creating immediately. */
  onOpenExisting?: () => void;
  /** With no query tab open, the strip still has its open tab: the start page's, under this name — never closed or
   *  renamed, and gone when a query tab opens (the user, 2026-11-09, choosing a reference console's start page). */
  startLabel?: string;
}) {
  const [editing, setEditing] = useState("");
  const [draftName, setDraftName] = useState("");
  const [plusMenu, setPlusMenu] = useState(false);

  const commit = useCallback(() => {
    if (editing && draftName.trim()) onRename(editing, draftName.trim());
    setEditing("");
  }, [editing, draftName, onRename]);

  useEffect(() => { if (!editing) setDraftName(""); }, [editing]);

  // Folder tabs (the user, 2026-11-09, choosing the third of three reference styles: "the tabs dont look like tabs to
  // me"): the open query's tab is cut from the editor's own surface and joins it, with a strong line at its foot; the
  // others sit on a grey strip, divided by a line. Each tab is one target — its name selects it, a double-click renames
  // it, its × closes it — not a chip beside a separate button.
  const moveFocus = (from: string, step: 1 | -1) => {
    const i = tabs.findIndex(t => t.id === from);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    if (next) document.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };
  return (
    <div
      style={{
        display: "flex", alignItems: "stretch", minHeight: 36, background: "var(--bg-1)",
        borderBottom: "1px solid var(--b1)", flexShrink: 0,
      }}
    >
      <div role="tablist" aria-label="Open queries" style={{ display: "flex", alignItems: "stretch", minWidth: 0 }}>
      {tabs.length === 0 && startLabel && (
        <div role="tab" aria-selected tabIndex={0} data-testid="sql-start-tab" className="aug-folder-tab aug-fs-ui"
          style={{ display: "flex", alignItems: "center", flexShrink: 0, padding: "0 12px",
            borderRight: "1px solid var(--b1)", ...OPEN_TAB }}>
          {startLabel}
        </div>
      )}
      {tabs.map(t => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            role="tab"
            data-tab-id={t.id}
            aria-selected={active}
            // its name, and a failed last run — never the × beside it or the dot's title read as part of the name
            aria-label={t.status === "error" ? `${t.name}, the last run failed` : t.name}
            tabIndex={active ? 0 : -1}
            title="Double-click to rename"
            className="aug-folder-tab aug-fs-ui"
            onClick={() => { if (editing !== t.id) onSelect(t.id); }}
            onDoubleClick={() => { setEditing(t.id); setDraftName(t.name); }}
            onKeyDown={e => {
              if (editing === t.id) return;
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(t.id); }
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                moveFocus(t.id, e.key === "ArrowRight" ? 1 : -1);
              }
            }}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer",
              padding: "0 4px 0 12px", borderRight: "1px solid var(--b1)",
              ...(active ? OPEN_TAB : { color: "var(--t3)", fontWeight: 400 }),
            }}
          >
            {editing === t.id ? (
              <Input bespoke
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onBlur={commit}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing("");
                }}
                style={{ fontSize: 13, width: 110 }}
              />
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                {/* The last run's outcome as a mark — colour carries it, the title names it. */}
                {t.status === "error" && <Dot hue="red" title="The last run failed" />}
                {t.status === "ok" && <Dot hue="green" title="The last run succeeded" />}
                {t.name}
              </span>
            )}
            {/* Every tab closes, the last one too: with none open, the editor area is the start page. */}
            <Button
              variant="plain"
              size="xs"
              className="aug-fs-ui"
              title="Close tab"
              aria-label={`Close ${t.name}`}
              tabIndex={active ? 0 : -1}
              onClick={e => { e.stopPropagation(); onClose(t.id); }}
              style={{ color: "var(--t3)", padding: "0 4px" }}
            >
              ×
            </Button>
          </div>
        );
      })}
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 6px" }}>
      {onOpenExisting ? (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Button variant="plain" size="xs" className="aug-fs-ui"
            onClick={() => setPlusMenu(v => !v)} title="New tab" style={{ color: "var(--t3)" }}>
            <Icon name="plus" size={13} />
          </Button>
          {plusMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setPlusMenu(false)} />
              <div className="aug-fs-ui" style={{
                position: "absolute", top: "100%", left: 0, zIndex: 41, marginTop: 4,
                minWidth: 170, padding: 5, background: "var(--bg-2)",
                border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
              }}>
                <Button variant="plain" size="xs" className="aug-fs-ui"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => { setPlusMenu(false); onNew(); }}>
                  New query
                </Button>
                <Button variant="plain" size="xs" className="aug-fs-ui"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => { setPlusMenu(false); onOpenExisting(); }}>
                  Open existing…
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <Button variant="plain" size="xs" className="aug-fs-ui" onClick={onNew} title="New tab" style={{ color: "var(--t3)" }}>
          <Icon name="plus" size={13} />
        </Button>
      )}
      </div>
      {trailing && (
        <>
          <div style={{ flex: 1, minWidth: 8 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "4px 6px" }}>{trailing}</div>
        </>
      )}
    </div>
  );
}
