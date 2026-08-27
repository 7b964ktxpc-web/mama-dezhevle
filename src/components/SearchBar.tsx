"use client";

import { useState } from "react";

type SearchHit = {
  id: string | number;
  title: string;
  price: number;
  oldPrice?: number | null;
  url: string;
  imageUrl?: string | null;
  source?: string;
  rating?: number | null;
  verified?: boolean;
};

function rub(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={run} style={{ display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найди дешевле: кроссовки девочке 30 размера до 2500 ₽"
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #ffd2bd",
            fontSize: 15,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            background: "#ea580c",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "…" : "Найти"}
        </button>
      </form>

      {searched ? (
        results.length === 0 ? (
          <p style={{ textAlign: "center", color: "#6b5d51", marginTop: 20 }}>
            По запросу пока ничего не нашлось. Уточните товар, размер или бюджет.
          </p>
        ) : (
          <section
            style={{
              marginTop: 24,
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {results.map((item) => (
              <a
                key={String(item.id ?? item.url)}
                href={item.url}
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
                }}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 12, marginBottom: 8 }}
                  />
                ) : null}
                <div style={{ fontWeight: 600, minHeight: 42 }}>{item.title}</div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{rub(Number(item.price))} ₽</span>
                  {item.oldPrice && item.oldPrice > item.price ? (
                    <span style={{ fontSize: 13, color: "#9b8a7d", textDecoration: "line-through", marginLeft: 8 }}>
                      {rub(Number(item.oldPrice))} ₽
                    </span>
                  ) : null}
                </div>
                {item.source ? <div style={{ marginTop: 6, fontSize: 12, color: "#c2410c" }}>{item.source}</div> : null}
              </a>
            ))}
          </section>
        )
      ) : null}
    </div>
  );
}
