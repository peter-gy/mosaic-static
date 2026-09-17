import { Coordinator, decodeIPC, Param } from "@uwdata/mosaic-core";
import type { App, Viewport } from "../app.ts";
import { canonical, type Inspection, type State } from "../protocol.ts";

export async function mount(
  app: App,
  query: (request: unknown) => Promise<Uint8Array>,
  root: HTMLElement,
  viewport: Viewport,
) {
  const errors: Error[] = [];
  const report = (error: unknown) => {
    const e = error instanceof Error ? error : new Error(String(error));
    errors.push(e);
    root.dispatchEvent(
      new CustomEvent("mosaic-static-error", { detail: e, bubbles: true }),
    );
  };
  // The connector rejects exec at runtime. The cast bridges Mosaic's overloaded interface.
  const connector = {
    query: async (request: unknown) =>
      decodeIPC(await query(request), { useDate: true, ...app.ipc }),
  };
  const coordinator = new Coordinator(
    connector as ConstructorParameters<typeof Coordinator>[0],
    {
      cache: false,
      consolidate: false,
      preagg: { enabled: false },
      logger: {
        error: report,
        warn: report,
        info() {},
        debug() {},
        log() {},
        group() {},
        groupCollapsed() {},
        groupEnd() {},
      },
    },
  );
  const engine = Param.value<"static" | "wasm">("static");
  const mounted = await app.mount({ root, coordinator, engine, viewport });
  const axes = mounted.axes ?? [];
  async function settle() {
    for (let pass = 0; pass < 100; ++pass) {
      const clients = [...coordinator.clients];
      const pending = clients.map((client) => client.pending);
      await Promise.all(pending);
      await Promise.all(
        [...coordinator.filterGroups.keys()].map((selection) =>
          selection.pending("value")
        ),
      );
      await mounted.settled?.();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      if (errors.length) throw errors[0];
      if (
        !coordinator.manager.pendingResults.length &&
        clients.length === coordinator.clients.size && clients.every((c, i) =>
          c.pending === pending[i]
        )
      ) return;
    }
    throw new Error(
      "Mosaic did not settle after 100 render frames. Return asynchronous work from mount(), apply(), or settled().",
    );
  }
  return {
    activate: () => mounted.activate?.(),
    engine,
    domains: axes.map(({ name, values }) => ({ name, values })),
    settle,
    async apply(state: State) {
      if (Object.keys(state).length !== axes.length) {
        throw new Error("Expected a complete interaction state.");
      }
      for (const axis of axes) {
        const value = state[axis.name];
        if (!axis.values.some((v) => canonical(v) === canonical(value))) {
          throw new Error(`Unprepared input for ${axis.name}`);
        }
      }
      for (const axis of axes) {
        await axis.apply(state[axis.name]);
        await settle();
      }
      await settle();
    },
    inspect(): Inspection {
      const clients = [...coordinator.clients];
      return {
        clients: clients.map((client) => ({
          type: client.constructor.name,
          enabled: client.enabled,
          filtered: !!client.filterBy,
          query: client.enabled
            ? String(client.query(client.filterBy?.predicate(client)) ?? "") ||
              null
            : null,
        })),
        selections: [...coordinator.filterGroups].map(([selection, group]) => ({
          clients: [...group.clients].map((client) => clients.indexOf(client)),
          clauses: selection.clauses.map((clause) => ({
            type: clause.meta?.type ?? "predicate",
            fields: clause.fields.map(String),
          })),
        })),
      };
    },
    async dispose() {
      await mounted.dispose?.();
      coordinator.clear();
    },
  };
}
export type Session = Awaited<ReturnType<typeof mount>>;
