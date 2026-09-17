import type { BuildConfig } from "../../src/build/config.ts";

export default {
  app: new URL("./typed-app.ts", import.meta.url),
  title: "Custom Mosaic client",
  async prepare(db) {
    await db.run(`CREATE TABLE readings AS SELECT * FROM (VALUES
      ('A', 9007199254740993::BIGINT, '2025-01-01'::DATE, 3.125::DECIMAL(10,3)),
      ('B', 9007199254740995::BIGINT, '2025-02-01'::DATE, NULL)
    ) t(sensor, reading, day, uncertainty)`);
  },
} satisfies BuildConfig;
