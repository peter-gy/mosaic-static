# Server execution and static publication

Mosaic Static executes a Mosaic application in an isolated server DOM with an
injected native database. Its clients and renderers remain the source of truth.
A versioned publication separates that execution from browser delivery.

```text
CLI → build → native DuckDB connection
           → server DOM + native canvas → Mosaic application
           → query catalog + initial HTML + optional database snapshot

browser → same application → Mosaic coordinator → prepared Arrow reader
                                             ↘ optional DuckDB-WASM
```

## Execution boundary

`server/database.ts` owns `@duckdb/node-api`. The build's `prepare` callback
receives the actual `DuckDBConnection`. After preparation, the native driver
executes client SQL and writes complete Arrow IPC streams through nanoarrow.
Using its stream writer preserves schema for empty results and writes the stream
terminator needed by WASM's Arrow importer. Temporary files belong to the build
workspace and are released after reading.

`server/render.ts` supplies an isolated JSDOM realm and native 2D canvas through
`@napi-rs/canvas`. The bundled application and shared Mosaic session execute in
that realm. Query calls cross directly to the native connection in the Deno
process. Rendering never requires a query server or browser process.

The host provides explicit viewport dimensions, not a browser layout engine.
`mount()` must be renderable with those dimensions. `activate()` owns
browser-only observers and layout-dependent effects. The renderer closes its
realm and native resources when work finishes or fails.

## Prepared query catalog

For finite input domains `D₁ … Dₙ`, preparation explores `S = D₁ × … × Dₙ`. It
captures the initial query set and queries generated while visiting every state.
Repeated requests share one execution. Distinct requests whose Arrow bytes match
share one content-addressed asset.

The `mosaic-static/v2` manifest maps exact request hashes to result hashes,
lengths, and SQL. Its coverage record includes domains, state count, render
viewport, and observed client-selection graphs. These graphs expose connected
clients, enabled state, clause fields, selection membership, and generated SQL.

The declaration of finite domains remains necessary. Introspection cannot infer
every future query from arbitrary JavaScript, continuous input, hidden timers,
or interaction history. Stable query construction and explicit asynchronous
ownership make coverage testable. Browser tests exercise real UI orders beyond
the server's forward and reverse traversal.

SQL text is preserved, including literals and whitespace. A request's transport
hint `persist` does not affect result identity. Consolidation and preaggregation
are disabled in every mode so temporary tables and timing-dependent grouping
cannot change the query contract. The reader caches bytes and decodes a fresh
table for each request to isolate client mutations.

After capture, the native database closes. A fresh server realm replays the
states in reverse order from the prepared catalog. Publication occurs after this
check, through a staging directory. Failed builds preserve the existing export.
Browser validation is a separate test workflow.

## Initial rendering and activation

The serializer captures the initial settled view before enumeration. It
preserves form values, freezes canvas as images, and renames IDs and references.
The preview remains visible during client mounting. A hidden, connected staging
tree permits normal browser layout. Once its data and rendering settle, the
runtime replaces the preview and activates browser effects.

This is initial prerendering followed by client mounting. It does not resume
event listeners from server memory. Source data preparation and query execution
have already happened, while the browser still performs its rendering pass.

## Background database handoff

With `--wasm`, user relations are exported as complete Arrow streams and loaded
into a same-origin DuckDB worker. Views are materialized as relation snapshots.
The JavaScript module, worker, and WASM binary are separate assets loaded after
prepared activation. Arrow import avoids a runtime Parquet-extension download.

`Handoff` changes one backend reference after the database is ready. Requests
retain the backend they started with. It never rebuilds clients or selection
objects. Disposal invalidates a pending upgrade, and failed initialization
preserves prepared operation. The application's reactive `engine` parameter
controls when unrestricted input becomes available.

Native and WASM execution share SQL and Arrow types. The versions are pinned
against the verified examples. Matching SQL syntax does not imply universal
extension or user-defined-function parity, so the portable contract consists of
queryable relation snapshots.

## Dependency direction

- `protocol.ts` contains finite-state planning, identity, and publication types.
- `runtime/` consumes those types and Mosaic, with the optional WASM entry
  isolated.
- `server/` owns native execution and rendering facilities.
- `build/` owns orchestration, bundling, and filesystem publication.
- The CLI parses inputs and reports the library result.

The browser app imports neither the build module nor native database code.
Playwright and agent-browser are used by tests. Hyparquet independently decodes
the real Parquet fixtures to calculate expected results without DuckDB.

## Source analysis

The design draws on these inspected source trees:

| Source                                                        | Revision                                   | Applied principle                                                                     |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| [Mosaic](https://github.com/uwdata/mosaic)                    | `a2d19c3126beceb322119a7d471698bb850bcb3b` | Coordinator-mediated queries, reactive selections, client lifecycle, Arrow transport. |
| [Mosaic Publisher](https://github.com/uwdata/mosaic-publish)  | `e71c525bfc7dbc861334ab66420b219bbdb2c2f4` | Server DOM rendering, interaction discovery, publish-time data preparation.           |
| [marimo-export](https://github.com/marimo-team/marimo-export) | `41fc6b68289dd893f8555af556a90d19fd35bb7f` | Finite prepared states, immutable publication, lazy verified browser reads.           |

The
[publish-time optimization paper](https://idl.cs.washington.edu/files/2025-PublishTimeOpt-VIS.pdf)
separates preparation, precomputation, and initial rendering. These stages
remain independent here: a publication may omit the preview, and adding WASM
changes later query execution without changing the prepared interaction
contract.

The runtime targets published Mosaic 0.31.0, whose connector returns a decoded
Flechette table. The examined development checkout has moved IPC decoding into
the query manager. Upgrading Mosaic requires checking that boundary and
rebuilding publications.

[DuckDB's Arrow IPC documentation](https://duckdb.org/2025/05/23/arrow-ipc-support-in-duckdb)
describes the native stream writer used by the server driver.
