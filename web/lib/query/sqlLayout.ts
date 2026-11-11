/**
 * A second pass over `sql-formatter`'s output that puts on one line what fits on one line (the user, 2026-11-09: "The
 * formatted is worse than unformatted? Lets pull up some logic from available SQL formatters").
 *
 * `sql-formatter` breaks every CASE onto several lines, and every bracket holding a broken thing breaks too, so a
 * generated statement of nested CASTs came out one token a line, 98 lines for 9 lines of SQL. Its `expressionWidth`
 * cannot help: 50, 80 or 100, the same 98 lines. What the established formatters do instead, taken here:
 *
 * - **A group fits or it breaks** (Prettier's printer, after Wadler's "prettier printer"): a bracketed group, a CASE or a
 *   clause is put on one line when the whole of it fits the line width; otherwise it breaks, and each of its parts is
 *   asked the same question in turn. Short things stay short wherever the long thing around them is.
 * - **A lone inner group hugs its brackets** (Prettier's last-argument hugging): `(CAST(` rather than `(` and `CAST(`
 *   on two lines, its closing brackets joining on one line.
 * - **One target stays with its keyword** (sqlfluff's LT09): `SELECT *`, `FROM orders`, `LIMIT 501`.
 * - **A subquery's bracket stays with its keyword** (pgFormatter, sqlfluff): `FROM (` … `) AS __q`.
 *
 * Whitespace only: the pass moves line breaks and indentation and nothing else, and checks so — whatever it would
 * return is compared with its input stripped of whitespace, and on any difference the input is returned as it was.
 * A statement holding a comment, a string over several lines or a dollar-quoted body is left as `sql-formatter` laid it
 * out: joining lines there would swallow code into a comment or change a literal.
 */

type Node =
  | { kind: "line"; text: string }
  /** A bracket chain — `f(` body `) / g(` body `)` — or a CASE … END: heads around bodies, one more head than bodies. */
  | { kind: "chain"; heads: string[]; bodies: Node[][] }
  /** A clause — its keyword, then what it holds — with no closing line. */
  | { kind: "clause"; head: string; body: Node[] }
  /** Lines one item spans: a condition and the `AND …`/`OR …` lines that continue it. */
  | { kind: "run"; parts: Node[] };

interface Line { indent: number; text: string }

const opens = (t: string) => t.endsWith("(") || /^case$/i.test(t) || /\scase$/i.test(t);
const closes = (t: string) => t.startsWith(")") || /^end\b/i.test(t);
const continues = (t: string) => /^(and|or)\b/i.test(t);

/** Two pieces on one line: no space inside a bracket, or before a comma or a closing bracket. */
function join(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.endsWith("(") || b.startsWith(")") || b.startsWith(",") ? a + b : `${a} ${b}`;
}

function parseItems(lines: Line[], at: { i: number }, indent: number): Node[] {
  const items: Node[] = [];
  while (at.i < lines.length && lines[at.i].indent === indent) {
    const line = lines[at.i];
    if (closes(line.text)) break;                      // the closer of the group this list is the body of
    at.i += 1;
    const deeper = at.i < lines.length && lines[at.i].indent > indent;
    let node: Node = { kind: "line", text: line.text };
    if (deeper && opens(line.text)) {
      const heads = [line.text];
      const bodies: Node[][] = [];
      for (;;) {
        bodies.push(parseItems(lines, at, lines[at.i].indent));
        const next = lines[at.i];
        if (!next || next.indent !== indent || !closes(next.text)) {
          heads.push("");                               // a group with no closer at its level: kept as it stood
          break;
        }
        heads.push(next.text);
        at.i += 1;
        if (!(opens(next.text) && at.i < lines.length && lines[at.i].indent > indent)) break;
      }
      node = { kind: "chain", heads, bodies };
    } else if (deeper) {
      node = { kind: "clause", head: line.text, body: parseItems(lines, at, lines[at.i].indent) };
    }
    const prev = items[items.length - 1];
    if (prev && continues(line.text)) {
      items[items.length - 1] = prev.kind === "run" ? { kind: "run", parts: [...prev.parts, node] } : { kind: "run", parts: [prev, node] };
    } else {
      items.push(node);
    }
  }
  return items;
}

function flat(n: Node): string {
  switch (n.kind) {
    case "line": return n.text;
    case "run": return n.parts.map(flat).reduce(join, "");
    case "clause": return join(n.head, n.body.map(flat).reduce(join, ""));
    case "chain": {
      let out = n.heads[0];
      n.bodies.forEach((b, k) => { out = join(join(out, b.map(flat).reduce(join, "")), n.heads[k + 1]); });
      return out;
    }
  }
}

/** What a short trailing argument may be and still ride on its group's closing line — `0` of `NULLIF(…, 0)`. */
const SHORT_TAIL = 16;

/** ``n`` at ``depth``, as lines. ``prefix`` is what its first line follows (a hugging bracket, a clause's keyword);
 *  ``suffix`` what its last line is followed by (the brackets it closes) — both counted when asking whether it fits. */
function render(n: Node, depth: number, step: number, width: number, prefix = "", suffix = ""): string[] {
  const pad = " ".repeat(depth * step);
  const whole = join(join(prefix, flat(n)), suffix);
  if (pad.length + whole.length <= width || n.kind === "line") return [pad + whole];
  const last = (lines: string[]) => { lines[lines.length - 1] = join(lines[lines.length - 1], suffix); return lines; };
  if (n.kind === "run") {
    const parts = n.parts;
    return [...render(parts[0], depth, step, width, prefix),
      ...parts.slice(1, -1).flatMap(p => render(p, depth, step, width)),
      ...(parts.length > 1 ? render(parts[parts.length - 1], depth, step, width, "", suffix) : [])];
  }
  if (n.kind === "clause") {
    // one target stays with its keyword (`FROM (`, `SELECT ROUND(`); more go one a line under it
    if (n.body.length === 1) return render(n.body[0], depth, step, width, join(prefix, n.head), suffix);
    return last([pad + join(prefix, n.head), ...n.body.flatMap(b => render(b, depth + 1, step, width))]);
  }
  // a chain with one body. Its group hugs the brackets — `(CAST(` … `)) AS x` — when it is the body's one item, or its
  // first with only short ones after (`NULLIF(NULLIF(` … `), 0), 0)`); a query never hugs: it breaks in its own
  // indentation
  if (n.bodies.length === 1 && n.heads[1] !== "") {
    const [first, ...rest] = n.bodies[0];
    const tail = rest.map(flat).reduce(join, "");
    if (first && first.kind === "chain" && rest.every(r => r.kind === "line") && tail.length <= SHORT_TAIL) {
      return render(first, depth, step, width, join(prefix, n.heads[0]), join(join(tail, n.heads[1]), suffix));
    }
  }
  // otherwise each body under its head, one level in, and each head at the chain's own level
  const out = [pad + join(prefix, n.heads[0])];
  n.bodies.forEach((b, k) => {
    out.push(...b.flatMap(item => render(item, depth + 1, step, width)));
    if (n.heads[k + 1]) out.push(pad + n.heads[k + 1]);
  });
  return last(out);
}

/** Whether a statement may be laid out again: no comment, and no string literal broken over lines. */
function movable(lines: string[]): boolean {
  // a dollar-quoted body (`$$ … $$`, `$fn$ … $fn$`) may span lines, and its lines are its value
  if (lines.some(l => /\$[A-Za-z_]*\$/.test(l))) return false;
  for (const line of lines) {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "'") quoted = !quoted;
      else if (!quoted && ((ch === "-" && line[i + 1] === "-") || (ch === "/" && line[i + 1] === "*"))) return false;
    }
    if (quoted) return false;
  }
  return true;
}

const bare = (s: string) => s.replace(/\s+/g, "");

/** `formatted` — `sql-formatter`'s output — with what fits on a line put on one line. `step` is its indent width. */
export function relayout(formatted: string, { width = 100, step = 2 }: { width?: number; step?: number } = {}): string {
  const blocks = formatted.split(/\n\s*\n/);
  const out = blocks.map(block => {
    const raw = block.split("\n");
    if (!movable(raw)) return block;
    const lines = raw.filter(l => l.trim()).map(l => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
    if (!lines.length) return block;
    const at = { i: 0 };
    const items: Node[] = [];
    while (at.i < lines.length) {
      const before = at.i;
      items.push(...parseItems(lines, at, lines[at.i].indent));
      if (at.i === before) items.push({ kind: "line", text: lines[at.i++].text });   // a stray closer: kept
    }
    // a statement's clauses each start a line; what is inside each is laid out to fit
    const laid = items.flatMap(n => render(n, Math.round(lines[0].indent / step), step, width)).join("\n");
    return bare(laid) === bare(block) ? laid : block;
  });
  return out.join("\n\n");
}
