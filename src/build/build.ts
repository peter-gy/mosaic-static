import {
  basename,
  dirname,
  fromFileUrl,
  isAbsolute,
  relative,
  resolve,
} from "@std/path";
import {
  canonical,
  digest,
  type Manifest,
  plan,
  readManifest,
} from "../protocol.ts";
import { NativeDatabase } from "../server/database.ts";
import { render } from "../server/render.ts";
import type { BuildConfig, BuildOptions } from "./config.ts";
import { Recorder } from "./record.ts";
import { bundle, html } from "./bundle.ts";
import { exportDatabase, type Files } from "./database.ts";
import { StaticConnector } from "../runtime/connector.ts";

async function bounded<T>(work: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() =>
          reject(
            new Error(
              `Server rendering exceeded ${timeout} ms. Await application work in mount(), apply(), or settled().`,
            ),
          ), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function build(config: BuildConfig, options: BuildOptions) {
  if (
    !(config.app instanceof URL) || config.app.protocol !== "file:" ||
    typeof config.prepare !== "function"
  ) {
    throw new Error(
      "Build config requires a file URL in app and a prepare(connection) function.",
    );
  }
  const out = resolve(options.out);
  for (
    const source of [
      Deno.cwd(),
      fromFileUrl(config.app),
      fromFileUrl(import.meta.url),
    ]
  ) {
    const path = relative(out, source);
    if (
      path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") &&
      !isAbsolute(path)
    ) {
      throw new Error(
        "Output must not contain the working directory or application source. Choose a dedicated export directory.",
      );
    }
  }
  const timeout = options.timeout ?? 30000;
  const maxStates = options.maxStates ?? 1000;
  const viewport = config.viewport ?? { width: 1280, height: 800 };
  if (
    [timeout, maxStates, viewport.width, viewport.height].some((n) =>
      !Number.isSafeInteger(n) || n < 1
    )
  ) {
    throw new Error(
      "Timeout, max-states, and viewport dimensions must be positive integers.",
    );
  }
  let existing: Deno.FileInfo | undefined;
  try {
    existing = await Deno.lstat(out);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  if (existing) {
    if (!options.replace || !existing.isDirectory || existing.isSymlink) {
      throw new Error(
        `Output exists: ${out}. Choose another directory or use --replace for an export.`,
      );
    }
    readManifest(JSON.parse(await Deno.readTextFile(`${out}/manifest.json`)));
  }
  await Deno.mkdir(dirname(out), { recursive: true });
  const work = await Deno.makeTempDir({
    dir: dirname(out),
    prefix: `.${basename(out)}-`,
  });
  const files: Files = new Map();
  let db: NativeDatabase | undefined;
  let active: Awaited<ReturnType<typeof render>> | undefined;
  let preserveWork = false;
  const progress = options.progress ?? (() => {});
  try {
    progress("Preparing data with native DuckDB");
    db = await NativeDatabase.open(`${work}/queries`);
    await bounded(Promise.resolve(config.prepare(db.connection)), timeout);
    const recorder = new Recorder((request) => db!.query(request));
    const source = await bundle(
      `import app from ${JSON.stringify(config.app.href)};
import { mount } from ${
        JSON.stringify(new URL("../runtime/session.ts", import.meta.url).href)
      };
globalThis.__render = (root, viewport) => mount(app, globalThis.__query, root, viewport);`,
      work,
      "server",
      "iife",
    );
    active = render(source, (request) => recorder.query(request), viewport);
    await bounded(active.settle(), timeout);
    const preview = options.prerender === false ? "" : active.preview();
    // Realm-local objects cross the server DOM boundary as plain publication data.
    const domains = JSON.parse(JSON.stringify(active.session.domains));
    const states = plan(domains, maxStates);
    const manifest: Manifest = {
      schema: "mosaic-static/v2",
      queries: recorder.queries,
      coverage: { domains, states: states.length, viewport, inspections: [] },
    };
    progress(`Preparing ${states.length} interaction states`);
    for (const state of states) {
      await bounded(active.apply(state), timeout);
      await bounded(active.settle(), timeout);
      const inspection = JSON.parse(JSON.stringify(active.session.inspect()));
      if (
        !manifest.coverage.inspections.some((i) =>
          canonical(i) === canonical(inspection)
        )
      ) manifest.coverage.inspections.push(inspection);
    }
    await active.dispose();
    active = undefined;
    recorder.stop();
    if (options.wasm) {
      progress("Packaging the optional browser database");
      manifest.database = await exportDatabase(db, files);
      files.set("/wasm.js", {
        body: await bundle(
          `export { openDatabase } from ${
            JSON.stringify(new URL("../runtime/wasm.ts", import.meta.url).href)
          };`,
          work,
          "wasm",
        ),
        type: "text/javascript",
      });
    }
    db.dispose();
    db = undefined;
    progress("Verifying prepared replay in a fresh server DOM");
    const connector = new StaticConnector(
      manifest,
      new URL("https://mosaic-static.invalid/"),
      ((url: URL) => {
        const hash = url.pathname.split("/").pop()!.replace(".arrow", "");
        const bytes = recorder.assets.get(hash);
        return Promise.resolve(
          bytes
            ? new Response(bytes as Uint8Array<ArrayBuffer>)
            : new Response("Missing asset", { status: 404 }),
        );
      }) as typeof fetch,
    );
    active = render(source, (request) => connector.query(request), viewport);
    await bounded(active.settle(), timeout);
    for (const state of states.toReversed()) {
      await bounded(active.apply(state), timeout);
      await bounded(active.settle(), timeout);
    }
    await active.dispose();
    active = undefined;
    const manifestText = canonical(manifest);
    const hash = await digest(new TextEncoder().encode(manifestText));
    const runtime = await bundle(
      `import app from ${JSON.stringify(config.app.href)};
import { boot } from ${
        JSON.stringify(new URL("../runtime/boot.ts", import.meta.url).href)
      };
const base = new URL("./", import.meta.url);
export const ready = boot(app, base, ${JSON.stringify(hash)}${
        options.wasm
          ? ', manifest => import(new URL("./wasm.js", import.meta.url).href).then(module => module.openDatabase(base, manifest))'
          : ""
      });
ready.catch(console.error);`,
      work,
      "app",
    );
    files.set("/app.js", { body: runtime, type: "text/javascript" });
    files.set("/manifest.json", {
      body: manifestText,
      type: "application/json",
    });
    files.set("/index.html", {
      body: html(config.title ?? "Mosaic", "app.js", preview),
      type: "text/html",
    });
    for (const [hash, body] of recorder.assets) {
      files.set(`/assets/${hash}.arrow`, {
        body,
        type: "application/vnd.apache.arrow.stream",
      });
    }
    const publication = `${work}/site`;
    for (const [path, file] of files) {
      await Deno.mkdir(dirname(`${publication}${path}`), { recursive: true });
      await Deno.writeFile(
        `${publication}${path}`,
        typeof file.body === "string"
          ? new TextEncoder().encode(file.body)
          : file.body,
      );
    }
    const backup = `${work}/previous`;
    if (existing) await Deno.rename(out, backup);
    try {
      await Deno.rename(publication, out);
    } catch (error) {
      if (existing) {
        try {
          await Deno.rename(backup, out);
        } catch (restoreError) {
          preserveWork = true;
          throw new AggregateError(
            [error, restoreError],
            `Previous export preserved at ${backup}.`,
          );
        }
      }
      throw error;
    }
    return {
      out,
      states: states.length,
      queries: Object.keys(manifest.queries).length,
      assets: recorder.assets.size,
      bytes: [...files.values()].reduce(
        (n, f) =>
          n +
          (typeof f.body === "string"
            ? new TextEncoder().encode(f.body).length
            : f.body.length),
        0,
      ),
      manifest: hash,
      prerender: !!preview,
      wasm: !!options.wasm,
    };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(String(error), { cause: error });
  } finally {
    db?.connection.interrupt();
    await active?.dispose();
    db?.dispose();
    if (!preserveWork) await Deno.remove(work, { recursive: true });
  }
}
