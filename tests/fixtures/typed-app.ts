import { clausePoint, MosaicClient, Selection } from "@uwdata/mosaic-core";
import { type FilterExpr, Query } from "@uwdata/mosaic-sql";
import type { Table } from "@uwdata/flechette";
import type { App } from "../../src/app.ts";
import type { Value } from "../../src/protocol.ts";

export default {
  ipc: { useBigInt: true },
  async mount({ root, coordinator, engine }) {
    const selection = Selection.intersect();
    const source = {};
    const values = ["All", "A", "B", "Empty"];
    root.innerHTML =
      `<h1>Sensor readings</h1><label>Sensor <select aria-label="Sensor"></select></label><label>Sensor code <input aria-label="Sensor code" disabled></label><pre aria-live="polite"></pre>`;
    const select = root.querySelector("select")!;
    const output = root.querySelector("pre")!;
    values.forEach((value) => select.add(new Option(value, value)));
    class Readings extends MosaicClient {
      override async prepare() {
        const metadata = await coordinator.query(
          "SELECT count(*)::INTEGER AS n FROM readings",
        );
        root.dataset.total = String(metadata.getChild("n")!.get(0));
      }
      override query(filter: FilterExpr) {
        return Query.from("readings").select("*").where(filter).orderby(
          "sensor",
        );
      }
      override queryResult(data: Table) {
        output.textContent = JSON.stringify(
          data.toArray(),
          (_, value) => typeof value === "bigint" ? String(value) : value,
          2,
        );
        output.dataset.rows = String(data.numRows);
        return this;
      }
    }
    coordinator.connect(new Readings(selection));
    const apply = async (value: Value) => {
      if (engine.value === "static" && !values.includes(String(value))) {
        throw new Error("Unknown sensor.");
      }
      select.value = String(value);
      selection.update(
        clausePoint("sensor", value === "All" ? undefined : value, { source }),
      );
      await selection.pending("value");
    };
    select.addEventListener("change", () => {
      void apply(select.value);
    });
    const input = root.querySelector("input")!;
    input.addEventListener("input", () => {
      void apply(input.value);
    });
    engine.addEventListener("value", () => {
      input.disabled = false;
    });
    await apply("All");
    return { axes: [{ name: "sensor", values, apply }] };
  },
} satisfies App;
