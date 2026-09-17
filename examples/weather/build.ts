import { fromFileUrl } from "@std/path";
import { literal } from "@uwdata/mosaic-sql";
import type { BuildConfig } from "../../src/build/config.ts";

export default {
  app: new URL("./app.ts", import.meta.url),
  title: "Seattle weather",
  async prepare(db) {
    const file = fromFileUrl(
      new URL("../data/seattle-weather.parquet", import.meta.url),
    );
    await db.run(
      `CREATE TABLE weather AS SELECT *, year(date)::INTEGER AS year, month(date)::INTEGER AS month FROM read_parquet(${
        literal(file)
      })`,
    );
  },
} satisfies BuildConfig;
