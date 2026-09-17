import type { App } from "../app.ts";
import { openConnector } from "./connector.ts";
import { mount } from "./session.ts";
import { type Backend, Handoff } from "./handoff.ts";
import type { Manifest } from "../protocol.ts";

export async function boot(
  app: App,
  base: URL,
  hash: string,
  load?: (manifest: Manifest) => Promise<Backend>,
) {
  const root = document.getElementById("app")!;
  const fail = (error: unknown) => {
    let alert = document.getElementById("mosaic-static-error");
    if (!alert) {
      alert = document.createElement("p");
      alert.id = "mosaic-static-error";
      alert.setAttribute("role", "alert");
      (document.getElementById("mosaic-static-stage") ?? root).before(alert);
    }
    alert.textContent = String(error);
    document.documentElement.dataset.status = "error";
  };
  root.addEventListener(
    "mosaic-static-error",
    (event) => fail((event as CustomEvent).detail),
  );
  try {
    const connector = await openConnector(base, hash);
    const handoff = new Handoff(connector);
    const session = await mount(
      app,
      (request) => handoff.query(request),
      root,
      { width: innerWidth, height: innerHeight },
    );
    await session.settle();
    document.getElementById("mosaic-static-preview")?.remove();
    document.getElementById("mosaic-static-stage")?.replaceWith(root);
    await session.activate();
    document.documentElement.dataset.status = "ready";
    document.documentElement.dataset.engine = "static";
    const dispose = session.dispose;
    const upgrade = load
      ? handoff.start(() => load(connector.manifest)).then(async (enabled) => {
        if (enabled) {
          session.engine.update("wasm");
          await session.engine.pending("value");
          document.documentElement.dataset.engine = "wasm";
        }
        return enabled;
      }).catch((error) => {
        document.documentElement.dataset.upgrade = "failed";
        document.documentElement.dataset.upgradeError = String(error);
        root.dispatchEvent(
          new CustomEvent("mosaic-static-upgrade-error", {
            detail: error,
            bubbles: true,
          }),
        );
        return false;
      })
      : Promise.resolve(false);
    return Object.assign(session, {
      upgrade,
      async dispose() {
        await dispose();
        await handoff.dispose();
      },
    });
  } catch (error) {
    fail(error);
    throw error;
  }
}
