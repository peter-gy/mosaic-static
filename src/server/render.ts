// @deno-types="@types/jsdom"
import { JSDOM, VirtualConsole } from "jsdom";
import { type Canvas, createCanvas } from "@napi-rs/canvas";
import type { Viewport } from "../app.ts";
import type { Session } from "../runtime/session.ts";
import type { State } from "../protocol.ts";
import { prerender } from "./prerender.ts";

export function render(
  source: string,
  query: (request: unknown) => Promise<Uint8Array>,
  viewport: Viewport,
) {
  const errors: Error[] = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(
    '<!doctype html><html><body><main id="app"></main></body></html>',
    {
      url: "https://mosaic-static.invalid/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: console,
    },
  );
  const window = dom.window;
  Object.assign(window, { TextEncoder, TextDecoder, structuredClone });
  const backing = new WeakMap<HTMLCanvasElement, Canvas>();
  const canvas = (element: HTMLCanvasElement) => {
    let value = backing.get(element);
    if (!value) {
      value = createCanvas(element.width, element.height);
      backing.set(element, value);
    }
    return value;
  };
  const prototype = window.HTMLCanvasElement.prototype;
  for (const name of ["width", "height"] as const) {
    const property = Object.getOwnPropertyDescriptor(prototype, name)!;
    Object.defineProperty(prototype, name, {
      ...property,
      set(this: HTMLCanvasElement, value: number) {
        property.set!.call(this, value);
        const native = backing.get(this);
        if (native) native[name] = this[name];
      },
    });
  }
  Object.defineProperty(prototype, "getContext", {
    value: function (this: HTMLCanvasElement, context: string) {
      if (context !== "2d") {
        throw new Error(
          `Server rendering supports 2d canvas, received ${context}.`,
        );
      }
      return canvas(this).getContext("2d");
    },
  });
  prototype.toDataURL = function (this: HTMLCanvasElement) {
    return canvas(this).toDataURL("image/png");
  };
  Object.defineProperty(window, "innerWidth", { value: viewport.width });
  Object.defineProperty(window, "innerHeight", { value: viewport.height });
  Object.defineProperty(window, "devicePixelRatio", { value: 1 });
  const root = window.document.getElementById("app")!;
  window.__query = query;
  try {
    window.eval(source);
    let session: Session | undefined;
    let disposed = false;
    const ready: Promise<Session> = Promise.resolve(
      window.__render(root, viewport),
    ).then(async (value) => {
      if (disposed) {
        await value.dispose();
        throw new Error("Render session disposed.");
      }
      return session = value;
    });
    ready.catch(() => {});
    return {
      get session() {
        if (!session) {
          throw new Error("Await settle() before inspecting the session.");
        }
        return session;
      },
      apply: async (state: State) =>
        (await ready).apply(window.JSON.parse(JSON.stringify(state))),
      preview: () => prerender(root),
      async settle() {
        await (await ready).settle();
        if (errors.length) throw errors[0];
      },
      async dispose() {
        disposed = true;
        try {
          await session?.dispose();
        } finally {
          window.close();
        }
      },
    };
  } catch (error) {
    window.close();
    throw error;
  }
}
