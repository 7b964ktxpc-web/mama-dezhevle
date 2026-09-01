"use client";

import { useEffect, useRef, useState } from "react";

type Offer = {
  source: string;
  label: string;
  title: string;
  url: string;
  image?: string | null;
  seller?: string | null;
  price: number;
  oldPrice?: number | null;
  discountPercent?: number | null;
  rating?: number | null;
  effectivePrice?: number;
  dealScore?: number | null;
};

type Group = {
  title: string;
  brand: string | null;
  medianPrice: number;
  offerCount: number;
  best: Offer;
  offers: Offer[];
};

type SourceState = { status: "pending" | "ok" | "failed" | "skipped"; count: number };

const SOURCE_LABELS: Record<string, string> = {
  wildberries: "Wildberries", yandex_market: "Яндекс Маркет", megamarket: "Мегамаркет",
  ozon: "Ozon", lamoda: "Lamoda", dns: "DNS", citilink: "Ситилинк", avito: "Avito", taobao: "Taobao", detmir: "Детский мир",
};

function rub(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function LiveSearch() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "searching" | "done" | "failed">("idle");
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const [stage, setStage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [statuses, setStatuses] = useState<{ source: string; label: string; status: string; count: number }[]>([]);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (phase !== "searching") return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => () => esRef.current?.close(), []);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    esRef.current?.close();
    setPhase("searching");
    setSources({});
    setGroups([]);
    setStage("Запускаем поиск...");
    setElapsed(0);
    setDurationMs(0);

    const es = new EventSource(`/api/search/stream?q=${encodeURIComponent(q)}`);
    esRef.current = es;
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      switch (event.type) {
        case "SOURCE_STARTED":
          setSources((s) => ({ ...s, [event.source]: { status: "pending", count: 0 } }));
          break;
        case "SOURCE_COMPLETED":
          setSources((s) => ({ ...s, [event.source]: { status: "ok", count: event.count } }));
          break;
        case "SOURCE_FAILED":
          setSources((s) => ({ ...s, [event.source]: { status: "failed", count: 0 } }));
          break;
        case "SOURCE_SKIPPED":
          setSources((s) => ({ ...s, [event.source]: { status: "skipped", count: 0 } }));
          break;
        case "MATCHING_STARTED":
          setStage("Сопоставляем одинаковые товары...");
          break;
        case "PRICE_CHECK_STARTED":
          setStage("Проверяем цены и скидки...");
          break;
        case "VERIFICATION_STARTED":
          setStage("Проверяем наличие и достоверность...");
          break;
        case "BEST_DEAL_FOUND":
          setStage(`Лучшее предложение: ${rub(event.price)} ₽`);
          break;
        case "SEARCH_COMPLETED":
          setGroups(event.groups ?? []);
          setStatuses(event.statuses ?? []);
          setDurationMs(event.durationMs ?? 0);
          setPhase("done");
          es.close();
          break;
        case "SEARCH_FAILED":
          setStage(event.error ?? "Поиск не удался");
          setPhase("failed");
          es.close();
          break;
      }
    };
    es.onerror = () => {
      if (phase === "searching") {
        setPhase("failed");
        setStage("Соединение прервалось");
      }
      es.close();
    };
  }

  const sourceEntries = Object.entries(sources);
  const doneCount = sourceEntries.filter(([, s]) => s.status === "ok").length;
  const totalFound = sourceEntries.reduce((sum, [, s]) => sum + s.count, 0);
  const offersTotal = groups.reduce((sum, g) => sum + g.offerCount, 0);

  return (
    <div>
      <form onSubmit={run} style={{ display: "flex", gap: 8, maxWidth: 640, margin: "0 auto" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Зимний комбинезон мальчику 4 года до 7000 ₽"
          style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #ffd2bd", fontSize: 15, outline: "none" }}
        />
        <button type="submit" disabled={phase === "searching"} style={{ padding: "12px 22px", borderRadius: 12, border: "none", background: phase === "searching" ? "#f0b894" : "#e8622c", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          {phase === "searching" ? "Ищем..." : "Найти 🔎"}
        </button>
      </form>

      {phase === "searching" && (
        <div style={{ marginTop: 24, padding: 20, background: "#fff8f4", borderRadius: 16, border: "1px solid #ffe2d4" }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🔎 Ищем лучшую цену</div>
          <div style={{ marginTop: 4, color: "#8a7a6c", fontSize: 13 }}>{stage} · Проверяем {sourceEntries.length || "…"} источников</div>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {sourceEntries.map(([id, s]) => (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>
                  {s.status === "ok" ? "✓" : s.status === "failed" ? "✗" : s.status === "skipped" ? "○" : "⟳"} {SOURCE_LABELS[id] ?? id}
                </span>
                <span style={{ color: s.status === "ok" ? "#1a7f37" : "#8a7a6c" }}>
                  {s.status === "ok" ? `${s.count} предл.` : s.status === "pending" ? "ищем..." : s.status === "failed" ? "недоступен" : "пропущен"}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 15 }}>⏱ {clock(elapsed)}</div>
        </div>
      )}

      {phase === "done" && (
        <div style={{ marginTop: 24 }}>
          <div style={{ textAlign: "center", color: "#6b5d51", fontSize: 14 }}>
            Проверено {doneCount} из {sourceEntries.length} источников · Найдено {offersTotal} предложений · Сопоставлено {groups.length} товаров{durationMs ? ` · ${clock(durationMs)}` : ""}
          </div>
          {groups.length === 0 ? (
            <p style={{ textAlign: "center", color: "#c2410c", marginTop: 20 }}>
              Ничего не нашлось. Попробуй другой запрос или зайди позже — источники иногда отдыхают.
            </p>
          ) : (
            <div style={{ marginTop: 20, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {groups.slice(0, 12).map((group, index) => {
                const best = group.best;
                const key = group.title.slice(0, 48) + index;
                const open = expanded === key;
                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 16, border: "1px solid #ffe2d4", padding: 16, boxShadow: "0 6px 18px rgba(214, 116, 70, 0.08)" }}>
                    {index === 0 && <div style={{ fontSize: 12, color: "#b45309", fontWeight: 800, marginBottom: 6 }}>🏆 ЛУЧШЕЕ ПРЕДЛОЖЕНИЕ</div>}
                    {best.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={best.image} alt={best.title} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
                    ) : null}
                    <div style={{ fontSize: 12, color: "#c2410c", fontWeight: 700 }}>
                      {best.label}{best.seller ? ` · ${best.seller}` : ""}{best.dealScore != null ? ` · Score ${best.dealScore}/100` : ""}
                    </div>
                    <div style={{ fontWeight: 600, marginTop: 4, minHeight: 40 }}>{best.title}</div>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 22, fontWeight: 800 }}>{rub(best.effectivePrice ?? best.price)} ₽</span>
                      {best.oldPrice && best.oldPrice > best.price ? (
                        <span style={{ fontSize: 13, color: "#9b8a7d", textDecoration: "line-through" }}>{rub(best.oldPrice)} ₽</span>
                      ) : null}
                    </div>
                    {best.rating ? <div style={{ marginTop: 4, fontSize: 13, color: "#6b5d51" }}>⭐ {best.rating}</div> : null}
                    <a href={best.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, textAlign: "center", padding: "10px 0", borderRadius: 10, background: "#e8622c", color: "#fff", fontWeight: 700, textDecoration: "none" }}>
                      🛒 Купить
                    </a>
                    {group.offers.length > 1 && (
                      <button onClick={() => setExpanded(open ? null : key)} style={{ marginTop: 10, width: "100%", padding: "8px 0", borderRadius: 10, border: "1px solid #ffd2bd", background: "#fff", color: "#c2410c", fontWeight: 600, cursor: "pointer" }}>
                        {open ? "Скрыть сравнение" : `Сравнить все (${group.offers.length})`}
                      </button>
                    )}
                    {open && (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {group.offers.map((offer, i) => (
                          <a key={offer.url + i} href={offer.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 8px", borderRadius: 8, background: "#fff8f4", textDecoration: "none", color: "inherit" }}>
                            <span>{["🥇", "🥈", "🥉"][i] ?? "·"} {offer.label}</span>
                            <span style={{ fontWeight: 700 }}>{rub(offer.effectivePrice ?? offer.price)} ₽</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {phase === "failed" && (
        <div style={{ marginTop: 24, padding: 16, background: "#fff4f0", borderRadius: 12, border: "1px solid #ffc7b3", color: "#c2410c", textAlign: "center" }}>
          Поиск не удался: {stage}. Попробуй ещё раз.
        </div>
      )}
    </div>
  );
}
