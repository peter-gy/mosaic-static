import { clauseInterval, MosaicClient, Param } from "@uwdata/mosaic-core";
import { type FilterExpr, Query, sql } from "@uwdata/mosaic-sql";
import { createAPIContext } from "@uwdata/vgplot";
import type { Table } from "@uwdata/flechette";
import type { App, Axis } from "../../src/app.ts";
import { format, page } from "../shared/ui.ts";
import { StableSelection } from "../shared/selection.ts";

class RangeSelection extends StableSelection {
  override update(clause: Parameters<StableSelection["update"]>[0]) {
    const previous = this.clauses.filter((c) =>
      c.source !== clause.source &&
      String(c.fields[0]) === String(clause.fields[0])
    );
    if (previous.length) this.reset(previous);
    return super.update(clause);
  }
}

export const filters = [
  {
    field: "delay",
    label: "Arrival delay",
    unit: "minutes",
    domain: [-60, 180],
    step: 10,
    labels: [
      "All arrivals",
      "Early / on time",
      "Up to 30 min late",
      "30+ min late",
    ],
    values: [null, [-60, 0], [0, 30], [30, 180]],
  },
  {
    field: "time",
    label: "Departure time",
    unit: "hour of day",
    domain: [0, 24],
    step: 1,
    labels: ["All day", "Midnight–6am", "6am–noon", "Noon–6pm", "6pm–midnight"],
    values: [null, [0, 6], [6, 12], [12, 18], [18, 24]],
  },
  {
    field: "distance",
    label: "Distance flown",
    unit: "miles",
    domain: [0, 2500],
    step: 100,
    labels: ["All distances", "Up to 750 mi", "750–1,500 mi", "1,500+ mi"],
    values: [null, [0, 750], [750, 1500], [1500, 2500]],
  },
];

export default {
  mount({ root, coordinator, engine, viewport }) {
    const find = page(
      root,
      "Flight patterns",
      "Arrival delays, departure times and distances across 231,083 flights.",
      `
      <div class="toolbar"><button id="reset">Reset filters</button><span class="hint" id="interaction">Each range filters the other charts.</span></div>
      <section class="stats" aria-label="Selected flights"><div><strong id="count">…</strong><small>Selected flights</small></div><div><strong id="delay">…</strong><small>Average arrival delay · min</small></div><div><strong id="ontime">…</strong><small>Arrived on time</small></div></section>
      ${
        filters.map((f) =>
          `<section class="panel"><div class="panel-heading"><h2>${f.label}</h2><label><select id="filter-${f.field}" aria-label="${f.label}">${
            f.labels.map((label, i) => `<option value="${i}">${label}</option>`)
              .join("")
          }</select></label></div><div class="chart" id="chart-${f.field}" style="pointer-events:none"></div></section>`
        ).join("")
      }
      <footer>Source: <a href="https://uwdata.github.io/mosaic/examples/flights-200k.html">Mosaic flights</a>. Range boundaries are inclusive.</footer>`,
    );
    const brush = new RangeSelection({ cross: true });
    const width = Param.value(Math.min(1000, viewport.width - 56));
    const vg = createAPIContext({ coordinator });
    class Summary extends MosaicClient {
      override query(filter: FilterExpr) {
        return Query.from("flights").select({
          count: sql`count(*)::DOUBLE`,
          delay: sql`avg(delay)`,
          ontime: sql`100.0 * avg(CASE WHEN delay <= 0 THEN 1 ELSE 0 END)`,
        }).where(filter);
      }
      override queryResult(data: Table) {
        const row = data.toArray()[0];
        for (const key of ["count", "delay", "ontime"]) {
          find(key).textContent = row[key] == null
            ? "–"
            : format.format(Number(row[key])) + (key === "ontime" ? "%" : "");
          find(key).dataset.value = String(row[key]);
        }
        return this;
      }
    }
    coordinator.connect(new Summary(brush));
    const axes: Axis[] = filters.map((f) => {
      const source = {};
      let clients = new Set<MosaicClient>();
      const select = find<HTMLSelectElement>(`filter-${f.field}`);
      find(`chart-${f.field}`).append(vg.plot(
        vg.rectY(vg.from("flights", { filterBy: brush }), {
          x: vg.bin(f.field, { step: f.step }),
          y: vg.count(),
          fill: "currentColor",
          insetLeft: 0.5,
          insetRight: 0.5,
        }),
        (plot: { markSet: Set<MosaicClient> }) => {
          clients = plot.markSet;
        },
        vg.intervalX({
          as: brush,
          brush: {
            fill: "currentColor",
            fillOpacity: 0.08,
            stroke: "currentColor",
          },
        }),
        vg.xDomain(f.domain),
        vg.xLabel(f.unit),
        vg.yLabel(null),
        vg.yTickFormat("s"),
        vg.width(width),
        vg.height(180),
        vg.marginLeft(50),
      ));
      const apply: Axis["apply"] = async (value) => {
        select.value = String(
          f.values.findIndex((v) =>
            JSON.stringify(v) === JSON.stringify(value)
          ),
        );
        brush.update(
          clauseInterval(f.field, value as [number, number] | null, {
            source,
            clients,
          }),
        );
        await brush.pending("value");
      };
      select.addEventListener("change", () => {
        void apply(f.values[Number(select.value)]);
      });
      return { name: f.field, values: f.values, apply };
    });
    find("reset").addEventListener("click", () => {
      brush.reset();
      for (const f of filters) {
        find<HTMLSelectElement>(`filter-${f.field}`).value = "0";
      }
    });
    brush.addEventListener("value", () => {
      for (const f of filters) {
        const range = brush.clauses.find((c) =>
          String(c.fields[0]) === `"${f.field}"`
        )?.value ?? null;
        find(`chart-${f.field}`).dataset.range = JSON.stringify(range);
        const select = find<HTMLSelectElement>(`filter-${f.field}`);
        const index = f.values.findIndex((value) =>
          JSON.stringify(value) === JSON.stringify(range)
        );
        if (index < 0 && !select.querySelector('[value="custom"]')) {
          const option = new Option("Custom range", "custom");
          option.disabled = true;
          select.add(option);
        }
        select.value = index < 0 ? "custom" : String(index);
      }
    });
    engine.addEventListener("value", () => {
      for (const f of filters) {
        find(`chart-${f.field}`).style.pointerEvents = "auto";
      }
      find("interaction").textContent = "Drag a chart to select any range.";
    });
    let observer: ResizeObserver | undefined;
    return {
      axes,
      settled: () => width.pending("value"),
      activate() {
        observer = new ResizeObserver(() =>
          width.update(find("chart-delay").clientWidth)
        );
        observer.observe(find("chart-delay"));
      },
      dispose: () => observer?.disconnect(),
    };
  },
} satisfies App;
