import { gatewaySearch } from "../../../../lib/kettu-gateway";
import { searchProducts } from "../../../../lib/product-search";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SOURCE_LABELS: Record<string, string> = {
  wildberries: "Wildberries", yandex_market: "Яндекс Маркет", megamarket: "Мегамаркет",
  ozon: "Ozon", lamoda: "Lamoda", dns: "DNS", citilink: "Ситилинк", avito: "Avito", taobao: "Taobao",
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (!query.trim()) {
    return new Response("missing query", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        send({ type: "SEARCH_STARTED", query });
        const result = await gatewaySearch(query, {
          limit: 12,
          onEvent: (event) => send(event),
        });
        const catalog = await searchProducts(query, 5).catch(() => []);
        const groups = result.groups
          .map((group) => ({
            title: group.title,
            brand: group.brand,
            medianPrice: group.medianPrice,
            offerCount: group.offers.length,
            best: group.best,
            offers: group.offers
              .filter((o) => o.verified)
              .slice(0, 6)
              .map((o) => ({ ...o, label: SOURCE_LABELS[o.source] ?? o.source })),
          }))
          .filter((group) => group.best.verified)
          .slice(0, 20);
        send({ type: "SEARCH_COMPLETED", groups, catalog, statuses: result.statuses, durationMs: result.durationMs });
      } catch (error) {
        send({ type: "SEARCH_FAILED", error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
