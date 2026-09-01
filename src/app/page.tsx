import { getSupabaseAdmin } from "../lib/supabase-admin";
import { trackedUrlFor } from "../lib/affiliate";
import { LiveSearch } from "../components/LiveSearch";

export const dynamic = "force-dynamic";

type DealRow = {
  id: string;
  current_price: number;
  reference_price: number;
  discount_percent: number;
  deal_score: number;
  deal_level: string;
  products?: Array<{
    title: string;
    url: string;
    source: string | null;
    image_url: string | null;
    rating: number | null;
    reviews_count: number | null;
  }> | null;
};

function rub(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}

function DealCard({ deal }: { deal: DealRow }) {
  const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
  if (!product) return null;
  const link = trackedUrlFor(deal.id, product.source, product.url);
  const source = product.source === "detmir" ? "Детский мир" : product.source ?? "магазин";

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #ffe2d4",
        padding: 16,
        textDecoration: "none",
        color: "inherit",
        boxShadow: "0 6px 18px rgba(214, 116, 70, 0.08)",
      }}
    >
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt={product.title}
          style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12, marginBottom: 10 }}
        />
      ) : null}
      <div style={{ fontSize: 13, color: "#c2410c", fontWeight: 700 }}>
        −{Math.round(Number(deal.discount_percent))}% · {source}
      </div>
      <div style={{ fontWeight: 600, marginTop: 4, minHeight: 44 }}>{product.title}</div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{rub(Number(deal.current_price))} ₽</span>
        {Number(deal.reference_price) > Number(deal.current_price) ? (
          <span style={{ fontSize: 14, color: "#9b8a7d", textDecoration: "line-through" }}>
            {rub(Number(deal.reference_price))} ₽
          </span>
        ) : null}
      </div>
      {product.rating != null ? (
        <div style={{ marginTop: 6, fontSize: 13, color: "#6b5d51" }}>
          ⭐ {product.rating}
          {product.reviews_count ? ` · ${product.reviews_count.toLocaleString("ru-RU")} отзывов` : ""}
        </div>
      ) : null}
    </a>
  );
}

export default async function Home() {
  let deals: DealRow[] = [];
  let error: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("deals")
      .select(
        "id, current_price, reference_price, discount_percent, deal_score, deal_level, products(title, url, source, image_url, rating, reviews_count)"
      )
      .order("deal_score", { ascending: false })
      .limit(36);
    deals = (data as DealRow[] | null) ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 64px" }}>
      <header style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 34, margin: "0 0 6px" }}>Мама, дешевле! 🛍️</h1>
        <p style={{ color: "#6b5d51", margin: 0 }}>ИИ ищет — мама экономит. Лучшие скидки на детские товары.</p>
      </header>

      <LiveSearch />

      {error ? (
        <p style={{ color: "#c2410c", textAlign: "center", marginTop: 32 }}>
          Не удалось загрузить предложения. Проверьте подключение к базе (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
        </p>
      ) : deals.length === 0 ? (
        <p style={{ color: "#6b5d51", textAlign: "center", marginTop: 32 }}>
          Пока нет опубликованных предложений. Запустите сборку каталога — и сюда прилетят первые сделки.
        </p>
      ) : (
        <section
          style={{
            marginTop: 28,
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </section>
      )}
    </main>
  );
}
