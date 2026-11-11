"use client";

/**
 * How an entity is drawn on the Business Atlas, on the entity's own page: the shape, always shown, and — while a
 * person is editing — the catalogue of every shape there is, to choose from.
 *
 * A person chooses a SHAPE, not a word from a taxonomy: a depot, a cluster, a contract. What the entity is on the
 * Atlas follows from the shape, and a person's choice is used before any package's word. It changes the picture and
 * nothing an agent or a query reads; like every change a person makes to the ontology it waits in the draft, where the
 * editing screens already show it.
 */
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { roleOfShape, shapeCatalogue, SHAPES, type Role, type Shape } from "@/lib/atlas/compose";
import { chooseEntityShape, type ObjectTypeDetail } from "@/lib/objectTypes";

import { AtlasDefs, DRAW, Pen, type Projection } from "./atlas/draw";

/** What a shape says an entity is, as a heading over the shapes that say it. */
const SAYS: Record<Role | "", string> = {
  place: "A place", party: "People and organisations", asset: "A thing held or run", catalog: "What is offered or defined",
  stock: "Stock on hand", transaction: "An exchange", event: "A record of activity", calendar: "Time", "": "Nothing yet",
};
const named = (shape: Shape) => shape.charAt(0).toUpperCase() + shape.slice(1);

/** One shape, drawn alone on its own pad by the same pen the Atlas draws it with. */
export function ShapeGlyph({ shape, width = 120 }: { shape: Shape; width?: number }) {
  const { w, d, h } = SHAPES[shape], W = 120, H = 92;
  const s = Math.min(100 / (w + d), 14), ox = W / 2 + ((d - w) * s) / 2, oy = Math.max(6 + (h * s) / 25, H - 8 - ((w + d) * s) / 2);
  const at: Projection = (u, v, z = 0) => [ox + (u - v) * s, oy + ((u + v) * s) / 2 - (z * s) / 25];
  const pen = new Pen(at);
  pen.pad(0, 0, w, d, "entity");
  DRAW[shape](pen, 0, 0, w, d, null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={(width * H) / W} role="img" aria-label={SHAPES[shape].says} style={{ display: "block", flex: "none" }}>
      <AtlasDefs />
      {pen.out}
    </svg>
  );
}

export function EntityShape({ detail, connectionId, schema, editing, onChanged }: {
  detail: ObjectTypeDetail; connectionId: string; schema?: string; editing: boolean; onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const chosen = detail.drawn_as && detail.drawn_as in SHAPES ? (detail.drawn_as as Shape) : null;
  const choose = async (shape: string) => {
    setBusy(shape || "none"); setProblem("");
    try { await chooseEntityShape(connectionId, detail.id, shape, schema); onChanged?.(); setOpen(false); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  return (
    <div className="aug-entity-shape" data-testid="entity-shape" data-shape={chosen ?? ""}>
      <ShapeGlyph shape={chosen ?? "plinth"} width={76} />
      <div style={{ minWidth: 0 }}>
        <div className="aug-fs-sm" style={{ color: "var(--t1)" }}>
          {chosen ? <>Drawn on the Atlas as <b style={{ fontWeight: 600 }}>{SHAPES[chosen].says}</b></> : "No shape chosen for the Atlas"}
        </div>
        <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>
          {chosen ? `a person's choice · it says: ${SAYS[roleOfShape(chosen)].toLowerCase()}`
            : "it is drawn by a deployed package's word for it, or as the plain block"}
        </div>
      </div>
      {editing && (
        <Button variant="outline" size="xs" style={{ marginLeft: "auto" }} data-testid="entity-shape-change" onClick={() => setOpen(true)}>
          {chosen ? "Change its shape" : "Choose a shape"}
        </Button>
      )}
      <FormDialog open={open} onOpenChange={setOpen} busy={!!busy} width={860} testId="entity-shape-catalogue"
        title={`How ${detail.display_name} is drawn on the Atlas`}
        description="Choose the shape that says what it is. It changes the picture, and nothing an agent or a query reads. The change waits in the draft until it is published.">
        {problem && <p className="aug-fs-sm" role="alert" style={{ color: "var(--red4)", margin: "0 0 10px" }}>{problem}</p>}
        {shapeCatalogue().map((group) => (
          <section key={group.role || "plain"} aria-label={SAYS[group.role]} style={{ marginBottom: 14 }}>
            <div className="aug-fs-xs" style={{ color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{SAYS[group.role]}</div>
            <div className="aug-entity-shapes">
              {group.shapes.map((shape) => (
                <Button key={shape} variant="ghost" size="xs" className={`aug-entity-shape-tile${chosen === shape ? " is-chosen" : ""}`}
                  aria-pressed={chosen === shape} disabled={!!busy} data-testid={`entity-shape-${shape}`} onClick={() => choose(shape)}>
                  <ShapeGlyph shape={shape} width={104} />
                  <span className="aug-fs-sm" style={{ color: "var(--t1)", fontWeight: 500 }}>{named(shape)}</span>
                  <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>{SHAPES[shape].says}</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {chosen && <Button variant="outline" size="sm" disabled={!!busy} data-testid="entity-shape-none" onClick={() => choose("")}>Let go of the choice</Button>}
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </FormDialog>
    </div>
  );
}
