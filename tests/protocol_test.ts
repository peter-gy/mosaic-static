import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  canonical,
  digest,
  type Manifest,
  plan,
  readRequest,
  requestKey,
} from "../src/protocol.ts";
import { StaticConnector } from "../src/runtime/connector.ts";
import { Recorder } from "../src/build/record.ts";

Deno.test("finite state planning includes every combination and rejects ambiguous domains", () => {
  assertEquals(
    plan([{ name: "region", values: [null, "A"] }, {
      name: "year",
      values: [2024, 2025],
    }]),
    [
      { region: null, year: 2024 },
      { region: null, year: 2025 },
      { region: "A", year: 2024 },
      { region: "A", year: 2025 },
    ],
  );
  assertEquals(plan([]), [{}]);
  assertThrows(
    () => plan([{ name: "x", values: [1, 2] }], 1),
    Error,
    "exceeds",
  );
  assertThrows(
    () => plan([{ name: "x", values: [{ a: 1, b: 2 }, { b: 2, a: 1 }] }]),
    Error,
    "Duplicate",
  );
  assertThrows(() => plan([{ name: "x", values: [] }]), Error, "Invalid");
  assertThrows(() => canonical(NaN));
  assertThrows(
    () => readRequest({ type: "exec", sql: "DROP TABLE t" }),
    Error,
    "prepare",
  );
  assertThrows(() =>
    readRequest({ type: "arrow", sql: "select ?", params: [1] })
  );
});

Deno.test("query identity preserves literals and whitespace", async () => {
  const request = { type: "arrow" as const, sql: "SELECT 'a  b'" };
  assertEquals(
    await requestKey(request),
    await requestKey({ sql: request.sql, type: "arrow" }),
  );
  assertEquals(
    await requestKey(request) ===
      await requestKey({ ...request, sql: "SELECT 'a b'" }),
    false,
  );
});

Deno.test("static results coalesce fetches, protect bytes, evict, retry, and verify integrity", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = await digest(bytes);
  const request = { type: "arrow" as const, sql: "SELECT 1" };
  const key = await requestKey(request);
  const manifest: Manifest = {
    schema: "mosaic-static/v2",
    queries: { [key]: { request, hash, bytes: 3 } },
    coverage: {
      domains: [],
      states: 1,
      viewport: { width: 1280, height: 800 },
      inspections: [],
    },
  };
  let calls = 0;
  let broken = false;
  const fetcher = ((url: URL) => {
    calls++;
    assertEquals(url.href, `http://localhost/nested/assets/${hash}.arrow`);
    return Promise.resolve(new Response(broken ? new Uint8Array([4]) : bytes));
  }) as typeof fetch;
  const connector = new StaticConnector(
    manifest,
    new URL("http://localhost/nested/"),
    fetcher,
  );
  const [one, two] = await Promise.all([
    connector.query(request),
    connector.query(request),
  ]);
  assertEquals(calls, 1);
  one[0] = 9;
  assertEquals(two, bytes);
  assertEquals(await connector.query(request), bytes);
  assertEquals(calls, 1);
  await assertRejects(
    () => connector.query({ ...request, sql: "SELECT 2" }),
    Error,
    "Unprepared query",
  );
  await assertRejects(
    () => connector.query({ type: "exec", sql: "CREATE TABLE t(a INT)" }),
    Error,
    "prepare",
  );
  const uncached = new StaticConnector(
    manifest,
    new URL("http://localhost/nested/"),
    fetcher,
    0,
  );
  broken = true;
  await assertRejects(() => uncached.query(request), Error, "integrity");
  broken = false;
  assertEquals(await uncached.query(request), bytes);
});

Deno.test("capture evaluates each query once and shares identical assets", async () => {
  let calls = 0;
  const recorder = new Recorder(() => {
    calls++;
    return Promise.resolve(new Uint8Array([1, 2]));
  });
  await recorder.query({ type: "arrow", sql: "SELECT 1" });
  await recorder.query({ type: "arrow", sql: "SELECT 2" });
  assertEquals(recorder.assets.size, 1);
  assertEquals(Object.keys(recorder.queries).length, 2);
  await recorder.query({ type: "arrow", sql: "SELECT 1" });
  assertEquals(calls, 2);
});
