"use client";

import { useCallback, useEffect, useState } from "react";

type Deal = {
  id: string;
  current_price: number;
  reference_price: number;
  discount_percent: number;
  deal_score: number;
  deal_level: string;
  ai_reason: string | null;
  products?: Array<{
    title: string;
    url: string;
    source: string | null;
    image_url: string | null;
    rating: number | null;
    reviews_count: number | null;
  }> | null;
};

type Metrics = { searches24h: number; clicks24h: number; approvedDeals: number };

function rub(n: number) {
  return Math.round(Number(n)).toLocaleString("ru-RU");
}

export default function AdminPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (adminKey: string) => {
    setError(null);
    try {
      const suffix = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";
      const [dealsRes, metricsRes] = await Promise.all([
        fetch(`/api/admin${suffix}`),
        fetch(`/api/admin?action=metrics${suffix ? `&key=${encodeURIComponent(adminKey)}` : ""}`),
      ]);
      if (dealsRes.status === 401 || metricsRes.status === 401) {
        setError("Неверный пароль админа");
        return;
      }
      const dealsJson = await dealsRes.json();
      const metricsJson = await metricsRes.json();
      setDeals(dealsJson.deals ?? []);
      setMetrics(metricsJson);
      setKey(adminKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  async function act(dealId: string, action: "approve" | "reject") {
    setBusy(dealId + action);
    try {
      const res = await fetch(`/api/admin${key ? `?key=${encodeURIComponent(key)}` : ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ошибка");
      setDeals((d) => d.filter((x) => x.id !== dealId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      void load(key);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 18px" }}>🔥 Админ-панель</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {metrics ? (
          <>
            <Metric label="Поисков за 24ч" value={metrics.searches24h} />
            <Metric label="Клики за 24ч" value={metrics.clicks24h} />
            <Metric label="Одобрено сделок" value={metrics.approvedDeals} />
          </>
        ) : (
          <span style={{ color: "#8a7a6c", fontSize: 14 }}>Метрики загружаются...</span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(password);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 24 }}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль админа (если задан ADMIN_PASSWORD)"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ffd2bd", fontSize: 14 }}
        />
        <button type="submit" style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#e8622c", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Войти
        </button>
      </form>

      {error && <p style={{ color: "#c2410c" }}>{error}</p>}

      {deals.length === 0 ? (
        <p style={{ color: "#6b5d51", textAlign: "center", marginTop: 32 }}>
          Нет предложений на модерации. Запусти фоновый Scout (npm run scout) — он найдёт выгодные сделки и принесёт их сюда.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {deals.map((deal) => {
            const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
            if (!product) return null;
            return (
              <div key={deal.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #ffe2d4", padding: 16, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 4px 12px rgba(214,116,70,0.06)" }}>
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.title} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 10, background: "#fff4ed" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.title}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#6b5d51" }}>
                    {rub(deal.current_price)} ₽ <span style={{ textDecoration: "line-through" }}>было {rub(deal.reference_price)} ₽</span> · −{Math.round(Number(deal.discount_percent))}% · {product.source ?? ""}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#b45309", fontWeight: 700 }}>AI Score: {deal.deal_score}/100 ({deal.deal_level})</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button onClick={() => act(deal.id, "approve")} disabled={busy === deal.id + "approve"} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#1a7f37", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    ✅ Одобрить
                  </button>
                  <button onClick={() => act(deal.id, "reject")} disabled={busy === deal.id + "reject"} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #ffc7b3", background: "#fff", color: "#c2410c", fontWeight: 600, cursor: "pointer" }}>
                    ❌ Отклонить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ffe2d4", padding: "12px 18px", minWidth: 140 }}>
      <div style={{ fontSize: 13, color: "#8a7a6c" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
