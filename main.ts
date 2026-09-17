import { parseArgs } from "@std/cli/parse-args";
import { resolve, toFileUrl } from "@std/path";

const help = `mosaic-static build <build.ts> --out <directory> [options]

Prepare Mosaic query results and verify a standalone static application.

  --out <directory>       Output directory (required)
  --replace               Replace a previous mosaic-static export after verification
  --wasm                  Load a local DuckDB-WASM database after static activation
  --no-prerender          Omit the initial rendered HTML preview
  --max-states <count>    Maximum Cartesian interaction states (default 1000)
  --timeout <ms>          Per-state server rendering timeout (default 30000)
  --json                  Print the build result as JSON
  --help                  Show this help

deno task build examples/flights/build.ts --out dist/flights
deno task serve

Build modules are trusted executable code. Builds run native DuckDB and server-side rendering.
Progress and errors go to stderr. Exit codes: 0 success, 1 build failure, 2 usage error.`;

export async function run(args: string[]): Promise<number> {
  let flags: ReturnType<typeof parseArgs>;
  try {
    flags = parseArgs(args, {
      string: ["out", "max-states", "timeout"],
      boolean: ["help", "replace", "json", "wasm", "prerender"],
      default: { prerender: true },
      unknown(arg) {
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        return true;
      },
    });
    if (flags.help) {
      console.log(help);
      return 0;
    }
    if (flags._.length !== 2 || flags._[0] !== "build" || !flags.out) {
      throw new Error(help);
    }
    for (const key of ["max-states", "timeout"]) {
      if (
        flags[key] !== undefined &&
        (!/^\d+$/.test(flags[key]) || Number(flags[key]) < 1)
      ) throw new Error(`--${key} requires a positive integer.`);
    }
  } catch (error) {
    console.error(String(error));
    return 2;
  }
  try {
    const { build } = await import("./src/build/build.ts");
    const config =
      (await import(toFileUrl(resolve(String(flags._[1]))).href)).default;
    const result = await build(config, {
      out: flags.out,
      wasm: flags.wasm,
      prerender: flags.prerender,
      replace: flags.replace,
      maxStates: flags["max-states"] === undefined
        ? undefined
        : Number(flags["max-states"]),
      timeout: flags.timeout === undefined ? undefined : Number(flags.timeout),
      progress: (message) => console.error(message),
    });
    console.log(
      flags.json
        ? JSON.stringify(result)
        : `Built ${result.out}: ${result.states} states, ${result.queries} queries, ${result.assets} assets, ${
          (result.bytes / 1024).toFixed(1)
        } KiB`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) Deno.exitCode = await run(Deno.args);
