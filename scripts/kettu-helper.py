import sys, json, asyncio, importlib

MODULES = {
    "detmir_categories": "detmir_connector.server",
    "detmir_category": "detmir_connector.server",
    "detmir_card": "detmir_connector.server",
    "detmir_selfcheck": "detmir_connector.server",
    "wb_search": "wb_connector.server",
    "wb_card": "wb_connector.server",
    "yandex_search": "yandex_connector.server",
    "yandex_card": "yandex_connector.server",
    "ozon_search": "ozon_connector.server",
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
