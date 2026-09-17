import type { Coordinator, Param } from "@uwdata/mosaic-core";
import type { ExtractionOptions } from "@uwdata/flechette";
import type { Domain, Value } from "./protocol.ts";

export interface Axis extends Domain {
  /** Apply the same complete input value accepted by the application's control. */
  apply(value: Value): void | Promise<void>;
}
export interface MountedApp {
  axes?: readonly Axis[];
  /** Attach browser-only effects after the live view replaces the prerender. */
  activate?(): void | Promise<void>;
  /** Await work scheduled outside Mosaic's client and selection lifecycles. */
  settled?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
export interface App {
  ipc?: ExtractionOptions;
  mount(
    context: {
      root: HTMLElement;
      coordinator: Coordinator;
      engine: Param<"static" | "wasm">;
      viewport: Viewport;
    },
  ): MountedApp | Promise<MountedApp>;
}

export interface Viewport {
  width: number;
  height: number;
}
