"use client";

/**
 * ONE catalog row — a catalog, a schema, a table, a column — for every tree that shows a warehouse.
 *
 * It was the Catalog screen's own (`CatalogScreen.tsx`), and the SQL Editor's rail drew the same three things in its
 * own sizes: 14px monospace names against the Catalog's 13px, a 14px count against its 11px, other paddings. The user,
 * 2026-11-10, of the SQL Editor's rail beside the Catalog's: "in the format/font/size exact as the catalog.. no change
 * at all". So both draw this row, and a schema looks the same whichever tab it is in.
 *
 * A row is one click target (`onClick`) with its chevron a second (`onToggle`). Whatever a surface adds at the row's
 * right end — the SQL Editor's `»`, a join degree, the builder's add buttons — goes in `trailing`, whose clicks stop at
 * it so they never also act as the row. The row takes focus and answers Enter and Space, so a keyboard reaches what
 * a pointer does.
 */
import type { CSSProperties, DragEvent, ReactNode } from "react";

import { Chevron } from "@/components/icons/catalog";

export function TreeRow({
  depth, icon, label, badge, count, isOpen, isSelected, hasChildren, onClick, onToggle,
  title, className, trailing, draggable, onDragStart, testId,
}: {
  depth:       number;
  icon:        ReactNode;
  label:       string;
  badge?:      ReactNode;
  count?:      number | string | null;
  isOpen?:     boolean;
  isSelected?: boolean;
  hasChildren?: boolean;
  onClick?:    () => void;
  onToggle?:   () => void;
  /** What clicking the row does, said on hover. */
  title?:      string;
  /** A hover group for what `trailing` reveals (`group/tbl`). */
  className?:  string;
  /** Controls at the row's right end, after the count; their clicks stay theirs. */
  trailing?:   ReactNode;
  draggable?:  boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  testId?:     string;
}) {
  const style: CSSProperties = {
    display: "flex", alignItems: "center", gap: 7,
    padding: `6px 10px 6px ${10 + depth * 15}px`,
    cursor: draggable ? "grab" : "pointer", userSelect: "none",
    background: isSelected ? "rgba(45,114,210,0.11)" : "transparent",
    borderLeft: `2px solid ${isSelected ? "var(--blue3)" : "transparent"}`,
    transition: "background .08s", minWidth: 0,
  };
  return (
    <div
      onClick={onClick}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); }
        else if (hasChildren && ((e.key === "ArrowRight" && !isOpen) || (e.key === "ArrowLeft" && isOpen))) { e.preventDefault(); onToggle?.(); }
      }}
      tabIndex={onClick || onToggle ? 0 : undefined}
      title={title}
      className={className}
      data-testid={testId}
      draggable={draggable}
      onDragStart={onDragStart}
      style={style}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {hasChildren ? (
        <span onClick={e => { e.stopPropagation(); onToggle?.(); }} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          title={isOpen ? "Collapse" : "Expand"}>
          <Chevron open={!!isOpen} />
        </span>
      ) : <span style={{ width: 10, flexShrink: 0 }} />}

      <span style={{ color: isSelected ? "var(--blue4)" : "var(--t3)", display: "flex", alignItems: "center" }}>{icon}</span>

      <span style={{
        fontSize: 13, flex: 1, minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: isSelected ? "var(--t1)" : "var(--t2)", fontWeight: isSelected ? 500 : 400,
      }}>
        {label}
      </span>

      {badge}

      {count != null && count !== "" && (
        <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>
          {count}
        </span>
      )}

      {trailing && (
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {trailing}
        </span>
      )}
    </div>
  );
}
