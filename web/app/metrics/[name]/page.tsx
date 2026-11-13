"use client";

/**
 * `/metrics/<name>?conn=<connection>&schema=<schema>`: one metric's definition as a page of its own — where it
 * came from, whose it is, and what disagrees with it. Opened beside an answer that was held to the metric (the
 * coworker's right-hand pane), the way `/receipt/<id>` is opened from a document. A LAYOUT over
 * `MetricProvenancePanel`, the panel the Semantic Layer shows: same app, same tokens, same auth and org scoping.
 */
import { use } from "react";

import { MetricProvenancePanel } from "@/components/ontology/MetricProvenance";
import { installAuthFetch } from "@/lib/auth";
import { getApiBase } from "@/lib/config";
import { cleanLabel } from "@/lib/format";

// Opened in a frame or a new tab, where the workbench never installed the authenticated fetch — so the page
// installs it itself, before its first request (the install is idempotent).
if (typeof window !== "undefined") installAuthFetch(getApiBase());

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** A segment may still arrive percent-encoded; a malformed one is used as written. */
function segment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function MetricRoute({ params, searchParams }: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { name } = use(params);
  const query = use(searchParams);
  const metric = segment(name);
  const connection = one(query.conn);
  return (
    <main style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>Semantic Layer · metric</div>
        <h1 className="aug-fs-h1" style={{ margin: 0, color: "var(--t1)" }}>{cleanLabel(metric)}</h1>
        <code className="aug-fs-sm" style={{ color: "var(--t3)" }}>{metric}</code>
      </div>
      {connection
        ? <MetricProvenancePanel metricId={metric} connectionId={connection} schemaName={one(query.schema)} />
        : <p className="aug-fs-sm" style={{ color: "var(--t2)" }}>This page needs a connection: add <code>?conn=</code> to its address.</p>}
    </main>
  );
}
