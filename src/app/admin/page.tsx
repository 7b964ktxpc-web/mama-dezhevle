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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"deals" | "settings">("deals");

  const load = useCallback(async () => {
    try {
      const [dealsRes, metricsRes] = await Promise.all([
        fetch("/api/admin"),
        fetch("/api/admin?action=metrics"),
      ]);
      if (dealsRes.status === 401) {
        setAuthed(false);
        return;
      }
      const dealsJson = await dealsRes.json();
      const metricsJson = await metricsRes.json();
      setDeals(dealsJson.deals ?? []);
      setMetrics(metricsJson);
      setAuthed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin?action=login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось войти");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function logout() {
    await fetch("/api/admin?action=logout", { method: "POST" });
    setAuthed(false);
    setDeals([]);
    setMetrics(null);
  }

  async function act(dealId: string, action: "approve" | "reject") {
    setBusy(dealId + action);
    try {
      const res = await fetch("/api/admin", {
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
    }
  }

  if (authed === null) {
    return (
      <main style={shell}>
        <p style={{ textAlign: "center", color: "#8a7a6c" }}>Проверяем доступ…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main style={{ ...shell, display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <form onSubmit={login} style={card(360)}>
          <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Вход в админку</h1>
          <p style={{ color: "#8a7a6c", fontSize: 14, margin: "0 0 18px" }}>Панель модератора «Мама, дешевле!»</p>
          <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Логин" autoComplete="username" required />
          <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete="current-password" required />
          <button type="submit" style={primaryBtn}>Войти</button>
          {error && <p style={{ color: "#c2410c", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>🔥 Админ-панель</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("deals")} style={tab === "deals" ? tabBtnActive : tabBtn}>Сделки</button>
          <button onClick={() => setTab("settings")} style={tab === "settings" ? tabBtnActive : tabBtn}>Настройки</button>
          <button onClick={logout} style={{ ...tabBtn, color: "#c2410c" }}>Выйти</button>
        </div>
      </div>

      {tab === "deals" ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            {metrics ? (
              <>
                <Metric label="Поисков за 24ч" value={metrics.searches24h} />
                <Metric label="Клики за 24ч" value={metrics.clicks24h} />
                <Metric label="Одобрено сделок" value={metrics.approvedDeals} />
              </>
            ) : (
              <span style={{ color: "#8a7a6c", fontSize: 14 }}>Метрики загружаются…</span>
            )}
          </div>

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
                  <div key={deal.id} style={{ ...card("100%"), display: "flex", gap: 14, alignItems: "center" }}>
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
                      <button onClick={() => act(deal.id, "approve")} disabled={busy === deal.id + "approve"} style={{ ...primaryBtn, background: "#1a7f37", padding: "8px 14px", fontSize: 14 }}>✅ Одобрить</button>
                      <button onClick={() => act(deal.id, "reject")} disabled={busy === deal.id + "reject"} style={secondaryBtn}>❌ Отклонить</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <SettingsTab onDone={setError} />
      )}
    </main>
  );
}

function SettingsTab({ onDone }: { onDone: (message: string | null) => void }) {
  const [current, setCurrent] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [ok, setOk] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    onDone(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin?action=change-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newUsername, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось сохранить");
      setOk("Данные входа обновлены. Новый логин/пароль вступили в силу.");
      setCurrent("");
      setNewUsername("");
      setNewPassword("");
    } catch (e) {
      onDone(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form onSubmit={save} style={card(420)}>
      <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>Смена логина и пароля</h2>
      <p style={{ color: "#8a7a6c", fontSize: 14, margin: "0 0 18px" }}>Оставь поле пустым, чтобы не менять его.</p>
      <input style={input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Текущий пароль" autoComplete="current-password" required />
      <input style={input} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Новый логин (не менять — пусто)" autoComplete="username" />
      <input style={input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Новый пароль (минимум 8 символов)" autoComplete="new-password" />
      <button type="submit" style={primaryBtn}>Сохранить</button>
      {ok && <p style={{ color: "#1a7f37", fontSize: 14, margin: "12px 0 0" }}>{ok}</p>}
    </form>
  );
}

const shell: React.CSSProperties = { maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" };

function card(width: number | string): React.CSSProperties {
  return {
    width,
    display: "grid",
    gap: 12,
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #ffe2d4",
    padding: 22,
    boxShadow: "0 4px 24px rgba(214,116,70,.08)",
  };
}

const input: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #ffd2bd",
  fontSize: 15,
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#e8622c",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #ffc7b3",
  background: "#fff",
  color: "#c2410c",
  fontWeight: 600,
  cursor: "pointer",
};

const tabBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #ffd2bd",
  background: "#fff",
  color: "#6b5d51",
  fontWeight: 600,
  cursor: "pointer",
};

const tabBtnActive: React.CSSProperties = { ...tabBtn, background: "#e8622c", color: "#fff", border: "1px solid #e8622c" };

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #ffe2d4", padding: "12px 18px", minWidth: 140 }}>
      <div style={{ fontSize: 13, color: "#8a7a6c" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
