import { sha256 } from "@noble/hashes/sha2.js";

export type Value = null | boolean | number | string | Value[] | {
  [key: string]: Value;
};
export type State = Record<string, Value>;
export interface Request {
  type: "arrow";
  sql: string;
}
export interface Asset {
  hash: string;
  bytes: number;
}
export interface QueryEntry extends Asset {
  request: Request;
}
export interface Domain {
  name: string;
  values: readonly Value[];
}
export interface ClientInfo {
  type: string;
  enabled: boolean;
  filtered: boolean;
  query: string | null;
}
export interface Inspection {
  clients: ClientInfo[];
  selections: {
    clients: number[];
    clauses: { type: string; fields: string[] }[];
  }[];
}
export interface Manifest {
  schema: "mosaic-static/v2";
  database?: { tables: PublishedTable[] };
  queries: Record<string, QueryEntry>;
  coverage: {
    domains: Domain[];
    states: number;
    viewport: { width: number; height: number };
    inspections: Inspection[];
  };
}

export interface PublishedTable extends Asset {
  schema: string;
  name: string;
}

export function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function canonical(value: unknown): string {
  if (
    value === null || typeof value === "boolean" || typeof value === "string"
  ) return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  ) {
    return `{${
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map((
        [k, v],
      ) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")
    }}`;
  }
  throw new Error("Expected a finite JSON value.");
}

export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = globalThis.crypto?.subtle
    ? await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)
    : sha256(bytes);
  return Array.from(
    new Uint8Array(hash),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

export function requestKey(request: Request): Promise<string> {
  return digest(new TextEncoder().encode(canonical(request)));
}

export function readRequest(value: unknown): Request {
  const r = value as Request;
  if (
    !r || r.type !== "arrow" || typeof r.sql !== "string" || !r.sql.trim() ||
    Object.keys(r).some((k) =>
      k !== "type" && k !== "sql" && k !== "persist"
    ) ||
    ("persist" in r && typeof r.persist !== "boolean")
  ) {
    throw new Error(
      `Static applications require Arrow read queries. Received type ${r?.type} with keys ${
        Object.keys(r ?? {}).join(", ")
      }. Move setup SQL into build.prepare(). Query options are not supported.`,
    );
  }
  return { type: "arrow", sql: r.sql };
}

export function plan(domains: readonly Domain[], limit = 1000): State[] {
  const names = new Set<string>();
  let states: State[] = [{}];
  for (const { name, values } of domains) {
    if (!name || names.has(name) || !Array.isArray(values) || !values.length) {
      throw new Error(`Invalid or duplicate domain: ${name}`);
    }
    names.add(name);
    if (new Set(values.map(canonical)).size !== values.length) {
      throw new Error(`Duplicate values in domain: ${name}`);
    }
    if (states.length * values.length > limit) {
      throw new Error(
        `Interaction space exceeds ${limit} states. Reduce domains or raise --max-states.`,
      );
    }
    states = states.flatMap((state) =>
      values.map((value) => ({ ...state, [name]: value }))
    );
  }
  return states;
}

export function readManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (!m || m.schema !== "mosaic-static/v2" || !m.queries || !m.coverage) {
    throw new Error("Invalid mosaic-static manifest.");
  }
  for (const [key, entry] of Object.entries(m.queries)) {
    if (
      !/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(entry.hash) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
    ) throw new Error("Invalid query asset reference.");
    readRequest(entry.request);
  }
  return m;
}
