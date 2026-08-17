import type { Product } from "../types";

/**
 * Safe local source used while real marketplace/API access is being configured.
 * It keeps the pipeline testable without paid APIs or scraping.
 */
export function getDemoProducts(): Product[] {
  return [
    {
      externalId: "demo-lego-001",
      source: "demo",
      url: "https://example.com/product/lego",
      title: "Конструктор для детей 6+",
      brand: "Demo Brand",
      category: "Игрушки",
      ageLabel: "6+",
      rating: 4.8,
      reviewsCount: 2841,
      price: 2490,
      oldPrice: 3990,
      available: true,
    },
    {
      externalId: "demo-toy-002",
      source: "demo",
      url: "https://example.com/product/toy",
      title: "Набор для творчества",
      category: "Творчество",
      ageLabel: "4+",
      rating: 4.7,
      reviewsCount: 613,
      price: 890,
      oldPrice: 990,
      available: true,
    },
  ];
}
