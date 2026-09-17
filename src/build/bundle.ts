import { fromFileUrl } from "@std/path";

export async function bundle(
  source: string,
  dir: string,
  name: string,
  format: "esm" | "iife" = "esm",
): Promise<string> {
  const entry = `${dir}/${name}.ts`;
  const output = `${dir}/${name}.js`;
  await Deno.writeTextFile(entry, source);
  const command = new Deno.Command(Deno.execPath(), {
    signal: AbortSignal.timeout(120000),
    args: [
      "bundle",
      "--config",
      fromFileUrl(new URL("../../deno.json", import.meta.url)),
      "--platform",
      "browser",
      "--format",
      format,
      "--minify",
      "--keep-names",
      "--output",
      output,
      entry,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
  return await Deno.readTextFile(output);
}

export function html(title: string, script: string, preview = ""): string {
  const escaped = title.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
  const root = `<main id="app" aria-label="${escaped}"></main>`;
  const body = preview
    ? `${preview}<div id="mosaic-static-stage" aria-hidden="true" style="position:absolute;inset-inline:0;top:0;visibility:hidden">${root}</div>`
    : root;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title><link rel="icon" href="data:,"></head><body>${body}<script type="module" src="./${script}"></script></body></html>`;
}
