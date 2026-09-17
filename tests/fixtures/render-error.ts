import { MosaicClient } from "@uwdata/mosaic-core";
import type { App } from "../../src/app.ts";

export default {
  mount({ coordinator }) {
    class BrokenView extends MosaicClient {
      override query() {
        return "SELECT 1 AS n";
      }
      override queryResult(): this {
        throw new Error("Renderer rejected the result");
      }
    }
    coordinator.connect(new BrokenView());
    return {};
  },
} satisfies App;
