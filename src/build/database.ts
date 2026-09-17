import { createRequire } from "node:module";
import { dirname, join } from "@std/path";
import type { NativeDatabase } from "../server/database.ts";
import { digest, identifier, type PublishedTable } from "../protocol.ts";

export type Files = Map<string, { body: string | Uint8Array; type: string }>;

export async function exportDatabase(
  db: NativeDatabase,
  files: Files,
) {
  const reader = await db.connection.runAndReadAll(
    `SELECT schema_name AS schema, table_name AS name FROM duckdb_tables() WHERE NOT internal
    UNION ALL SELECT schema_name AS schema, view_name AS name FROM duckdb_views() WHERE NOT internal
    ORDER BY schema, name`,
  );
  const relations = reader.getRowObjectsJson() as {
    schema: string;
    name: string;
  }[];
  const tables: PublishedTable[] = [];
  for (const relation of relations) {
    const name = `${identifier(relation.schema)}.${identifier(relation.name)}`;
    const bytes = await db.query({
      type: "arrow",
      sql: `SELECT * FROM ${name}`,
    });
    const hash = await digest(bytes);
    tables.push({ ...relation, hash, bytes: bytes.length });
    files.set(`/data/${hash}.arrow`, {
      body: bytes,
      type: "application/vnd.apache.arrow.stream",
    });
  }
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve("@duckdb/duckdb-wasm"));
  for (
    const [source, target, type] of [
      ["duckdb-eh.wasm", "engine.wasm", "application/wasm"],
      ["duckdb-browser-eh.worker.js", "worker.js", "text/javascript"],
    ]
  ) {
    files.set(`/wasm/${target}`, {
      body: await Deno.readFile(join(dist, source)),
      type,
    });
  }
  return { tables };
}
