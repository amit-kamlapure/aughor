"use client";

/**
 * How anything in the ontology is made, changed or removed (the user, 2026-11-11: "creating them and editing them is
 * not a straightforward experience … rather confusing"). Before this there were eleven forms that pushed the page open
 * in place, a dialog, five drawers and an overlay, seven words for making a thing and ten for taking one away, and a
 * link could be removed in one click while an entity took two.
 *
 * Now there is one of each:
 *  - a `Door` — the button that says what it makes or changes, and its form in a dialog over the page;
 *  - a `FormFoot` — "Save to the draft" and Cancel, the same on every form, with what went wrong beside them;
 *  - a `RemoveAsk` — one question before anything is removed, saying what stops working;
 *  - `savedToDraft` — the one thing a save says afterwards.
 *
 * None of this changes what is written or where: each form calls the door it always called, and every write still
 * waits in the draft until a person publishes it.
 */
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";

/** What every save says, once: where the change is, and that no reader has it yet. */
export function savedToDraft(what?: string) {
  toast.success(what ? `${what} — saved to the draft` : "Saved to the draft", { description: "Agents and queries keep reading the published release until you publish." });
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A form's button and the form itself, in a dialog. `children` is drawn only while it is open. */
export function Door({ open, onOpenChange, label, hint, title, description, busy, testId, icon = "plus", variant = "outline", disabled, width = 620, style, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button: "New link", "Change". Absent, the door has no button of its own and is opened from elsewhere. */
  label?: React.ReactNode;
  hint?: string;
  /** The dialog's name: "New link from Order". */
  title: React.ReactNode;
  description?: React.ReactNode;
  busy?: boolean;
  testId?: string;
  icon?: IconName | null;
  variant?: "outline" | "ghost" | "secondary" | "default";
  disabled?: boolean;
  width?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <>
      {label != null && (
        <Button variant={variant} size="xs" onClick={() => onOpenChange(true)} title={hint} disabled={disabled} style={style}
          data-testid={testId ? `${testId}-open` : undefined}>
          {icon && <Icon name={icon} size={12} />} {label}
        </Button>
      )}
      <FormDialog open={open} onOpenChange={onOpenChange} busy={busy} title={title} description={description} width={width} testId={testId}>
        {children}
      </FormDialog>
    </>
  );
}

/** The foot of every form: what went wrong, where the save goes, Cancel, and the one save. */
export function FormFoot({ busy, ready = true, onSave, onCancel, busyLabel = "Saving…", saveLabel = "Save to the draft", problem, extra }: {
  busy: boolean;
  ready?: boolean;
  onSave: () => void;
  onCancel: () => void;
  busyLabel?: string;
  saveLabel?: string;
  problem?: string;
  /** Something that sits at the left of the foot — a Remove, on a form that changes a thing. */
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {problem && <p className="aug-fs-xs" role="alert" style={{ margin: 0, color: "var(--red5)", lineHeight: 1.45 }}>{problem}</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {extra}
        <span className="aug-fs-xs" style={{ color: "var(--t3)", marginRight: "auto" }}>Waits in the draft until it is published</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button variant="default" size="sm" disabled={busy || !ready} onClick={onSave} data-testid="form-save">
          {busy ? busyLabel : saveLabel}
        </Button>
      </div>
    </div>
  );
}

/** One field of a form: its name over it, and a line under it where one helps. */
export function Field({ label, hint, children, style }: { label: string; hint?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, ...style }}>
      <span className="aug-fs-xs" style={{ color: "var(--t2)" }}>{label}</span>
      {children}
      {hint && <span className="aug-fs-xs" style={{ color: "var(--t3)", lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

/**
 * The one question before anything is removed. `what` names it ("the link Order placed by Customer"), `effect` says
 * what stops working. `remove` does it; a refusal is shown in the question, which stays open.
 */
export function RemoveAsk({ what, effect, remove, onRemoved, label = "Remove", hint, testId, back = "It is kept in History, where Put back returns it.", variant, icon = null }: {
  what: string;
  effect: string;
  remove: () => Promise<unknown>;
  onRemoved?: () => void;
  label?: string;
  hint?: string;
  testId?: string;
  /** How it comes back, or "" where it does not. */
  back?: string;
  /** How its button is drawn: a Remove is red-edged, as the mockup draws it; another word (Refuse, a name) is plain. */
  variant?: "outline" | "ghost" | "destructive";
  icon?: IconName | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const go = async () => {
    setBusy(true);
    setProblem("");
    try {
      await remove();
      setOpen(false);
      onRemoved?.();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant={variant ?? (label.startsWith("Remove") ? "destructive" : "ghost")} size="xs" onClick={() => setOpen(true)} title={hint ?? `Remove ${what}`} data-testid={testId}>
        {icon && <Icon name={icon} size={12} />} {label}
      </Button>
      <FormDialog open={open} onOpenChange={setOpen} busy={busy} width={480} title={`Remove ${what}?`} testId="remove-ask"
        description={effect}>
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)", lineHeight: 1.45 }}>
          {back} Nothing changes for agents or queries until the draft is published.
        </p>
        {problem && <p className="aug-fs-xs" role="alert" style={{ margin: 0, color: "var(--red5)", lineHeight: 1.45 }}>{problem}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void go()} data-testid="remove-yes">
            {busy ? "Removing…" : "Remove"}
          </Button>
        </div>
      </FormDialog>
    </>
  );
}
