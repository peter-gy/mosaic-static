import { MosaicClient, Selection } from "@uwdata/mosaic-core";

/** Keep conjunction SQL stable when users change controls in different orders. */
export class StableSelection extends Selection {
  constructor({ cross = false } = {}) {
    super((cross ? Selection.crossfilter() : Selection.intersect()).resolver);
  }

  override predicate(client?: MosaicClient | null, noSkip = false) {
    const predicate = super.predicate(client, noSkip);
    return Array.isArray(predicate)
      ? predicate.toSorted((a, b) =>
        String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
      )
      : predicate;
  }
}
