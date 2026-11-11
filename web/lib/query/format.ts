/**
 * SE-2 PR C — SQL formatting, dialect-aware.
 *
 * Uses the same engine mapping as the editor's tokenizer (`dialect.ts`), so the
 * formatter and the highlighter never disagree about what dialect this connection
 * speaks — sql-formatter ships both `duckdb` and `postgresql`, and picking the wrong
 * one silently mangles dialect-specific syntax.
 *
 * Formatting NEVER throws. A buffer mid-edit is frequently unparseable, and ⌘⇧F on a
 * half-typed statement must be a no-op, not an error dialog — the user's text is
 * returned unchanged and they keep typing.
 */
import { format as sqlFormat, supportedDialects, type SqlLanguage } from "sql-formatter";
import { formatterLanguage, type EngineHint } from "@/lib/query/dialect";
import { relayout } from "@/lib/query/sqlLayout";

/** The library's OWN list, not a hand-copied one — a hardcoded set would drift the
 *  moment sql-formatter adds or renames a dialect, and drift here means silently
 *  formatting DuckDB as generic SQL. */
const SUPPORTED = new Set<string>(supportedDialects);

// ── SE-8F — formatting preferences ────────────────────────────────────────────
//
// These live in localStorage behind a small menu on the Format button. The point: the
// formatter's OPINIONS are the user's, not the app's — a team that writes lowercase
// keywords should not have ⌘⇧F shouting at them.

export interface FormatPrefs {
  keywordCase: "upper" | "lower" | "preserve";
  functionCase: "upper" | "lower" | "preserve";
  tabWidth: 2 | 4;
  /** How long a line may be before what is on it breaks (`sqlLayout.relayout`): what fits stays on one line. */
  lineWidth: 80 | 100 | 120;
}

export const DEFAULT_FORMAT_PREFS: FormatPrefs = {
  // Upper keywords + two-space indent were the previous hardcoded behaviour, so a user
  // who never opens the menu formats exactly as before this wave.
  keywordCase: "upper",
  functionCase: "preserve",
  tabWidth: 2,
  lineWidth: 100,
};

const PREFS_KEY = "aug.sqledit.format";

export function readFormatPrefs(): FormatPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_FORMAT_PREFS;
    const p = JSON.parse(raw) as Partial<FormatPrefs>;
    return {
      keywordCase: p.keywordCase === "lower" || p.keywordCase === "preserve" ? p.keywordCase : "upper",
      functionCase: p.functionCase === "upper" || p.functionCase === "lower" ? p.functionCase : "preserve",
      tabWidth: p.tabWidth === 4 ? 4 : 2,
      lineWidth: p.lineWidth === 80 || p.lineWidth === 120 ? p.lineWidth : 100,
    };
  } catch { return DEFAULT_FORMAT_PREFS; }
}

export function writeFormatPrefs(p: FormatPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* stays session-local */ }
}

export function formatSql(
  sql: string,
  engine: EngineHint | null | undefined,
  prefs: FormatPrefs = readFormatPrefs(),
): string {
  if (!sql.trim()) return sql;
  const mapped = formatterLanguage(engine);
  const language = (SUPPORTED.has(mapped) ? mapped : "sql") as SqlLanguage;
  try {
    // `sql-formatter` tokenises, cases and breaks the clauses; the second pass puts on one line what fits on one line —
    // its own output put every CASE, and every bracket around one, a token a line (the user, 2026-11-09)
    return relayout(sqlFormat(sql, {
      language,
      ...(prefs.keywordCase !== "preserve" ? { keywordCase: prefs.keywordCase } : {}),
      ...(prefs.functionCase !== "preserve" ? { functionCase: prefs.functionCase } : {}),
      tabWidth: prefs.tabWidth,
      linesBetweenQueries: 1,
    }), { width: prefs.lineWidth ?? 100, step: prefs.tabWidth });
  } catch {
    // Unparseable mid-edit text is the common case, not an exceptional one.
    return sql;
  }
}
