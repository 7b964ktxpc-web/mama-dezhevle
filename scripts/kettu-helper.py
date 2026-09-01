import sys, json, asyncio, importlib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

MODULES = {
    "detmir_categories": "detmir_connector.server", "detmir_category": "detmir_connector.server",
    "detmir_card": "detmir_connector.server", "detmir_selfcheck": "detmir_connector.server",
    "wb_search": "wb_connector.server", "wb_card": "wb_connector.server", "wb_selfcheck": "wb_connector.server",
    "yandex_search": "yandex_connector.server", "yandex_card": "yandex_connector.server", "yandex_selfcheck": "yandex_connector.server",
    "ozon_search": "ozon_connector.server", "ozon_card": "ozon_connector.server", "ozon_selfcheck": "ozon_connector.server",
    "megamarket_search": "megamarket_connector.server", "megamarket_selfcheck": "megamarket_connector.server",
    "lamoda_search": "lamoda_connector.server", "lamoda_selfcheck": "lamoda_connector.server",
    "dns_search": "dns_connector.server", "dns_selfcheck": "dns_connector.server",
    "citilink_search": "citilink_connector.server", "citilink_selfcheck": "citilink_connector.server",
    "avito_search": "avito_connector.server", "avito_selfcheck": "avito_connector.server",
    "taobao_search": "taobao_connector.server", "taobao_selfcheck": "taobao_connector.server",
    "compare_prices": "compare_connector.server",
}

async def main():
    tool = sys.argv[1]
    mod = importlib.import_module(MODULES[tool])
    fn = getattr(mod, tool)
    with open(sys.argv[2], encoding="utf-8-sig") as fh:
        args = json.load(fh)
    result = await fn(**args)
    if hasattr(result, "model_dump"):
        print(json.dumps(result.model_dump(), ensure_ascii=False, default=str))
    else:
        print(json.dumps(str(result), ensure_ascii=False, default=str))

asyncio.run(main())
