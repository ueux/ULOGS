"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Play, XCircle, Search, Clipboard, Loader2 } from "lucide-react";
import { getLogs } from "@ulogs/next";

type ResultRow = {
  timestamp?: string;
  type?: "error" | "warning" | "info" | "audit" | "metric";
  appName?: string;
  message?: string;
  environment?: string;
  importance?: number | string | null;
  subsystem?: string | null;
  operation?: string | null;
  [key: string]: any;
};


export default function Page() {
  const [filters, setFilters] = React.useState<{
    limit?: number;
    query?: string; // kept for compatibility, but we’ll send explicit keys
    type?: string;
    env?: string;
    appName?: string;
    search?: string;
  }>({});
  const {data,isLoading,error} =getLogs(filters)

  const levelColor: Record<string, string> = {
    info: "#60A5FA",      // Blue
    warning: "#FBBF24",      // Yellow/Amber
    error: "#F87171",     // Red
    debug: "#A78BFA",     // Purple
    success: "#34D399",   // Emerald/Green
    audit: "#34D399",     // Emerald/Green
    metric: "#22D3EE",    // Cyan
  };

  const [query, setQuery] = React.useState("");

  // Use examples that map cleanly to server filters
  const examples = [
    "type:error",
    "appName:api AND search:timeout",
    "type:warning AND appName:billing",
  ];
  const normalizeLogs = React.useCallback((input:any):ResultRow[] => {
    if (!input) return [];
    if (Array.isArray(input)) return input as ResultRow[];
    const obj = input as { logs?: any }
    if (Array.isArray(obj.logs)) return obj.logs as ResultRow[];
    return []
  },[])

  // Normalize UI query tokens to server-supported filters
  const normalizeQuery = (q: string) =>
    q
      .replace(/\blevel:/gi, "type:")
      .replace(/\bservice:/gi, "appName:")
      .replace(/\bmessage:/gi, "search:")
      .trim();

  // Parse "type:error AND appName:api AND search:timeout env:development" → explicit filters
  const parseQueryFilters = React.useCallback((q: string) => {
    const out: {
      type?: string;
      env?: string;
      appName?: string;
      search?: string;
    } = {};
    const parts = q.trim().split(/\s+AND\s+|\s+/i);
    for (const p of parts) {
      const [rawKey, ...rest] = p.split(":");
      if (!rawKey || rest.length === 0) continue;
      const value = rest.join(":").trim();
      const key = rawKey.trim().toLowerCase();
      // map synonyms (keys are lowercased above)
      if (key === "type" || key === "level") out.type = value;
      else if (key === "env" || key === "environment") out.env = value;
      else if (key === "appname" || key === "app") out.appName = value;
      else if (key === "search" || key === "message") out.search = value;
    }
    return out;
  }, []);

  const results: ResultRow[] = React.useMemo(() => {
    const rows = normalizeLogs(data);
    return rows ?? [];
  }, [data,normalizeLogs]);
  const [selected, setSelected] = React.useState<ResultRow | null>(null);

  const runQuery = () => {
    const parsed = parseQueryFilters(normalizeQuery(query));
    setFilters({
      ...parsed, // send explicit keys: type, env, appName, search
      limit: 200,
    });
  };

  const clearQuery = () => {
    setQuery("");
    setFilters({ limit: 100 });
  };

  const stats = React.useMemo(() => {
    const total = results.length;
    const errors = results.filter(
      (r) => String(r.type || "").toLowerCase() === "error"
    ).length;
    const warnings = results.filter((r) => {
      const t = String(r.type || "").toLowerCase();
      return t === "warning" || t === "warn";
    }).length;
    return { total, errors, warnings };
  }, [results]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Queries</h1>
        <p className="text-sm text-muted-foreground">
          Search, filter, and analyze logs stored in your project.
        </p>
      </div>

      {/* Query Bar */}
      <div className="rounded-xl border p-3">
        <div className="flex gap-3">
          <Input
            placeholder="Enter query (e.g. type:error AND appName:billing)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runQuery();
            }}
            className="rounded-xl flex-1"
          />
          <Button onClick={runQuery} className="rounded-xl">
            <Play className="h-4 w-4" />
            Run Query
          </Button>
          <Button
            variant="ghost"
            onClick={clearQuery}
            className="rounded-xl hover:bg-white/2"
          >
            <XCircle className="h-4 w-4" />
            Clear
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Search className="h-4 w-4 opacity-60" />
          <div className="text-xs text-muted-foreground">Examples:</div>
          <div className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="text-xs rounded-full border px-2 py-1 text-muted-foreground hover:bg-white/3"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-xl border">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-sm font-medium">Query Results</h3>
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            {stats.total} rows
          </span>
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "13px",
          }}
        >
          {error ? (
            <div className="flex items-center justify-center py-12 text-red-400">
              Failed to load logs: {String(error)}
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Search className="mr-2 h-4 w-4" />
              No logs found. Try adjusting your query.
            </div>
          ) : (
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Environment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, idx) => (
                  <TableRow
                    key={`${r.timestamp ?? "t"}-${idx}`}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="text-white/60">
                      {r.timestamp ?? "—"}
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      style={{
                        color:
                          levelColor[
                          String(
                            r.type || ""
                          ).toLowerCase() as keyof typeof levelColor
                          ] ?? "inherit",
                      }}
                    >
                      {String(r.type || "").toUpperCase() || "—"}
                    </TableCell>
                    <TableCell className="text-white/80">
                      {r.appName ?? "—"}
                    </TableCell>
                    <TableCell className="text-white/90">
                      {r.message ?? "—"}
                    </TableCell>
                    <TableCell className="text-white/70">
                      {r.environment ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Drawer: Log Details */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="fixed right-0 top-0 h-full w-105 border-l bg-background p-4"
            style={{ background: "#0E1117" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Log Details</h3>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(selected, null, 2)
                  )
                }
              >
                <Clipboard className="mr-2 h-3.5 w-3.5" />
                Copy JSON
              </Button>
            </div>

            <Tabs defaultValue="formatted" className="mt-3">
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="formatted" className="mt-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timestamp</span>
                    <span>{selected.timestamp ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span
                      className="font-medium"
                      style={{
                        color:
                          levelColor[
                          String(
                            selected.type || ""
                          ).toLowerCase() as keyof typeof levelColor
                          ] ?? "inherit",
                      }}
                    >
                      {String(selected.type || "").toUpperCase() || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">App</span>
                    <span>{selected.appName ?? "—"}</span>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Message</div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      {selected.message ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">
                      Environment
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                      {selected.environment ?? "—"}
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="raw" className="mt-3">
                <pre className="rounded-lg border border-white/10 bg-black/20 p-2 overflow-x-auto text-xs">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* Footer status bar */}
      <div
        className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-center gap-6">
          <span className="text-muted-foreground">Results</span>
          <span className="font-medium">{stats.total.toLocaleString()}</span>
          <span className="text-muted-foreground">Errors</span>
          <span className="font-medium">{stats.errors.toLocaleString()}</span>
          <span className="text-muted-foreground">Warnings</span>
          <span className="font-medium">{stats.warnings.toLocaleString()}</span>
        </div>
        <div className="text-muted-foreground">
          {isLoading ? "Loading…" : ""}
        </div>
      </div>
    </div>
  );
}
