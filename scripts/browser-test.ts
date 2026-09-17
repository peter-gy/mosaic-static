import { serveDir } from "@std/http/file-server";
import {
  expectedFlightRange,
  expectedFlights,
  expectedWeather,
} from "../tests/example-data.ts";

const session = "mosaic-static-stress";
const expected = {
  flights: await expectedFlights(),
  weather: await expectedWeather(),
};
const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/__expected/range") {
      return Response.json(
        await expectedFlightRange(
          Number(url.searchParams.get("low")),
          Number(url.searchParams.get("high")),
        ),
      );
    }
    const match = new URL(request.url).pathname.match(
      /^\/__expected\/(flights|weather)$/,
    );
    return match
      ? Response.json(expected[match[1] as keyof typeof expected])
      : serveDir(request, { fsRoot: "dist", quiet: true });
  },
);
async function browser(args: string[], input?: string) {
  const command = new Deno.Command("agent-browser", {
    args: ["--session", session, ...args],
    stdin: input ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  if (input) {
    const writer = command.stdin.getWriter();
    await writer.write(new TextEncoder().encode(input));
    await writer.close();
  }
  const output = await command.output();
  if (!output.success) {
    throw new Error(
      new TextDecoder().decode(output.stderr) ||
        new TextDecoder().decode(output.stdout),
    );
  }
  const text = new TextDecoder().decode(output.stdout);
  console.log(text.trim());
  return text;
}
try {
  await Deno.mkdir("nogit/evidence", { recursive: true });
  const results: unknown[] = [];
  for (const example of ["flights", "weather", "flights-wasm"]) {
    await browser(["open", `http://127.0.0.1:${server.addr.port}/${example}/`]);
    await browser([
      "wait",
      "--fn",
      "document.documentElement.dataset.status === 'ready'",
    ]);
    await browser(["snapshot", "-i"]);
    if (example === "flights-wasm") {
      await browser([
        "wait",
        "--fn",
        "document.documentElement.dataset.engine === 'wasm'",
      ]);
    }
    const script = await Deno.readTextFile(
      `tests/${
        example.startsWith("flights") ? "flights" : "weather"
      }.browser.js`,
    );
    for (
      const [width, height, name] of [[1280, 900, "desktop"], [
        390,
        844,
        "mobile",
      ]] as const
    ) {
      await browser(["set", "viewport", String(width), String(height)]);
      results.push({
        example,
        ...JSON.parse(await browser(["eval", "--stdin"], script)),
      });
      await browser([
        "screenshot",
        `nogit/evidence/${example}-${name}.png`,
        "--full",
      ]);
    }
  }
  await Deno.writeTextFile(
    "nogit/evidence/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  const errors = await browser(["errors"]);
  if (errors.trim()) throw new Error(`Browser errors: ${errors}`);
} finally {
  await browser(["close"]);
  await server.shutdown();
}
