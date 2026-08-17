export type Product = {
  externalId: string;
  source: string;
  url: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  ageLabel?: string | null;
  imageUrl?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  price: number;
  oldPrice?: number | null;
  available: boolean;
};
