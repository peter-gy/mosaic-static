import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { readRequest } from "../protocol.ts";

/** Own one native database and emit complete, typed Arrow IPC streams. */
export class NativeDatabase {
  private sequence = 0;
  private constructor(
    readonly connection: DuckDBConnection,
    private readonly instance: DuckDBInstance,
    private readonly scratch: string,
  ) {}

  static async open(scratch: string) {
    await Deno.mkdir(scratch, { recursive: true });
    const instance = await DuckDBInstance.create(":memory:", { threads: "1" });
    const connection = await instance.connect();
    try {
      await connection.run("INSTALL nanoarrow FROM community; LOAD nanoarrow");
      return new NativeDatabase(connection, instance, scratch);
    } catch (error) {
      connection.closeSync();
      instance.closeSync();
      throw error;
    }
  }

  async query(input: unknown): Promise<Uint8Array> {
    const { sql } = readRequest(input);
    const file = `${this.scratch}/${this.sequence++}.arrow`;
    // COPY emits complete streams, including schema for zero-row results.
    await this.connection.run(
      `COPY (SELECT * FROM (${sql})) TO '${
        file.replaceAll("'", "''")
      }' (FORMAT ARROWS)`,
    );
    try {
      return await Deno.readFile(file);
    } finally {
      await Deno.remove(file);
    }
  }

  dispose() {
    this.connection.closeSync();
    this.instance.closeSync();
  }
}
