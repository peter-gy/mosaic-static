import {
  digest,
  type QueryEntry,
  readRequest,
  requestKey,
} from "../protocol.ts";

export class Recorder {
  readonly queries: Record<string, QueryEntry> = Object.create(null);
  readonly assets = new Map<string, Uint8Array>();
  private tail: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  private stopped = false;
  constructor(
    private readonly execute: (request: unknown) => Promise<Uint8Array>,
  ) {}

  stop() {
    this.stopped = true;
  }

  query(input: unknown): Promise<Uint8Array> {
    const result = this.tail.then(async () => {
      if (this.stopped) throw new Error("Capture has stopped.");
      const request = readRequest(input);
      const key = await requestKey(request);
      const previous = this.queries[key];
      if (previous) return this.assets.get(previous.hash)!.slice();
      const bytes = await this.execute(request);
      const hash = await digest(bytes);
      if (!this.assets.has(hash)) {
        this.bytes += bytes.length;
        if (this.bytes > 256 * 1024 * 1024) {
          throw new Error(
            "Prepared results exceed 256 MiB. Reduce result sizes or interaction domains.",
          );
        }
        this.assets.set(hash, bytes);
      }
      this.queries[key] = { request, hash, bytes: bytes.length };
      if (Object.keys(this.queries).length > 10000) {
        throw new Error(
          "Export exceeds 10,000 distinct queries. Reduce interaction domains.",
        );
      }
      return bytes.slice();
    });
    this.tail = result.catch(() => {});
    return result;
  }
}
