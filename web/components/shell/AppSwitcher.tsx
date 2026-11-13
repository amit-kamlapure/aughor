"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchCoworkerDoor, type CoworkerDoor } from "@/lib/api";

/**
 * The nine dots: the way from the app to the coworker, and the place a person learns there is one.
 *
 * The coworker is a second page of the platform — a chat that works a question through — served beside the app by
 * its own process. The dots are drawn only while one is running: the API is told so by the coworker itself and
 * forgets it two minutes after the last time, so this never offers a way in that leads nowhere. No coworker, no
 * dots, and the top bar is as it was.
 *
 * What is carried across, so the person arrives where they were: the connection in the top bar, light or dark,
 * and this page's own address as the way back. They ride in the address's fragment — the coworker drops a query
 * string on arrival, and a fragment is never sent to a server. The coworker's access rides there too.
 */
export type Carried = { connectionId?: string; theme?: string; back?: string };

/**
 * The address the dots open: the coworker's own entry page, with the coworker's access and what is carried in the
 * fragment. Not the coworker's address itself — its sign-in is a cookie a browser withholds on an arrival from
 * another site, which the app is, and opened directly it answers "authentication required". The entry page is on
 * the coworker's address and makes the move from there (`coworker/plugins/home`, "the way in from the app").
 * An address that will not parse is returned as it is.
 */
export function coworkerHref(url: string, carried: Carried): string {
  try {
    const at = new URL(url);
    const to = new URL("pramanyx-enter", at);
    const said = new URLSearchParams();
    const access = at.searchParams.get("token");
    if (access) said.set("t", access);
    if (carried.connectionId) said.set("conn", carried.connectionId);
    if (carried.theme) said.set("theme", carried.theme);
    if (carried.back) said.set("back", carried.back);
    to.hash = said.toString();
    return to.toString();
  } catch {
    return url;
  }
}

function NineDots() {
  const at = [3, 8, 13];
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {at.flatMap((y) => at.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
    </svg>
  );
}

const row: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", padding: "8px 9px", borderRadius: "var(--r2)",
  color: "var(--t1)", textDecoration: "none",
};
const tile: React.CSSProperties = {
  width: 32, height: 32, flex: "none", borderRadius: "var(--r2)", border: "1px solid var(--b2)", background: "var(--bg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
};

export function AppSwitcher({ connectionId, theme }: { connectionId?: string; theme?: string }) {
  const [door, setDoor] = useState<CoworkerDoor | null>(null);
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);

  const look = useCallback(() => {
    fetchCoworkerDoor().then(setDoor).catch(() => setDoor(null));
  }, []);
  useEffect(() => { look(); }, [look]);

  // Closed by a click anywhere else and by Escape, like every menu a button opens here.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (host.current && !host.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!door?.available || !door.url) return null;
  const href = coworkerHref(door.url, {
    connectionId, theme, back: typeof window === "undefined" ? undefined : window.location.href,
  });
  return (
    <div ref={host} style={{ position: "relative" }}>
      <Button variant="ghost" size="icon-xs" aria-label="Switch to" aria-expanded={open} data-testid="app-switcher"
        // Looked at again as it opens: a coworker that stopped since the page loaded is not offered.
        onClick={() => { if (!open) look(); setOpen((was) => !was); }}>
        <NineDots />
      </Button>
      {open && (
        <div role="menu" aria-label="Switch to" style={{
          position: "absolute", right: 0, top: 30, zIndex: 60, width: 300,
          background: "var(--bg-3)", border: "1px solid var(--b2)", borderRadius: "var(--r2)",
          boxShadow: "var(--shadow-sm)", padding: 8, display: "flex", flexDirection: "column", gap: 2,
        }}>
          <span className="aug-fs-xs" style={{ color: "var(--t3)", padding: "2px 9px 6px" }}>Switch to</span>
          <div role="menuitem" aria-current="page" style={{ ...row, background: "var(--bg-2)" }}>
            <span style={tile} aria-hidden>P</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span className="aug-fs-sm" style={{ fontWeight: 600 }}>Pramanyx</span>
              <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>The platform. You are here.</span>
            </span>
          </div>
          <a role="menuitem" href={href} className="aug-switch-row" style={row}>
            <span style={tile} aria-hidden>C</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span className="aug-fs-sm" style={{ fontWeight: 600 }}>Coworker</span>
              <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>Ask, and have it worked through.</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
