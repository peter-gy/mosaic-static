import { assert, assertEquals } from "@std/assert";
import { serveDir } from "@std/http/file-server";
import { chromium } from "playwright";
import { build } from "../src/build/build.ts";
import config from "./fixtures/typed-build.ts";

Deno.test({
  name:
    "prerender, prepared interactions, and WASM share data and preserve selection through handoff",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const temp = await Deno.makeTempDir({ prefix: "mosaic-handoff-" });
    let server: Deno.HttpServer<Deno.NetAddr> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const result = await build(config, { out: `${temp}/app`, wasm: true });
      assertEquals(result.wasm, true);
      server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => serveDir(request, { fsRoot: temp, quiet: true }),
      );
      const origin = `http://127.0.0.1:${server.addr.port}`;
      browser = await chromium.launch();
      const preview = await browser.newContext({ javaScriptEnabled: false });
      const initial = await preview.newPage();
      await initial.goto(`${origin}/app/`);
      assert(
        (await initial.locator("#mosaic-static-preview").innerText()).includes(
          "9007199254740993",
        ),
      );
      assertEquals(
        await initial.getByLabel("Sensor", { exact: true }).first()
          .isDisabled(),
        true,
      );
      await preview.close();

      const context = await browser.newContext();
      const requests: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        requests.push(url);
        if (new URL(url).pathname.endsWith("/wasm.js")) await gate;
        assertEquals(new URL(url).origin, origin);
        await route.continue();
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${origin}/app/`);
      await page.waitForFunction(() =>
        document.documentElement.dataset.status === "ready"
      );
      await page.getByLabel("Sensor", { exact: true }).selectOption("B");
      await page.waitForFunction(() =>
        document.querySelector("pre")?.textContent?.includes("9007199254740995")
      );
      assertEquals(await page.locator("#mosaic-static-preview").count(), 0);
      assertEquals(await page.getByLabel("Sensor code").isDisabled(), true);
      release();
      await page.waitForFunction(
        () => document.documentElement.dataset.engine === "wasm",
        undefined,
        { timeout: 60000 },
      );
      assertEquals(
        await page.getByLabel("Sensor", { exact: true }).inputValue(),
        "B",
      );
      assertEquals(
        JSON.parse(await page.locator("pre").innerText())[0].reading,
        "9007199254740995",
      );
      const assetReads = requests.filter((url) =>
        url.includes("/assets/")
      ).length;
      await page.getByLabel("Sensor code").fill("unprepared-sensor");
      await page.waitForFunction(() =>
        document.querySelector("pre")?.textContent === "[]"
      );
      await page.getByLabel("Sensor code").fill("A");
      await page.waitForFunction(() =>
        document.querySelector("pre")?.textContent?.includes("9007199254740993")
      );
      const row = JSON.parse(await page.locator("pre").innerText())[0];
      assertEquals(row.day, "2025-01-01T00:00:00.000Z");
      assertEquals(row.uncertainty, 3.125);
      assertEquals(
        requests.filter((url) => url.includes("/assets/")).length,
        assetReads,
      );
      assertEquals(errors, []);
      await context.close();

      const offline = await browser.newContext();
      await offline.route("**/wasm.js", (route) => route.abort());
      const fallback = await offline.newPage();
      await fallback.goto(`${origin}/app/`);
      await fallback.waitForFunction(() =>
        document.documentElement.dataset.upgrade === "failed"
      );
      await fallback.getByLabel("Sensor", { exact: true }).selectOption("A");
      await fallback.waitForFunction(() =>
        document.querySelector("pre")?.dataset.rows === "1"
      );
      assertEquals(
        await fallback.evaluate(() => document.documentElement.dataset.engine),
        "static",
      );
      assertEquals(await fallback.getByRole("alert").count(), 0);
      await offline.close();
    } finally {
      await browser?.close();
      await server?.shutdown();
      await Deno.remove(temp, { recursive: true });
    }
  },
});
