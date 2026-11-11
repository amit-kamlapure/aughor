/**
 * The colour tokens script reads, as hexes at the DEFAULT look — blue, slate (both since 2026-11-10) — per skin.
 *
 * Only for where there is no stylesheet to read: the server's render, a headless print, a
 * test. In a browser `lib/tokenColor.ts` reads the live value, so a person's own accent and
 * grey win there. This is a mirror, and mirrors drift; `tokenFallback.test.ts` resolves each
 * name through `aughor-v2/theme/tokens-v2.css` into Radix Themes' own stylesheet and fails
 * on any difference. Change a token's step, or the default look, and that test says what to
 * write here.
 */
export const TOKEN_FALLBACK = {
  // 2026-10-25, the surface grammar: a card one step above the ground, a control a step under the card,
  // lines a step stronger in dark; in light a grey ground under white cards.
  dark: {
    "--bg-0": "#111113", "--bg-1": "#18191B", "--bg-2": "#212225", "--bg-3": "#111113", "--bg-4": "#2E3135",
    "--bg-hover": "#272A2D", "--bg-sel": "#003362",
    "--b0": "#363A3F", "--b1": "#43484E", "--b2": "#43484E",
    "--t1": "#EDEEF0", "--t2": "#B0B4BA", "--t3": "#B0B4BA", "--t4": "#696E77",
    "--blue3": "#70B8FF", "--blue4": "#70B8FF",
    "--chart-axis": "#43484E", "--chart-grid": "#363A3F", "--chart-tick": "#696E77",
  },
  light: {
    "--bg-0": "#F0F0F3", "--bg-1": "#F9F9FB", "--bg-2": "#FFFFFF", "--bg-3": "#F0F0F3", "--bg-4": "#E0E1E6",
    "--bg-hover": "#E8E8EC", "--bg-sel": "#D5EFFF",
    "--b0": "#E0E1E6", "--b1": "#D9D9E0", "--b2": "#CDCED6",
    "--t1": "#1C2024", "--t2": "#60646C", "--t3": "#60646C", "--t4": "#8B8D98",
    "--blue3": "#0B63B5", "--blue4": "#0B63B5",
    "--chart-axis": "#CDCED6", "--chart-grid": "#E0E1E6", "--chart-tick": "#8B8D98",
  },
} as const;

export type TokenName = keyof (typeof TOKEN_FALLBACK)["dark"];
