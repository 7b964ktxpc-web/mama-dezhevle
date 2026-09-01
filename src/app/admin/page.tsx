"use client";

import { useCallback, useEffect, useState } from "react";

type Deal = {
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
    setUsername("");
    setPassword("");
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
      <main className="admin-main">
        <p className="spiner-note">Проверяем доступ…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="auth-main">
        <form className="auth-card" onSubmit={login}>
          <h1>Панель модератора</h1>
          <p className="hint">Мама, тут дешевле!</p>
          <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Логин" autoComplete="username" required />
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete="current-password" required />
          <button className="btn btn-primary" type="submit">Войти</button>
          {error && <p className="err-note">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <div className="admin-top">
        <h1>Модерация сделок</h1>
        <div className="tabs">
          <button className={tab === "deals" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("deals")}>Сделки</button>
          <button className={tab === "settings" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("settings")}>Доступ</button>
          <button className="btn btn-ghost" onClick={logout}>Выйти</button>
        </div>
      </div>

      {tab === "deals" ? (
        <>
          <div className="metrics-row">
            {metrics ? (
              <>
                <div className="metric"><div className="label">Поисков за 24ч</div><div className="value">{metrics.searches24h.toLocaleString("ru-RU")}</div></div>
                <div className="metric"><div className="label">Клики за 24ч</div><div className="value">{metrics.clicks24h.toLocaleString("ru-RU")}</div></div>
                <div className="metric"><div className="label">Одобрено сделок</div><div className="value">{metrics.approvedDeals.toLocaleString("ru-RU")}</div></div>
              </>
            ) : (
              <span className="hint">Метрики загружаются…</span>
            )}
          </div>

          {error && <p className="err-note">{error}</p>}

          {deals.length === 0 ? (
            <div className="empty-note">Нет предложений на модерации. Запустите Scout (npm run scout) — он найдёт выгодные сделки и принесёт их сюда.</div>
          ) : (
            deals.map((deal) => {
              const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
              if (!product) return null;
              return (
                <div key={deal.id} className="deal-row">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={product.image_url} alt={product.title} />
                  ) : (
                    <div className="thumb-empty" />
                  )}
                  <div className="info">
                    <div className="t">{product.title}</div>
                    <div className="d">
                      {rub(deal.current_price)} ₽ <s>было {rub(deal.reference_price)} ₽</s> · −{Math.round(Number(deal.discount_percent))}% · {product.source ?? ""}
                    </div>
                    <div className="s">AI Score: {deal.deal_score}/100</div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-green" onClick={() => act(deal.id, "approve")} disabled={busy === deal.id + "approve"}>Одобрить</button>
                    <button className="btn btn-ghost" onClick={() => act(deal.id, "reject")} disabled={busy === deal.id + "reject"}>Отклонить</button>
                  </div>
                </div>
              );
            })
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
      setOk("Данные входа обновлены. Новый логин и пароль уже действуют.");
      setCurrent("");
      setNewUsername("");
      setNewPassword("");
    } catch (e) {
      onDone(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form className="form-card" onSubmit={save}>
      <h2>Смена логина и пароля</h2>
      <p className="hint">Оставьте поле пустым, чтобы не менять его. Пароль — минимум 8 символов.</p>
      <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Текущий пароль" autoComplete="current-password" required />
      <input className="field" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Новый логин" autoComplete="username" />
      <input className="field" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Новый пароль" autoComplete="new-password" />
      <button className="btn btn-primary" type="submit">Сохранить</button>
      {ok && <p className="ok-note">{ok}</p>}
    </form>
  );
}
