import type * as React from "react"
import { Callout as ThemesCallout } from "@radix-ui/themes"

/**
 * A callout, on Radix Themes: a short notice set apart from the page in a tint of one hue.
 * A hue appears only when a reader can name the state it means — amber for something
 * waiting on them or a version that was replaced, red for an adverse one, green for a
 * guard passed, blue for the next step, violet for the deep analysis — and grey otherwise.
 */
type Tone = "grey" | "blue" | "green" | "amber" | "red" | "violet"
// "blue" is the accent (undefined: Themes then draws the Theme's own accent), so the next-step notice follows a
// person's look instead of a fixed indigo that disagreed with any other accent (2026-11-10, when blue became the default).
const COLOR: Record<Tone, "gray" | "green" | "amber" | "red" | "violet" | undefined> = {
  grey: "gray", blue: undefined, green: "green", amber: "amber", red: "red", violet: "violet",
}

function Callout({ tone = "grey", children, ...props }: Omit<React.ComponentProps<typeof ThemesCallout.Root>, "color" | "size" | "variant"> & { tone?: Tone }) {
  return (
    // The children go in as they are: a notice here may hold a paragraph and a button, which
    // Themes' own <Callout.Text>, a <p>, could not.
    <ThemesCallout.Root data-slot="callout" size="1" variant="surface" color={COLOR[tone]} {...props}>
      {children}
    </ThemesCallout.Root>
  )
}

export { Callout }
