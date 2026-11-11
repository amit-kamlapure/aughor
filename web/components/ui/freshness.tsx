"use client";

/**
 * Cached or live — said on every figure (2026-11-10, ROADMAP §6 item 64; the Evidence → Action mockups). A figure read
 * just now says "Live · read Mon 9 Nov at 19:40 UTC"; one kept from an earlier read says "Cached · measured Sun 8 Nov at
 * 22:28 UTC"; one whose read time is not known says so rather than looking fresh. With a receipt, its short id rides
 * along — the run that produced the figure, one click from its SQL.
 *
 * The time is UTC and says so: two figures read hours apart on a dataset that rewrites itself (theLook) must be told
 * apart by their times, not guessed at.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { utcDayWords } from "@/lib/format";

export type FreshnessState = "live" | "cached" | "unknown";

export function Freshness({ state, at, receipt, verb, onReceipt }: {
  state: FreshnessState;
  /** When it was read (ISO). */
  at?: string | null;
  /** The run's receipt, when there is one. */
  receipt?: string | null;
  /** The word for the read: "read" (default for live), "measured" (default for cached), "written". */
  verb?: string;
  onReceipt?: (receipt: string) => void;
}) {
  const when = utcDayWords(at, true);
  const word = verb ?? (state === "cached" ? "measured" : "read");
  const label = state === "unknown" || !when
    ? (state === "live" ? "Live · read time not kept" : state === "cached" ? "Cached · read time not kept" : "Freshness not known")
    : `${state === "live" ? "Live" : "Cached"} · ${word} ${when}`;
  return (
    <span className="aug-freshness">
      <Badge variant={state === "live" ? "green" : "secondary"} title={at ? `Read at ${at}` : undefined}>
        <Icon name={state === "live" ? "check" : "clock"} size={12} />
        {label}
      </Badge>
      {receipt && (
        onReceipt
          ? <Button variant="link" size="xs" className="aug-freshness-receipt aug-mono" onClick={() => onReceipt(receipt)}
              title="Open the run's receipt">{receipt.slice(0, 8)}</Button>
          : <span className="aug-freshness-receipt aug-mono" title={`Receipt ${receipt}`}>{receipt.slice(0, 8)}</span>
      )}
    </span>
  );
}
