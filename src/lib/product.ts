export type Product = {
  externalId: string;
  source: string;
  title: string;
  url: string;
  currentPrice: number;
  referencePrice?: number | null;
  average30d?: number | null;
  min30d?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  available?: boolean;
  category?: string | null;
  imageUrl?: string | null;
};
