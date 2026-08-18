import type { JsonLdAdapter } from "./jsonld-adapter";

export function createAdapterRegistry(adapters: JsonLdAdapter[]) {
  return {
    forHost(hostname: string): JsonLdAdapter | undefined {
      return adapters.find((adapter) => adapter.supports(hostname));
    },
  };
}
