import {
  digest,
  type Manifest,
  readManifest,
  readRequest,
  requestKey,
} from "../protocol.ts";

export class StaticConnector {
  private readonly pending = new Map<string, Promise<Uint8Array>>();
  private readonly cache = new Map<string, Uint8Array>();
  private size = 0;
  constructor(
    readonly manifest: Manifest,
    readonly base: URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly cacheBytes = 16 * 1024 * 1024,
  ) {}

  async query(input: unknown): Promise<Uint8Array> {
    const request = readRequest(input);
    const key = await requestKey(request);
    const entry = this.manifest.queries[key];
    if (!entry) {
      throw new Error(
        `Unprepared query (${
          key.slice(0, 12)
        }). Add its interaction state to the export and rebuild.\n${request.sql}`,
      );
    }
    const cached = this.cache.get(entry.hash);
    if (cached) {
      this.cache.delete(entry.hash);
      this.cache.set(entry.hash, cached);
      return cached.slice();
    }
    let pending = this.pending.get(entry.hash);
    if (!pending) {
      pending = (async () => {
        const fetcher = this.fetcher;
        const response = await fetcher(
          new URL(`assets/${entry.hash}.arrow`, this.base),
        );
        if (!response.ok) {
          throw new Error(
            `Prepared result failed to load: HTTP ${response.status}`,
          );
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (
          bytes.length !== entry.bytes || await digest(bytes) !== entry.hash
        ) throw new Error(`Prepared result integrity failure: ${entry.hash}`);
        if (bytes.length <= this.cacheBytes) {
          while (this.size + bytes.length > this.cacheBytes) {
            const first = this.cache.keys().next().value!;
            this.size -= this.cache.get(first)!.length;
            this.cache.delete(first);
          }
          this.cache.set(entry.hash, bytes);
          this.size += bytes.length;
        }
        return bytes;
      })().finally(() => this.pending.delete(entry.hash));
      this.pending.set(entry.hash, pending);
    }
    return (await pending).slice();
  }
}

export async function openConnector(
  base: URL,
  hash: string,
): Promise<StaticConnector> {
  const response = await fetch(new URL("manifest.json", base));
  if (!response.ok) {
    throw new Error(`Manifest failed to load: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await digest(bytes) !== hash) {
    throw new Error(
      "Manifest integrity failure. Deploy the complete bundle together.",
    );
  }
  return new StaticConnector(
    readManifest(JSON.parse(new TextDecoder().decode(bytes))),
    base,
  );
}
