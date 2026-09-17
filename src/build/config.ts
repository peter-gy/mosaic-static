import type { DuckDBConnection } from "@duckdb/node-api";
import type { Viewport } from "../app.ts";

export interface BuildConfig {
  /** Browser module exporting an App. Resolve relative paths with import.meta.url. */
  app: URL;
  title?: string;
  prepare(db: DuckDBConnection): void | Promise<void>;
  viewport?: Viewport;
}
export interface BuildOptions {
  out: string;
  prerender?: boolean;
  wasm?: boolean;
  replace?: boolean;
  maxStates?: number;
  timeout?: number;
  progress?: (message: string) => void;
}
