export type UnitKind = "item" | "kg" | "l";

export interface UnitPrice {
  kind: UnitKind;
  quantity: number;
  price: number;
  pricePerUnit: number;
}

function round(value: number) { return Math.round(value * 100) / 100; }

export function calculateUnitPrice(price: number, title: string): UnitPrice | undefined {
  if (!Number.isFinite(price) || price <= 0) return undefined;
  const text = title.toLowerCase().replace(/\u00a0/g, " ").replace(/,/g, ".");

  const pack = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:шт|штук|pcs|шт\.)\b/i);
  if (pack) {
    const quantity = Number(pack[1]);
    if (quantity > 0) return { kind: "item", quantity, price, pricePerUnit: round(price / quantity) };
  }

  const kg = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:кг|kg)\b/i);
  if (kg) {
    const quantity = Number(kg[1]);
    if (quantity > 0) return { kind: "kg", quantity, price, pricePerUnit: round(price / quantity) };
  }

  const g = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:г|гр|g)\b/i);
  if (g) {
    const grams = Number(g[1]);
    if (grams > 0) return { kind: "kg", quantity: grams / 1000, price, pricePerUnit: round(price / (grams / 1000)) };
  }

  const l = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:л|l)\b/i);
  if (l) {
    const quantity = Number(l[1]);
    if (quantity > 0) return { kind: "l", quantity, price, pricePerUnit: round(price / quantity) };
  }

  const ml = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:мл|ml)\b/i);
  if (ml) {
    const milliliters = Number(ml[1]);
    if (milliliters > 0) return { kind: "l", quantity: milliliters / 1000, price, pricePerUnit: round(price / (milliliters / 1000)) };
  }

  return undefined;
}
