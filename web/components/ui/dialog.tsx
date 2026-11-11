"use client"

import type * as React from "react"
import { Dialog as ThemesDialog } from "@radix-ui/themes"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

/** A dialog, on Radix Themes: its panel, its scrim, its focus trap. One of the three things
 *  allowed to float. */
function Dialog(props: React.ComponentProps<typeof ThemesDialog.Root>) {
  return <ThemesDialog.Root data-slot="dialog" {...props} />
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeDisabled = false,
  maxWidth = "384px",
  ...props
}: Omit<React.ComponentProps<typeof ThemesDialog.Content>, "size"> & {
  showCloseButton?: boolean
  /** The corner close drawn disabled — while what the dialog started cannot be walked away from. */
  closeDisabled?: boolean
}) {
  return (
    <ThemesDialog.Content data-slot="dialog-content" size="2" maxWidth={maxWidth}
      className={cn("grid gap-3 text-sm", className)} {...props}>
      {children}
      {showCloseButton && (
        <ThemesDialog.Close>
          <Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-2 right-2" disabled={closeDisabled}>
            <Icon name="close" size={14} />
          </Button>
        </ThemesDialog.Close>
      )}
    </ThemesDialog.Content>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5", className)} {...props} />
}

/** The dialog's name. Themes spaces a title from what follows; here the content's own gap does. */
function DialogTitle(props: React.ComponentProps<typeof ThemesDialog.Title>) {
  return <ThemesDialog.Title data-slot="dialog-title" size="3" mb="0" {...props} />
}

function DialogDescription(props: React.ComponentProps<typeof ThemesDialog.Description>) {
  return <ThemesDialog.Description data-slot="dialog-description" size="2" color="gray" {...props} />
}

/**
 * A form in a dialog: a create or edit form opened by a DELIBERATE action — New metric, Write a mission, a
 * double-clicked step — and never by a selection (the user, 2026-11-07: "a pop-up overlay where I enter the
 * details … at the moment everything is adjusted on the same plane"; and since 2026-10, no pop-up on every
 * click). Wide enough for a form; its body scrolls inside the viewport; Escape, Close or the form's own
 * Cancel dismisses it. The scrim blurs the page behind it (`globals.css`). Its corner Close is the one close a
 * form needs: a form in it draws no second one, only a Cancel beside its submit.
 */
function FormDialog({ open, onOpenChange, title, description, width = 720, testId, busy = false, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** While what the form started is in flight: the corner Close is drawn disabled, and Escape and the scrim
   *  are held — a dialog that closes on a running start would leave it with nowhere to land. */
  busy?: boolean
  title: React.ReactNode
  description?: React.ReactNode
  /** The panel's widest, in px — a form's fields want room, 720 by default. */
  width?: number
  testId?: string
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (o || !busy) onOpenChange(o); }}>
      <DialogContent maxWidth={`${width}px`} data-testid={testId} closeDisabled={busy}
        style={{ maxHeight: "88vh", overflowY: "auto" }}
        {...(description ? {} : { "aria-describedby": undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FormDialog }
