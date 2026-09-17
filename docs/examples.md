# Examples and validation

## Flight patterns

```sh
deno task demo
deno task demo:wasm
deno task serve
```

Open `/flights/` for prepared interactions or `/flights-wasm/` for the optional
live database. Both show arrival delay, departure time, and flight distance for
231,083 records. Eighty combinations of range presets are prepared.

The histograms share a cross-filter selection: a filter affects the other
histograms and the summary while its source histogram retains its distribution.
When the live database is ready, drag a histogram to select arbitrary intervals.
Reset clears the combined selection.

Source:
[Mosaic's flights example](https://uwdata.github.io/mosaic/examples/flights-200k.html).
The dataset is the unmodified `data/flights-200k.parquet` from the Mosaic
revision recorded in [Architecture](architecture.md).

## Seattle weather

```sh
deno task demo:weather
```

Open `/weather/`. The 1,461 observations cover 2012 through 2015. Year and
season select 25 prepared datasets. Weather-type buttons, point inspection, and
table ranking operate on the loaded rows, so these interactions remain available
in a fully static publication.

The canvas scatterplot, summary, and ranked table are custom views connected to
a Mosaic client. The server renders its canvas into the initial HTML, and
`activate()` attaches responsive browser rendering.

Source:
[Mosaic's Seattle weather example](https://uwdata.github.io/mosaic/examples/weather.html),
based on the Vega-Lite/Altair example credited to Jake VanderPlas. The dataset
is the unmodified `data/seattle-weather.parquet` from the same Mosaic revision.
The upstream notice is retained in
[the dataset directory](../examples/data/NOTICE).

## Run checks

```sh
deno task check
deno task browser:install
deno task test
deno task test:browser
```

Build the examples before `test:browser`. Use `--replace` on later builds:

```sh
deno task build examples/flights/build.ts --out dist/flights --replace
deno task build examples/weather/build.ts --out dist/weather --replace
deno task build examples/flights/build.ts --out dist/flights-wasm --replace --wasm
```

The agent-browser harness compares actual rendered values with independent
calculations from hyparquet. It traverses flight presets in different control
orders, checks weather filters, sends rapid changes, and captures desktop and
mobile screenshots in `nogit/evidence/`. It repeats the flight checks against
WASM and verifies a free-form brush against a separately decoded dataset.

Integration tests verify plain HTTP and nested paths, typed and empty results,
prerendered content with JavaScript disabled, corruption handling, safe output
replacement, and the optional WASM handoff. The handoff test holds the runtime
download while changing a prepared selection, releases it, verifies selection
preservation, then executes an unprepared input. It also checks continued static
operation when the runtime download fails.
