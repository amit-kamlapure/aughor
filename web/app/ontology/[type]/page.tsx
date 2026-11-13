"use client";

/**
 * `/ontology/<type>?conn=<connection>&schema=<schema>`: one entity of the ontology as a page of its own —
 * its source, properties, links, rules, the metrics and actions that use it. Opened beside an answer that read it
 * (the coworker's right-hand pane). A LAYOUT over `EntityTypePanel` in its full-page form, the page the Ontology's
 * register opens: same app, same tokens, same auth and org scoping. Another type opened from it opens here.
 */
import { use, useEffect, useState } from "react";

import { EntityTypePanel } from "@/components/ontology/EntityTypePanel";
import { installAuthFetch } from "@/lib/auth";
import { getApiBase } from "@/lib/config";
import { getTypeMap, type TypeMap } from "@/lib/objectTypes";

if (typeof window !== "undefined") installAuthFetch(getApiBase());

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function segment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function OntologyTypeRoute({ params, searchParams }: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { type } = use(params);
  const query = use(searchParams);
  const connection = one(query.conn);
  const schema = one(query.schema);
  const asked = segment(type);
  const [map, setMap] = useState<TypeMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(asked);

  useEffect(() => {
    if (!connection) return;
    let live = true;
    getTypeMap(connection, schema).then((m) => { if (live) setMap(m); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [connection, schema, version]);

  if (!connection) {
    return <main style={{ padding: 20 }}><p className="aug-fs-sm" style={{ color: "var(--t2)" }}>This page needs a connection: add <code>?conn=</code> to its address.</p></main>;
  }
  if (failed) {
    return <main style={{ padding: 20 }}><p className="aug-fs-sm" style={{ color: "var(--t2)" }}>The ontology for this connection could not be read.</p></main>;
  }
  if (!map) {
    return <main style={{ padding: 20 }}><p className="aug-fs-sm" style={{ color: "var(--t3)" }}>Reading the ontology…</p></main>;
  }
  // An answer names a table (`orders`) or a type (`Order`): the type is found by either, whatever its case.
  const want = open.toLowerCase();
  const entities = map.object_types.map((row) => ({ row, name: row.object_type }));
  const found = (entities.find((e) => e.name.toLowerCase() === want)
    ?? entities.find((e) => e.name.toLowerCase() === want.replace(/s$/, "")))?.row;
  if (!found) {
    return <main style={{ padding: 20 }}><p className="aug-fs-sm" style={{ color: "var(--t2)" }}>The ontology of this connection has no entity named “{open}”.</p></main>;
  }
  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <EntityTypePanel full connectionId={connection} schema={schema} objectType={found.object_type} types={map.object_types}
        version={version} onOpen={setOpen} onChanged={() => setVersion((v) => v + 1)} />
    </main>
  );
}
