import Link from "next/link";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { trackedUrlFor } from "../lib/affiliate";
import { LiveSearch } from "../components/LiveSearch";

export const dynamic = "force-dynamic";

type DealRow = {
  id: string;
  current_price: number;
  reference_price: number;
  discount_percent: number;
  products?: Array<{
    title: string;
    url: string;
    source: string | null;
    image_url: string | null;
  }> | null;
};

function rub(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}

export default async function Home() {
  let deals: DealRow[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("deals")
      .select("id, current_price, reference_price, discount_percent, products(title, url, source, image_url)")
      .eq("status", "approved")
      .order("deal_score", { ascending: false })
      .limit(12);
    deals = (data as DealRow[] | null) ?? [];
  } catch {
    deals = [];
  }

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href="/">
            <span className="brand-mark">М</span>
            Мама, тут дешевле
          </a>
          <nav className="nav">
            <a href="#how">Как это работает</a>
            <a href="#deals">Подборка</a>
          </nav>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <span className="kicker">ИИ ищет — мама экономит</span>
          <h1>
            Найдём детское <em>дешевле</em> за вас
          </h1>
          <p className="sub">
            Напишите, что нужно ребёнку, обычными словами. Система сама обойдёт
            Wildberries, Ozon и Яндекс Маркет, сравнит цены и покажет лучшие варианты.
          </p>

          <LiveSearch />
        </section>

        <section className="section" id="how">
          <div className="section-head">
            <h2>Как это работает</h2>
            <p>Четыре шага — вы ничего не ищете вручную</p>
          </div>
          <div className="steps">
            <div className="step">
              <span className="num">01</span>
              <h3>Пишете запрос</h3>
              <p>«Зимний комбинезон мальчику 4 года до 7000 ₽» — без фильтров и категорий.</p>
            </div>
            <div className="step">
              <span className="num">02</span>
              <h3>Ищем по маркетплейсам</h3>
              <p>Параллельно опрашиваем Wildberries, Ozon и Яндекс Маркет с живым прогрессом и таймером.</p>
            </div>
            <div className="step">
              <span className="num">03</span>
              <h3>Сопоставляем и проверяем</h3>
              <p>Склеиваем одинаковые товары, считаем эффективную цену, отсекаем нерелевантное и аномалии.</p>
            </div>
            <div className="step">
              <span className="num">04</span>
              <h3>Показываем лучшее</h3>
              <p>Лучшее предложение сверху, сравнение магазинов рядом — с честным рейтингом выгоды.</p>
            </div>
          </div>
        </section>

        {deals.length > 0 && (
          <section className="section" id="deals">
            <div className="section-head">
              <h2>Одобренные подборкой</h2>
              <p>Проверено вручную, опубликовано в канале</p>
            </div>
            <div className="deals-grid">
              {deals.map((deal) => {
                const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
                if (!product) return null;
                return (
                  <a
                    key={deal.id}
                    className="deal-card"
                    href={trackedUrlFor(deal.id, product.source, product.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image_url} alt={product.title} loading="lazy" />
                    ) : null}
                    <div className="deal-body">
                      <span className="deal-tag">−{Math.round(Number(deal.discount_percent))}%</span>
                      <div className="deal-title">{product.title}</div>
                      <div className="price-row">
                        <span className="price" style={{ fontSize: 20 }}>{rub(Number(deal.current_price))} ₽</span>
                        {Number(deal.reference_price) > Number(deal.current_price) ? (
                          <span className="price-old">{rub(Number(deal.reference_price))} ₽</span>
                        ) : null}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <span className="brand">
            <span className="brand-mark">М</span>
            Мама, тут дешевле
          </span>
          <span>Реальные цены с Wildberries, Ozon и Яндекс Маркета</span>
          <Link href="/admin">Панель модератора</Link>
        </div>
      </footer>
    </>
  );
}
