import { assert, assertEquals, assertRejects } from "@std/assert";
import { serveDir } from "@std/http/file-server";
import { chromium } from "playwright";
import { build } from "../src/build/build.ts";
import config from "./fixtures/typed-build.ts";
import { readManifest } from "../src/protocol.ts";

Deno.test({
  name:
    "custom clients publish typed results and run from a nested static path with database runtimes blocked",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const temp = await Deno.makeTempDir({ prefix: "mosaic-static-test-" });
    const out = `${temp}/nested/site`;
    let server: Deno.HttpServer<Deno.NetAddr> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const result = await build(config, { out });
      assertEquals(result.states, 4);
      const manifest = readManifest(
        JSON.parse(await Deno.readTextFile(`${out}/manifest.json`)),
      );
      assert(
        manifest.coverage.inspections.some((i) =>
          i.clients.some((c) => c.type === "Readings" && c.filtered)
        ),
      );
      const script = await Deno.readTextFile(`${out}/app.js`);
      assert(!/duckdb|WebAssembly|\.wasm|new Worker/.test(script));
      server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (r) =>
          serveDir(r, { fsRoot: temp, quiet: true, showDirListing: false }),
      );
      const origin = `http://127.0.0.1:${server.addr.port}`;
      const publicOrigin = "http://mosaic-static.test";
      browser = await chromium.launch();
      const page = await browser.newPage();
      const errors: string[] = [];
      const requests: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const forbidden = () => {
          throw new Error("Database runtime requested");
        };
        WebAssembly.instantiate = forbidden;
        WebAssembly.instantiateStreaming = forbidden;
        WebAssembly.compile = forbidden;
        WebAssembly.compileStreaming = forbidden;
        globalThis.Worker = forbidden as unknown as typeof Worker;
        globalThis.WebSocket = forbidden as unknown as typeof WebSocket;
      });
      await page.route("**/*", async (route) => {
        const request = route.request();
        requests.push(request.method() + " " + request.url());
        assertEquals(new URL(request.url()).origin, publicOrigin);
        assertEquals(request.method(), "GET");
        const response = await route.fetch({
          url: origin + new URL(request.url()).pathname,
        });
        await route.fulfill({ response });
      });
      await page.goto(`${publicOrigin}/nested/site/`);
      await page.waitForFunction(() =>
        document.documentElement.dataset.status === "ready"
      );
      const rows = JSON.parse(await page.locator("pre").innerText());
      assertEquals(await page.evaluate(() => isSecureContext), false);
      assertEquals(rows[0].reading, "9007199254740993");
      assertEquals(rows[0].day, "2025-01-01T00:00:00.000Z");
      assertEquals(rows[0].uncertainty, 3.125);
      assertEquals(rows[1].uncertainty, null);
      await page.getByLabel("Sensor", { exact: true }).selectOption("Empty");
      await page.waitForFunction(() =>
        document.querySelector("pre")?.textContent === "[]"
      );
      await page.getByLabel("Sensor", { exact: true }).selectOption("B");
      await page.waitForFunction(() =>
        document.querySelector("pre")?.textContent?.includes("9007199254740995")
      );
      assertEquals(JSON.parse(await page.locator("pre").innerText()).length, 1);
      assertEquals(errors, []);
      assert(requests.some((r) => r.endsWith(".arrow")));

      await page.route(
        "**/assets/*.arrow",
        (route) =>
          route.fulfill({
            body: "corrupt",
            contentType: "application/vnd.apache.arrow.stream",
          }),
      );
      await page.reload();
      await page.waitForFunction(() =>
        document.documentElement.dataset.status === "error"
      );
      assert(
        (await page.getByRole("alert").innerText()).includes(
          "integrity failure",
        ),
      );

      const before = await Deno.readTextFile(`${out}/manifest.json`);
      await assertRejects(() => build(config, { out }), Error, "Output exists");
      await assertRejects(
        () => build(config, { out, replace: true, maxStates: 1 }),
        Error,
        "exceeds",
      );
      assertEquals(await Deno.readTextFile(`${out}/manifest.json`), before);
      await assertRejects(
        () =>
          build({
            ...config,
            app: new URL("./fixtures/render-error.ts", import.meta.url),
          }, { out, replace: true }),
        Error,
        "Renderer rejected",
      );
      assertEquals(await Deno.readTextFile(`${out}/manifest.json`), before);
      const replacement = await build(config, { out, replace: true });
      assertEquals(replacement.states, result.states);
      assertEquals(replacement.queries, result.queries);
      const foreign = `${temp}/foreign`;
      await Deno.mkdir(foreign);
      await Deno.writeTextFile(`${foreign}/keep.txt`, "user data");
      await assertRejects(() => build(config, { out: foreign, replace: true }));
      assertEquals(await Deno.readTextFile(`${foreign}/keep.txt`), "user data");
      await assertRejects(
        () => build(config, { out: ".", replace: true }),
        Error,
        "source",
      );
    } finally {
      await browser?.close();
      await server?.shutdown();
      await Deno.remove(temp, { recursive: true });
    }
  },
});

Deno.test("CLI help and usage errors have stable exit boundaries", async () => {
  for (
    const [args, code] of [[["--help"], 0], [["build"], 2], [[
      "build",
      "x.ts",
      "--out",
      "dist",
      "--max-states",
      "0",
    ], 2], [["--nonsense"], 2]] as const
  ) {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "main.ts", ...args],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(output.code, code);
    if (code === 0) {
      assert(
        new TextDecoder().decode(output.stdout).includes("mosaic-static build"),
      );
    } else assertEquals(output.stdout.length, 0);
  }
});
