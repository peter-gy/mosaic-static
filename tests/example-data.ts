import { parquetReadObjects } from "hyparquet";

const flightDomains = [
  [null, [-60, 0], [0, 30], [30, 180]],
  [null, [0, 6], [6, 12], [12, 18], [18, 24]],
  [null, [0, 750], [750, 1500], [1500, 2500]],
];

export async function expectedFlights() {
  const bytes = await Deno.readFile(
    new URL("../examples/data/flights-200k.parquet", import.meta.url),
  );
  const rows = await parquetReadObjects({
    file: bytes.buffer as ArrayBuffer,
  }) as { delay: number; time: number; distance: number }[];
  const fields = ["delay", "time", "distance"] as const;
  const states = [];
  for (let delay = 0; delay < 4; delay++) {
    for (let time = 0; time < 5; time++) {
      for (let distance = 0; distance < 4; distance++) {
        const indices = [delay, time, distance];
        const selected = rows.filter((row) =>
          fields.every((field, i) => {
            const range = flightDomains[i][indices[i]];
            return !range || row[field] >= range[0] && row[field] <= range[1];
          })
        );
        states.push({
          indices,
          count: selected.length,
          delay: selected.length
            ? selected.reduce((s, r) => s + r.delay, 0) / selected.length
            : null,
          ontime: selected.length
            ? 100 * selected.filter((r) => r.delay <= 0).length /
              selected.length
            : null,
        });
      }
    }
  }
  return states;
}

export async function expectedFlightRange(low: number, high: number) {
  const bytes = await Deno.readFile(
    new URL("../examples/data/flights-200k.parquet", import.meta.url),
  );
  const rows = await parquetReadObjects({
    file: bytes.buffer as ArrayBuffer,
  }) as { delay: number }[];
  return rows.filter((row) => row.delay >= low && row.delay <= high).length;
}

export async function expectedWeather() {
  const bytes = await Deno.readFile(
    new URL("../examples/data/seattle-weather.parquet", import.meta.url),
  );
  const rows = await parquetReadObjects({
    file: bytes.buffer as ArrayBuffer,
  }) as { date: Date; weather: string }[];
  const states = [];
  for (let year = 0; year < 5; year++) {
    for (let season = 0; season < 5; season++) {
      for (const weather of ["all", "sun", "rain", "snow", "fog", "drizzle"]) {
        const days = rows.filter((row) =>
          (!year || row.date.getUTCFullYear() === 2011 + year) &&
          (!season || Math.floor(row.date.getUTCMonth() / 3) + 1 === season) &&
          (weather === "all" || row.weather === weather)
        ).length;
        states.push({ year, season, weather, days });
      }
    }
  }
  return states;
}
