import {
  clauseInterval,
  clausePoint,
  MosaicClient,
  Param,
} from "@uwdata/mosaic-core";
import { type FilterExpr, Query } from "@uwdata/mosaic-sql";
import type { Table } from "@uwdata/flechette";
import type { App, Axis } from "../../src/app.ts";
import { format, page } from "../shared/ui.ts";
import { StableSelection } from "../shared/selection.ts";

interface Day {
  date: Date;
  temp_max: number;
  precipitation: number;
  weather: string;
  month: number;
}
const conditions = ["sun", "fog", "drizzle", "rain", "snow"];

export default {
  mount({ root, coordinator, viewport }) {
    const find = page(
      root,
      "Seattle weather",
      "Daily observations, 2012–2015.",
      `
      <div class="toolbar"><label>Year <select id="year" aria-label="Year"><option value="0">All years</option>${
        [2012, 2013, 2014, 2015].map((y, i) =>
          `<option value="${i + 1}">${y}</option>`
        ).join("")
      }</select></label><label>Season <select id="season" aria-label="Season">${
        ["All months", "Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"].map((s, i) =>
          `<option value="${i}">${s}</option>`
        ).join("")
      }</select></label><button id="reset">Reset</button></div>
      <div class="legend" aria-label="Weather types">${
        ["all", ...conditions].map((name) =>
          `<button data-weather="${name}" aria-pressed="${name === "all"}">${
            name === "all"
              ? "All weather"
              : name[0].toUpperCase() + name.slice(1)
          }</button>`
        ).join("")
      }</div>
      <section class="stats"><div><strong id="days">…</strong><small>Matching days</small></div><div><strong id="temperature">…</strong><small>Average high · °C</small></div><div><strong id="rainfall">…</strong><small>Total rainfall · mm</small></div></section>
      <div class="grid"><section class="panel"><h2>Daily high temperature · °C</h2><canvas id="plot" aria-label="Daily high temperatures. Point size indicates rainfall." tabindex="0"></canvas><p class="hint" id="detail">Point size shows rainfall. Select a day or use arrow keys.</p></section><section class="panel"><div class="panel-heading"><h2>Daily observations</h2><select id="sort" aria-label="Rank days"><option value="precipitation">Wettest first</option><option value="temp_max">Warmest first</option></select></div><div id="table"></div></section></div>
      <footer>Source: <a href="https://uwdata.github.io/mosaic/examples/weather.html">Mosaic Seattle weather</a>.</footer>`,
    );
    const selection = new StableSelection();
    const weather = Param.value("all");
    const sort = Param.value("precipitation");
    const canvas = find<HTMLCanvasElement>("plot");
    let rows: Day[] = [];
    let width = Math.min(620, viewport.width - 68);
    let points: { x: number; y: number; day: Day }[] = [];
    function draw() {
      const visible = rows.filter((day) =>
        weather.value === "all" || day.weather === weather.value
      );
      find("days").textContent = format.format(visible.length);
      find("days").dataset.value = String(visible.length);
      find("temperature").textContent = visible.length
        ? format.format(
          visible.reduce((s, d) => s + d.temp_max, 0) / visible.length,
        )
        : "–";
      find("rainfall").textContent = format.format(
        visible.reduce((s, d) => s + d.precipitation, 0),
      );
      const height = 290;
      const ratio = devicePixelRatio;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.font = "12px system-ui";
      ctx.strokeStyle = "#e5e5e5";
      ctx.fillStyle = "#666";
      for (let t = 0; t <= 40; t += 10) {
        const y = height - 30 - t / 40 * (height - 55);
        ctx.beginPath();
        ctx.moveTo(32, y);
        ctx.lineTo(width - 12, y);
        ctx.stroke();
        ctx.fillText(String(t), 4, y + 4);
      }
      ["Jan", "Apr", "Jul", "Oct"].forEach((m, i) =>
        ctx.fillText(m, 34 + i / 4 * (width - 50), height - 6)
      );
      points = visible.map((day) => {
        const fraction =
          (day.date.getUTCMonth() + (day.date.getUTCDate() - 1) / 31) / 12;
        return {
          day,
          x: 34 + fraction * (width - 50),
          y: height - 30 - day.temp_max / 40 * (height - 55),
        };
      });
      for (const { x, y, day } of points) {
        ctx.beginPath();
        ctx.fillStyle = "#171717";
        ctx.globalAlpha = 0.4;
        ctx.arc(x, y, 2.2 + Math.sqrt(day.precipitation) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>Date</th><th>High °C</th><th>Rain mm</th></tr></thead>";
      const body = table.createTBody();
      [...visible].sort((a, b) =>
        Number(b[sort.value as keyof Day]) -
          Number(a[sort.value as keyof Day]) || +a.date - +b.date
      ).slice(0, 8).forEach((day) => {
        const row = body.insertRow();
        for (
          const value of [
            day.date.toISOString().slice(0, 10),
            day.temp_max.toFixed(1),
            day.precipitation.toFixed(1),
          ]
        ) row.insertCell().textContent = String(value);
      });
      find("table").replaceChildren(table);
    }
    class Weather extends MosaicClient {
      override query(filter: FilterExpr) {
        return Query.from("weather").select(
          "date",
          "temp_max",
          "precipitation",
          "weather",
          "month",
        ).where(filter).orderby("date");
      }
      override queryResult(data: Table) {
        rows = data.toArray() as unknown as Day[];
        draw();
        return this;
      }
    }
    coordinator.connect(new Weather(selection));
    weather.addEventListener("value", draw);
    sort.addEventListener("value", draw);
    for (
      const button of root.querySelectorAll<HTMLButtonElement>("[data-weather]")
    ) {
      button.addEventListener("click", () => {
        root.querySelectorAll("[data-weather]").forEach((node) =>
          node.setAttribute("aria-pressed", String(node === button))
        );
        weather.update(button.dataset.weather!);
      });
    }
    find<HTMLSelectElement>("sort").addEventListener(
      "change",
      (event) => sort.update((event.target as HTMLSelectElement).value),
    );
    canvas.addEventListener("click", (event) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      const nearest = points.reduce<typeof points[number] | undefined>(
        (best, p) =>
          !best ||
            Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y)
            ? p
            : best,
        undefined,
      );
      if (nearest) {
        find("detail").textContent = `${
          nearest.day.date.toISOString().slice(0, 10)
        } · ${nearest.day.weather} · ${nearest.day.temp_max} °C · ${nearest.day.precipitation} mm rain`;
      }
    });
    let focused = -1;
    canvas.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !points.length) {
        return;
      }
      event.preventDefault();
      focused = Math.max(
        0,
        Math.min(
          points.length - 1,
          focused + (event.key === "ArrowRight" ? 1 : -1),
        ),
      );
      const { day } = points[focused];
      find("detail").textContent = `${
        day.date.toISOString().slice(0, 10)
      } · ${day.weather} · ${day.temp_max} °C · ${day.precipitation} mm rain`;
    });
    const sources = [{}, {}];
    const axes: Axis[] = [
      {
        name: "year",
        values: [null, 2012, 2013, 2014, 2015],
        async apply(value) {
          selection.update(
            clausePoint("year", value ?? undefined, { source: sources[0] }),
          );
          await selection.pending("value");
        },
      },
      {
        name: "season",
        values: [null, [1, 3], [4, 6], [7, 9], [10, 12]],
        async apply(value) {
          selection.update(
            clauseInterval("month", value as [number, number] | null, {
              source: sources[1],
            }),
          );
          await selection.pending("value");
        },
      },
    ];
    for (const axis of axes) {
      const select = find<HTMLSelectElement>(axis.name);
      const apply = axis.apply;
      axis.apply = (value) => {
        select.value = String(
          axis.values.findIndex((v) =>
            JSON.stringify(v) === JSON.stringify(value)
          ),
        );
        return apply(value);
      };
      select.addEventListener("change", () => {
        void axis.apply(axis.values[Number(select.value)]);
      });
    }
    find("reset").addEventListener("click", () => {
      for (const axis of axes) void axis.apply(null);
      root.querySelector<HTMLButtonElement>('[data-weather="all"]')!.click();
    });
    let observer: ResizeObserver | undefined;
    return {
      axes,
      activate() {
        observer = new ResizeObserver(() => {
          width = canvas.clientWidth;
          draw();
        });
        observer.observe(canvas);
      },
      dispose: () => observer?.disconnect(),
    };
  },
} satisfies App;
