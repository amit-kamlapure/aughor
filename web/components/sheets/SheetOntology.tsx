"use client";

/**
 * SH-6 — a sheet placed on the ontology as an entity, on a person's request (the user, 2026-11-09: "Linked or placed
 * on the Ontology only upon request by user and only if the Ontology requirements are met.. nothing by default").
 *
 * A button on the sheet's bar says what the sheet is on the ontology as — nothing, a draft, or an entity readers
 * see — and opens a form: the entity's name, the column that is its key (only a column that is one per object, a
 * value people keep — every other one listed with why not; `_row` never), the columns it keeps, and a description.
 * Placing it drafts it in the Sheets ontology; it reaches readers once a person publishes the draft in Ontology.
 */
import { useEffect, useMemo, useState } from "react";

import { MUTED } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCount } from "@/lib/format";
import { requestTab } from "@/lib/navigate";
import { placeOnOntology, readOnOntology, type SheetOnOntology } from "@/lib/sheets";

/** What the bar's button says: the entity a sheet is, and whether readers see it yet. */
export function ontologyWords(placed: SheetOnOntology["placed"]): string {
  if (!placed.length) return "Put on the ontology";
  const p = placed[0];
  return p.published ? `On the ontology · ${p.display_name}` : `On the ontology · ${p.display_name} (draft)`;
}

export function SheetOntologyButton({ sheetId, sheetName, editable, narrow }: {
  sheetId: string; sheetName: string; editable: boolean; narrow?: boolean;
}) {
  const [known, setKnown] = useState<SheetOnOntology | null>(null);
  const [open, setOpen] = useState(false);
  const read = () => readOnOntology(sheetId).then(setKnown).catch(() => setKnown(null));
  useEffect(() => { void read(); }, [sheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const placed = known?.placed ?? [];
  // a reader of a sheet places nothing; once placed, everyone who reads the sheet is told what it is on the ontology as
  if (!known || (!editable && !placed.length)) return null;
  const words = ontologyWords(placed);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title={words}>
        <Icon name="node" /> {narrow ? (placed.length ? "Ontology" : "Ontology…") : words}
      </Button>
      {open && (
        <FormDialog open onOpenChange={o => { if (!o) setOpen(false); }}
          title={placed.length ? `${sheetName} on the ontology` : `Put ${sheetName} on the ontology`}
          description={placed.length ? undefined
            : "As an entity: one object per row, named by a column that is one per object. Nothing reaches the ontology until you ask, and readers see it once it is published."}
          testId="sheet-ontology">
          {placed.length
            ? <Placed placed={placed} onClose={() => setOpen(false)} />
            : <PlaceForm sheetId={sheetId} known={known} editable={editable}
                onPlaced={() => { void read(); }} onClose={() => setOpen(false)} />}
        </FormDialog>
      )}
    </>
  );
}

function Placed({ placed, onClose }: { placed: SheetOnOntology["placed"]; onClose: () => void }) {
  const p = placed[0];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="aug-fs-sm">
        This sheet is the entity <b>{p.display_name}</b>, one object per row by its <b>{p.key_property}</b>.{" "}
        {p.published ? "Readers see it on the ontology." : "It is a draft: readers see it once it is published in Ontology."}
      </div>
      <ul className="aug-fs-sm" style={{ ...MUTED, margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li>An edit that would give two rows the same {p.key_property} is refused.</li>
        <li>Renaming a column it reads is followed; nothing already made from it is rewritten.</li>
        <li>Removing the sheet leaves the entity on the ontology; removing the entity is its own step, in Ontology.</li>
      </ul>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={() => { requestTab("ontology", { conn: "sheets" }); onClose(); }}>
          {p.published ? "Open it in Ontology" : "Review and publish in Ontology"}
        </Button>
      </div>
    </div>
  );
}

/** Why a column is not one per object, in a few words — its whole sentence is its title. */
export function shortWhy(c: SheetOnOntology["columns"][number]): string {
  if (c.role !== "stored") return `${c.role}, read from other columns`;
  if (!c.filled) return "holds no value";
  return `${formatCount(c.distinct ?? 0)} distinct of ${formatCount(c.filled)} filled`;
}

/** The columns that cannot be the key, each with why — a short list, never a paragraph of sentences run together
 *  (seen live on Olist orders, 2026-11-09: six long sentences under the key were unreadable). */
function NotKeys({ columns }: { columns: SheetOnOntology["columns"] }) {
  if (!columns.length) return <span className="aug-fs-xs" style={MUTED}>Every column could be the key.</span>;
  return (
    <div className="aug-fs-xs" style={{ ...MUTED, display: "grid", gap: 2 }} aria-label="Columns that cannot be the key">
      <span>Not one per object:</span>
      <span style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "2px 12px" }}>
        {columns.map(c => (
          <span key={c.id} title={c.why} style={{ display: "contents" }}>
            <span style={{ color: "var(--t2)" }}>{c.name}</span>
            <span>{shortWhy(c)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function PlaceForm({ sheetId, known, editable, onPlaced, onClose }: {
  sheetId: string; known: SheetOnOntology; editable: boolean; onPlaced: () => void; onClose: () => void;
}) {
  const keys = useMemo(() => known.columns.filter(c => c.key), [known]);
  const [name, setName] = useState("");
  const [key, setKey] = useState(keys[0]?.id ?? "");
  const [kept, setKept] = useState<string[]>(() => known.columns.filter(c => !c.hidden).map(c => c.id));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return <div className="aug-fs-sm" style={MUTED}>Only someone who can change this sheet puts it on the ontology.</div>;
  }
  if (!keys.length) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div className="aug-fs-sm" role="alert">
          No column of this sheet is one per object, so it cannot be an entity yet. Each column, and why:
        </div>
        <ul className="aug-fs-sm" style={{ ...MUTED, margin: 0, paddingLeft: 18 }}>
          {known.columns.map(c => <li key={c.id}>{c.why}</li>)}
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    );
  }

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      await placeOnOntology(sheetId, { display_name: name.trim(), key, columns: kept, description: description.trim() });
      onPlaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) => setKept(kept.includes(id) ? kept.filter(x => x !== id) : [...kept, id]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label className="aug-fs-sm" style={{ display: "grid", gap: 4 }}>
        What a reader calls one row
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Store target" aria-label="Entity name" />
      </label>
      <div className="aug-fs-sm" style={{ display: "grid", gap: 4 }}>
        Its key — one value per object
        <Select value={key} onValueChange={setKey}>
          <SelectTrigger aria-label="Key column" />
          <SelectContent>
            {keys.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <NotKeys columns={known.columns.filter(c => !c.key)} />
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 6 }}>
        <legend className="aug-fs-sm" style={{ marginBottom: 4 }}>Columns it keeps</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          {known.columns.map(c => (
            <label key={c.id} className="aug-fs-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Checkbox checked={c.id === key || kept.includes(c.id)} disabled={c.id === key} onChange={() => toggle(c.id)}
                aria-label={`Keep ${c.name}`} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="aug-fs-sm" style={{ display: "grid", gap: 4 }}>
        What it is (optional)
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} aria-label="Description" />
      </label>
      {error && <div role="alert" className="aug-fs-sm" style={{ color: "var(--red4)" }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="aug-fs-xs" style={MUTED}>Drafted in the Sheets ontology; readers see it once it is published.</span>
        <Button variant="ghost" onClick={onClose} style={{ marginLeft: "auto" }}>Cancel</Button>
        <Button onClick={place} disabled={busy || !name.trim() || !key}>{busy ? "Placing…" : "Place on the ontology"}</Button>
      </div>
    </div>
  );
}
