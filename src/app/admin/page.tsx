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

type UserRow = { userId: number; searches: number; lastQuery: string; lastAt: string };
type RecentRow = { userId: number; query: string; at: string };
type ChannelPost = { id: string; published_price: number; post_text: string; published_at: string };

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
  const [tab, setTab] = useState<"deals" | "users" | "channel" | "settings">("deals");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [posts, setPosts] = useState<ChannelPost[]>([]);

  const load = useCallback(async () => {
    try {
      let [dealsRes, metricsRes] = await Promise.all([
        fetch("/api/admin"),
        fetch("/api/admin?action=metrics"),
      ]);
      // Opened inside the Telegram client as a WebApp: authorize via the
      // bot-signed initData instead of the login form. The telegram-web-app.js
      // script can load after our first check — retry for a few seconds.
      if (dealsRes.status === 401 && typeof window !== "undefined") {
        const getWebApp = () => (window as any).Telegram?.WebApp;
        let tg = getWebApp();
        for (let i = 0; !tg?.initData && i < 15; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          tg = getWebApp();
        }
        if (tg?.initData) {
          try { tg.ready?.(); tg.expand?.(); } catch { /* older clients */ }
          const login = await fetch("/api/admin?action=login-telegram", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ initData: tg.initData }),
          });
          if (login.ok) {
            [dealsRes, metricsRes] = await Promise.all([
              fetch("/api/admin"),
              fetch("/api/admin?action=metrics"),
            ]);
          }
        }
      }
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

  useEffect(() => {
    if (tab === "users") {
      void fetch("/api/admin?action=users")
        .then((r) => (r.ok ? r.json() : { users: [], recent: [] }))
        .then((j) => {
          setUsers(j.users ?? []);
          setRecent(j.recent ?? []);
        })
        .catch(() => {});
    }
    if (tab === "channel") {
      void fetch("/api/admin?action=channel")
        .then((r) => (r.ok ? r.json() : { posts: [] }))
        .then((j) => setPosts(j.posts ?? []))
        .catch(() => {});
    }
  }, [tab]);

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
          <button className={tab === "users" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("users")}>Пользователи</button>
          <button className={tab === "channel" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("channel")}>Канал</button>
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
      ) : tab === "users" ? (
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Кто ищет — за 30 дней</h2>
          {users.length === 0 ? (
            <div className="empty-note">Поисков пока не было.</div>
          ) : (
            users.map((u) => (
              <div key={u.userId} className="deal-row">
                <div className="info">
                  <div className="t">ID {u.userId}</div>
                  <div className="d">Поисков: {u.searches} · последний: {u.lastQuery}</div>
                </div>
              </div>
            ))
          )}
          <h2 style={{ fontSize: 20, margin: "26px 0 14px" }}>Последние запросы</h2>
          {recent.length === 0 ? (
            <div className="empty-note">Пока пусто.</div>
          ) : (
            recent.map((r, i) => (
              <div key={i} className="deal-row">
                <div className="info">
                  <div className="t">{r.query || "—"}</div>
                  <div className="d">ID {r.userId} · {new Date(r.at).toLocaleString("ru-RU")}</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === "channel" ? (
        <ChannelTab posts={posts} />
      ) : (
        <SettingsTab onDone={setError} />
      )}
    </main>
  );
}

function ChannelTab({ posts }: { posts: ChannelPost[] }) {
  const [text, setText] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin?action=publish-post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось опубликовать");
      setOk("Опубликовано в канал.");
      setText("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="form-card" onSubmit={publish} style={{ width: "100%", maxWidth: 560 }}>
        <h2>Опубликовать в канал</h2>
        <p className="hint">Произвольный пост — новинка, промокод, объявление.</p>
        <textarea
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: 🎁 Скидка 40% на детские пижамы в Ozon — только сегодня!"
          rows={5}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Публикуем…" : "Опубликовать"}
        </button>
        {ok && <p className="ok-note">{ok}</p>}
        {err && <p className="err-note">{err}</p>}
      </form>

      <h2 style={{ fontSize: 20, margin: "26px 0 14px" }}>История публикаций</h2>
      {posts.length === 0 ? (
        <div className="empty-note">В канале ещё ничего не опубликовано через панель.</div>
      ) : (
        posts.map((p) => (
          <div key={p.id} className="deal-row">
            <div className="info">
              <div className="t">{(p.post_text ?? "").split("\n")[0].slice(0, 90) || "Пост"}</div>
              <div className="d">{new Date(p.published_at).toLocaleString("ru-RU")} · {Math.round(Number(p.published_price))} ₽</div>
            </div>
          </div>
        ))
      )}
    </div>
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
