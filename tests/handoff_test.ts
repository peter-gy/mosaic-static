import { assertEquals, assertRejects } from "@std/assert";
import { type Backend, Handoff } from "../src/runtime/handoff.ts";

Deno.test("handoff preserves inflight reads and commits new requests to the loaded database", async () => {
  let release!: (value: Uint8Array) => void;
  let load!: (value: Backend) => void;
  const prepared = new Promise<Uint8Array>((resolve) => {
    release = resolve;
  });
  const handoff = new Handoff({ query: () => prepared });
  const first = handoff.query({});
  const ready = handoff.start(() =>
    new Promise((resolve) => {
      load = resolve;
    })
  );
  await Promise.resolve();
  let closes = 0;
  load({
    query: () => Promise.resolve(new Uint8Array([2])),
    dispose() {
      closes++;
    },
  });
  assertEquals(await ready, true);
  assertEquals(await handoff.query({}), new Uint8Array([2]));
  release(new Uint8Array([1]));
  assertEquals(await first, new Uint8Array([1]));
  await Promise.all([handoff.dispose(), handoff.dispose()]);
  assertEquals(closes, 1);
  await assertRejects(() => handoff.query({}), Error, "disposed");
});

Deno.test("failed and disposed upgrades leave no partially active database", async () => {
  const handoff = new Handoff({
    query: () => Promise.resolve(new Uint8Array([1])),
  });
  await assertRejects(
    () =>
      handoff.start(() => {
        throw new Error("offline");
      }),
    Error,
    "offline",
  );
  assertEquals(await handoff.query({}), new Uint8Array([1]));
  const abandoned = new Handoff({
    query: () => Promise.resolve(new Uint8Array()),
  });
  let load!: (value: Backend) => void;
  const ready = abandoned.start(() =>
    new Promise((resolve) => {
      load = resolve;
    })
  );
  await Promise.resolve();
  await abandoned.dispose();
  let closed = false;
  load({
    query: () => Promise.resolve(new Uint8Array()),
    dispose() {
      closed = true;
    },
  });
  assertEquals(await ready, false);
  assertEquals(closed, true);
});
