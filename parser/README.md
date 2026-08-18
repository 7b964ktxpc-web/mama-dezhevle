# Mama Parser

Standalone marketplace price collector for **Мама, дешевле**.

The parser is deliberately separated from the application layer so it can later be connected to the existing catalog, price history, deal scoring and Telegram publishing pipeline.

## Current scope

- Ozon public product/search pages
- Wildberries public product/search pages
- Yandex Market public product/search pages
- Megamarket public product/search pages
- Детский мир public catalog pages
- JSON-LD / OpenGraph extraction
- normalized product records
- duplicate removal
- price comparison and cheapest-offer selection
- configurable concurrency, timeout and user agent
- CLI output as JSON

## Important boundary

The parser consumes public pages and configured feeds/APIs. It does **not** bypass CAPTCHA, authentication, robots controls, paywalls or other access controls. Marketplace adapters are intentionally isolated so an official API/feed can replace public-page collection without changing the normalized output.

## Usage

From the repository root:

```bash
npx tsx parser/src/cli.ts --url "https://www.ozon.ru/search/?text=подгузники+pampers"
```

Or provide several URLs:

```bash
npx tsx parser/src/cli.ts --url "https://www.ozon.ru/search/?text=подгузники" --url "https://www.wildberries.ru/catalog/0/search.aspx?search=подгузники"
```

The output is a normalized JSON array. Later the adapter output can be sent directly into `src/jobs/collect.ts` instead of being stored by the parser itself.
