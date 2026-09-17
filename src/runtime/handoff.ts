export interface Backend {
  query(request: unknown): Promise<Uint8Array>;
  dispose(): void | Promise<void>;
}

/** Requests retain the backend they started with. New requests use the committed backend. */
export class Handoff {
  private live?: Backend;
  private disposed = false;
  private loading?: Promise<boolean>;
  constructor(private readonly prepared: Pick<Backend, "query">) {}

  query(request: unknown): Promise<Uint8Array> {
    if (this.disposed) {
      return Promise.reject(new Error("Application is disposed."));
    }
    return (this.live ?? this.prepared).query(request);
  }

  start(load: () => Promise<Backend>): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return this.loading ??= Promise.resolve().then(load).then(
      async (backend) => {
        if (this.disposed) {
          await backend.dispose();
          return false;
        }
        this.live = backend;
        return true;
      },
    );
  }

  async dispose() {
    this.disposed = true;
    const live = this.live;
    this.live = undefined;
    await live?.dispose();
  }
}
