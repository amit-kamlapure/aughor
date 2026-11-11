/**
 * The SQL Editor's Format puts on one line what fits on one line (the user, 2026-11-09: "The formatted is worse than
 * unformatted?"). `sql-formatter` alone laid the user's 9-line statement out over 98 lines, a token a line.
 */
import { describe, expect, it } from "vitest";
import { format } from "sql-formatter";

import { DEFAULT_FORMAT_PREFS, formatSql } from "@/lib/query/format";
import { relayout } from "@/lib/query/sqlLayout";

const USERS = `SELECT * FROM (SELECT * FROM (SELECT platform, ROUND((CAST((CAST((100 * (CAST(SUM(CASE WHEN order_date >= '2026-09-01' AND order_date < '2026-10-01' THEN gmv_eur END) AS DOUBLE PRECISION) / NULLIF(NULLIF(NULLIF(SUM(CASE WHEN order_date >= '2026-08-01' AND order_date < '2026-09-01' THEN gmv_eur END), 0), 0), 0) - 1)) AS DECIMAL(18, 3))) AS DECIMAL(18, 3)))::numeric, 1) AS mom_pct, ROUND((CAST((CAST((100 * (CAST(SUM(CASE WHEN order_date >= '2026-09-01' AND order_date < '2026-10-01' THEN gmv_eur END) AS DOUBLE PRECISION) / NULLIF(NULLIF(NULLIF(SUM(CASE WHEN order_date >= '2025-09-01' AND order_date < '2025-10-01' THEN gmv_eur END), 0), 0), 0) - 1)) AS DECIMAL(18, 3))) AS DECIMAL(18, 3)))::numeric, 1) AS yoy_pct FROM orders WHERE platform IN ('Mytheresa', 'NET-A-PORTER', 'MR PORTER', 'YOOX') GROUP BY 1 ORDER BY 2 DESC NULLS LAST) AS __q LIMIT 501) AS __q LIMIT 501`;

const pg = (sql: string, width: 80 | 100 | 120 = 100) =>
  formatSql(sql, { dialect: "postgres" }, { ...DEFAULT_FORMAT_PREFS, lineWidth: width });
const lines = (s: string) => s.split("\n");
const bare = (s: string) => s.replace(/\s+/g, "");

describe("Format puts on one line what fits on one line", () => {
  it("lays the user's statement out in a third of the lines, none past the width, changing only whitespace", () => {
    const before = format(USERS, { language: "postgresql", keywordCase: "upper", tabWidth: 2 });
    const after = pg(USERS);
    expect(lines(before)).toHaveLength(98);
    expect(lines(after).length).toBeLessThanOrEqual(36);
    expect(Math.max(...lines(after).map(l => l.length))).toBeLessThanOrEqual(100);
    expect(bare(after)).toBe(bare(USERS));
    // a single target stays with its keyword (sqlfluff LT09); a subquery's bracket with its keyword (pgFormatter)
    expect(lines(after).slice(0, 4)).toEqual(["SELECT *", "FROM (", "  SELECT *", "  FROM ("]);
    expect(lines(after).slice(-8)).toEqual(["    FROM orders",
      "    WHERE platform IN ('Mytheresa', 'NET-A-PORTER', 'MR PORTER', 'YOOX')", "    GROUP BY 1",
      "    ORDER BY 2 DESC NULLS LAST", "  ) AS __q", "  LIMIT 501", ") AS __q", "LIMIT 501"]);
    // a CASE that fits is one line; a lone inner group hugs its brackets, its closers on one line (Prettier)
    expect(after).toContain("WHEN order_date >= '2026-09-01' AND order_date < '2026-10-01' THEN gmv_eur");
    expect(after).toContain("ROUND((CAST((CAST((100 * (CAST(");
    expect(after).toContain(") - 1)) AS DECIMAL(18, 3))) AS DECIMAL(18, 3)))::numeric, 1) AS mom_pct,");
  });

  it("keeps a short statement's clauses one a line, each on its keyword's line", () => {
    expect(pg("select a, b from t where x = 1 and y = 2 order by a")).toBe(
      "SELECT a, b\nFROM t\nWHERE x = 1 AND y = 2\nORDER BY a");
  });

  it("puts each target on its own line when they do not fit on one, and keeps the short ones whole", () => {
    const cols = Array.from({ length: 12 }, (_, i) => `a_rather_long_column_name_${i}`).join(", ");
    const out = lines(pg(`select ${cols}, coalesce(x, 0) as x from t`));
    expect(out[0]).toBe("SELECT");
    expect(out).toContain("  coalesce(x, 0) AS x");
    expect(out.filter(l => l.startsWith("  a_rather_long_column_name_"))).toHaveLength(12);
  });

  it("keeps a WITH that fits on its line, hugs one that does not to its bracket, and a subquery that fits inline", () => {
    expect(lines(pg("with x as (select id, sum(v) as v from t group by id) select * from x where id in (select id from y)")))
      .toEqual(["WITH x AS (SELECT id, sum(v) AS v FROM t GROUP BY id)", "SELECT *", "FROM x",
        "WHERE id IN (SELECT id FROM y)"]);
    const long = lines(pg("with orders_by_customer as (select customer_id, count(*) as orders, sum(amount) as amount "
      + "from orders where status = 'delivered' group by customer_id) select * from orders_by_customer"));
    expect(long[0]).toBe("WITH orders_by_customer AS (");
    expect(long).toContain(")");
    expect(long.slice(-2)).toEqual(["SELECT *", "FROM orders_by_customer"]);
  });

  it("answers the line width the person chose", () => {
    const wide = pg(USERS, 120);
    const narrow = pg(USERS, 80);
    expect(lines(narrow).length).toBeGreaterThan(lines(wide).length);
    expect(Math.max(...lines(narrow).map(l => l.length))).toBeLessThanOrEqual(80);
  });

  it("leaves a statement holding a comment, a broken string or a dollar-quoted body as sql-formatter laid it out", () => {
    for (const sql of [
      "select a, -- the key\n b from t",
      "select a, b from t where note = 'line one\nline two'",
      "select $$ a\n b $$ as body, c from t",
    ]) {
      const formatted = format(sql, { language: "postgresql", keywordCase: "upper", tabWidth: 2 });
      expect(relayout(formatted)).toBe(formatted);
    }
  });

  it("keeps statements apart, and an unparseable buffer as it was typed", () => {
    expect(pg("select a from t; select b from u")).toBe("SELECT a\nFROM t;\n\nSELECT b\nFROM u");
    expect(pg("select (a from")).toBe("select (a from");
  });
});
