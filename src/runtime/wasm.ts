import { AsyncDuckDB, VoidLogger } from "@duckdb/duckdb-wasm";
import { digest, identifier, type Manifest, readRequest } from "../protocol.ts";
import type { Backend } from "./handoff.ts";

export async function openDatabase(
  base: URL,
  manifest: Manifest,
): Promise<Backend> {
  if (!manifest.database) {
    throw new Error("This publication has no database snapshot.");
  }
  const worker = new Worker(new URL("wasm/worker.js", base));
  const db = new AsyncDuckDB(new VoidLogger(), worker);
  const timer = setTimeout(() => {
    void db.terminate();
  }, 60000);
  try {
    await db.instantiate(new URL("wasm/engine.wasm", base).href);
    await db.open({
      query: {
        castBigIntToDouble: false,
        castTimestampToDate: false,
        castDecimalToDouble: false,
      },
    });
    const connection = await db.connect();
    for (const table of manifest.database.tables) {
      const response = await fetch(new URL(`data/${table.hash}.arrow`, base));
      if (!response.ok) {
        throw new Error(
          `Database table failed to load: HTTP ${response.status}`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== table.bytes || await digest(bytes) !== table.hash) {
        throw new Error(`Database table integrity failure: ${table.name}`);
      }
      await connection.query(
        `CREATE SCHEMA IF NOT EXISTS ${identifier(table.schema)}`,
      );
      await connection.insertArrowFromIPCStream(bytes, {
        schema: table.schema,
        name: table.name,
      });
    }
    return {
      query(input) {
        const { sql } = readRequest(input);
        return connection.useUnsafe((bindings, handle) =>
          bindings.runQuery(handle, sql)
        );
      },
      async dispose() {
        await connection.close();
        await db.terminate();
      },
    };
  } catch (error) {
    await db.terminate();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
