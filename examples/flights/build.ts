import { fromFileUrl } from "@std/path";
import { literal } from "@uwdata/mosaic-sql";
import type { BuildConfig } from "../../src/build/config.ts";

export default {
  app: new URL("./app.ts", import.meta.url),
  title: "Flight patterns",
  async prepare(db) {
    const file = fromFileUrl(
      new URL("../data/flights-200k.parquet", import.meta.url),
    );
    await db.run(
      `CREATE TABLE flights AS SELECT * FROM read_parquet(${literal(file)})`,
    );
  },
} satisfies BuildConfig;
