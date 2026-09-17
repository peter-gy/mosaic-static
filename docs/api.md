# Application and build API

The build module runs in Deno. Its `prepare` method receives a native
[`DuckDBConnection`](https://duckdb.org/docs/stable/clients/node_neo/overview),
with the full Node API for SQL, prepared statements, appending data, and
results.

```ts
import type { BuildConfig } from "../src/build/config.ts";

export default {
  app: new URL("./app.ts", import.meta.url),
  title: "My report",
  async prepare(connection) {
    await connection.run(`CREATE TABLE readings AS
      SELECT * FROM (VALUES ('A', 12), ('B', 18)) t(sensor, reading)`);
  },
} satisfies BuildConfig;
```

This fragment assumes a build module one directory below the repository root.
The runnable [flights build](../examples/flights/build.ts) loads local Parquet
through the same connection.

`BuildConfig.app` is a file URL pointing to the browser-compatible application
module. `title` supplies the HTML title. `viewport` supplies server rendering
dimensions and defaults to `{ width: 1280, height: 800 }`.

## Mount and activate

The application exports an [`App`](../src/app.ts):

```ts
interface App {
  ipc?: ExtractionOptions;
  mount(context: {
    root: HTMLElement;
    coordinator: Coordinator;
    engine: Param<"static" | "wasm">;
    viewport: { width: number; height: number };
  }): MountedApp | Promise<MountedApp>;
}
```

`mount` constructs the view and connects its clients to the provided Mosaic
coordinator. Use `createAPIContext({ coordinator })` for vgplot. Custom clients
extend `MosaicClient` or request data from that coordinator directly.

The same module executes in a server DOM and in the browser. Server rendering
supports HTML, SVG, and native 2D canvas. Use explicit plot dimensions or the
provided viewport for initial rendering. A server DOM does not compute browser
layout. Keep layout measurements, resize observers, WebGL, and other
browser-only effects in `activate()`.

`MountedApp` contains:

| Member       | Contract                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `axes`       | Named finite JSON domains and `apply(value)` functions. Omit for a single-state publication.    |
| `settled()`  | Await asynchronous work outside Mosaic's client and selection lifecycles.                       |
| `activate()` | Attach browser-only effects after prepared data has rendered and the preview has been replaced. |
| `dispose()`  | Release application resources before coordinator teardown.                                      |

`mount`, each `apply`, and `settled` must return their asynchronous work. The
exporter waits for Mosaic clients and selection dispatch, then a render frame,
and checks for newly scheduled work. It fails on query and renderer errors.

`ipc` contains Flechette decoding options, shared by every execution mode. Dates
default to JavaScript `Date`. Set `useBigInt: true` for integers outside the
safe JavaScript number range.

## Prepared inputs

Each axis sets an absolute value using the same operation as the corresponding
UI control. Domains can contain numbers, strings, booleans, nulls, arrays, and
objects. Arrays are appropriate for interval presets.

The exporter visits the Cartesian product, including intermediate queries and
initialization. Query identity includes the exact SQL. Keep predicate order
stable when controls change in different orders. Local display interactions,
such as sorting already-loaded rows, need no exported axis.

The prepared catalog represents a snapshot: each distinct query executes once.
Source setup finishes before capture starts. Rebuild when source data or query
logic changes. Volatile functions are evaluated at capture time. Use stable
queries when prepared and live behavior must agree exactly.

Before live execution is available, controls must stay within prepared query
coverage. Unprepared queries produce a visible error. Continuous brushes and
arbitrary searches can be enabled after the `engine` parameter becomes `wasm`.
The [flights example](../examples/flights/app.ts) demonstrates this transition.

The connector accepts Arrow read queries. Mosaic's `persist` cache hint is
accepted and excluded from query identity. Move DDL and source loading into
`prepare(connection)`. JSON-mode requests, query parameters supplied outside
SQL, and runtime database mutations are outside the publication contract.

## Initial HTML

The initial settled view is serialized before exploring other states. HTML and
SVG remain markup. Canvas becomes a PNG image. Form values are preserved, and
controls are disabled until activation. Preview IDs and references are renamed
so a connected staging tree can render without duplicate identifiers.

The browser keeps the preview visible while the live tree loads prepared data.
Once settled, it replaces the preview in one synchronous DOM operation, then
calls `activate()`. If activation fails, a visible error reports it. With
JavaScript disabled, the preview remains readable. `--no-prerender` starts with
an empty application host.

## Optional live database

`--wasm` packages local WASM JavaScript, its worker and binary, and complete
Arrow snapshots of user tables and materialized view results. Source table data
becomes public in this mode. It runs under ordinary HTTP with no cross-origin
isolation headers or CDN requests.

The runtime module loads after prepared activation. All relations must be loaded
before the query backend switches. Inflight prepared requests finish against
their original backend. Subsequent queries run in WASM through the same
coordinator. Selection objects and clients remain in place.

`engine` changes after the switch. The document's `data-engine` attribute is
`static` or `wasm`. A failed upgrade leaves the prepared backend active and
emits `mosaic-static-upgrade-error` with the error in `event.detail`.

The portable snapshot covers user tables and view results in the prepared
database. Extension functions, user-defined functions, attached databases,
sequences, and database writes need an application-specific live environment.
The shipped runtime uses DuckDB's single-worker exception-handling WASM build.
Browsers that cannot initialize it retain prepared interactions.

## CLI and library

```sh
deno task build examples/flights/build.ts --out dist/site --json
deno task build examples/flights/build.ts --out dist/site --replace --wasm
deno task serve --port 8017
```

| Option           | Default  | Meaning                                                   |
| ---------------- | -------- | --------------------------------------------------------- |
| `--out`          | Required | Dedicated output directory.                               |
| `--replace`      | Off      | Replace a valid current-format export after verification. |
| `--wasm`         | Off      | Include the background database.                          |
| `--no-prerender` | Off      | Omit initial rendered HTML.                               |
| `--max-states`   | 1000     | Maximum Cartesian state count.                            |
| `--timeout`      | 30000    | Maximum milliseconds for each server rendering operation. |
| `--json`         | Off      | Emit one build result object on stdout.                   |

The result contains `out`, `states`, `queries`, `assets`, `bytes`, `manifest`,
`prerender`, and `wasm`. Progress and diagnostics use stderr. Exit codes are 0
for success, 1 for a build failure, and 2 for invalid CLI arguments.

The library entry point is [`build(config, options)`](../src/build/build.ts).
Native database execution is bounded to one connection. Capture limits are
10,000 distinct queries and 256 MiB of unique prepared results. The optional
source database has its own size, independent of that result limit.

The browser validates the pinned manifest digest and every result's length and
SHA-256 hash. Result requests are coalesced and use a 16 MiB byte cache. Plain
HTTP uses JavaScript hashing where WebCrypto is unavailable. Deploy each
complete generation together and treat SQL text and published results as public
data.
