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
    setStage("Запускаем поиск");
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
          setStage("Сопоставляем одинаковые товары");
          break;
        case "PRICE_CHECK_STARTED":
          setStage("Считаем эффективные цены");
          break;
        case "VERIFICATION_STARTED":
          setStage("Проверяем наличие и релевантность");
          break;
        case "BEST_DEAL_FOUND":
          setStage(`Лучшее: ${rub(event.price)} ₽`);
          break;
        case "SEARCH_COMPLETED":
          setGroups(event.groups ?? []);
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
      setPhase((p) => (p === "searching" ? (setStage("Соединение прервалось"), "failed") : p));
      es.close();
    };
  }

  const sourceEntries = Object.entries(sources);
  const okCount = sourceEntries.filter(([, s]) => s.status === "ok").length;
  const offersTotal = groups.reduce((sum, g) => sum + g.offerCount, 0);

  return (
    <div className="search-panel">
      <form className="search-row" onSubmit={run}>
        <label className="search-input">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Зимний комбинезон мальчику 4 года до 7000 ₽"
            aria-label="Поисковый запрос"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={phase === "searching"}>
          {phase === "searching" ? "Ищем…" : "Найти"}
        </button>
      </form>

      {phase === "searching" && (
        <div className="progress">
          <div className="progress-head">
            <div>
              <div className="progress-title">Ищем лучшую цену</div>
              <div className="progress-stage">{stage}…</div>
            </div>
            <span className="timer">⏱ {clock(elapsed)}</span>
          </div>
          <div className="src-list">
            {sourceEntries.map(([id, s]) => (
              <div key={id} className="src">
                <span className={`dot dot-${s.status}`} />
                <span>{SOURCE_LABELS[id] ?? id}</span>
                <span className={`count ${s.status === "ok" ? "" : "muted"}`}>
                  {s.status === "ok" ? `${s.count} предл.` : s.status === "pending" ? "ищем…" : s.status === "failed" ? "недоступен" : "пропущен"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "done" && (
        <>
          <div className="results-meta">
            <span>Проверено источников: {okCount} из {sourceEntries.length}</span>
            <span>Найдено предложений: {offersTotal}</span>
            <span>Сопоставлено товаров: {groups.length}</span>
            {durationMs ? <span>Время: {clock(durationMs)}</span> : null}
          </div>
          {groups.length === 0 ? (
            <div className="empty-note">
              Ничего не нашлось. Попробуйте другой запрос или зайдите позже — источники иногда отдыхают.
            </div>
          ) : (
            <div className="results-grid">
              {groups.slice(0, 12).map((group, index) => {
                const best = group.best;
                const key = group.title.slice(0, 48) + index;
                const open = expanded === key;
                return (
                  <article key={key} className={`product-card${index === 0 ? " best" : ""}`}>
                    <div className="product-img">
                      {best.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={best.image} alt={best.title} loading="lazy" />
                      ) : (
                        <div className="ph">фото нет</div>
                      )}
                      {index === 0 && <span className="ribbon">Лучшее</span>}
                    </div>
                    <div className="product-body">
                      <div className="product-src">
                        {best.label}{best.seller ? ` · ${best.seller}` : ""}
                      </div>
                      <div className="product-title">{best.title}</div>
                      <div className="price-row">
                        <span className="price">{rub(best.effectivePrice ?? best.price)} ₽</span>
                        {best.oldPrice && best.oldPrice > best.price ? (
                          <span className="price-old">{rub(best.oldPrice)} ₽</span>
                        ) : null}
                        {best.discountPercent ? (
                          <span className="badge-discount">−{best.discountPercent}%</span>
                        ) : null}
                      </div>
                      {best.rating ? <div className="product-rating">★ {best.rating}</div> : null}
                      <a className="btn btn-buy" href={best.url} target="_blank" rel="noopener noreferrer">
                        Купить
                      </a>
                      {group.offers.length > 1 && (
                        <button className="compare-btn" onClick={() => setExpanded(open ? null : key)}>
                          {open ? "Скрыть сравнение" : `Сравнить все (${group.offers.length})`}
                        </button>
                      )}
                      {open && (
                        <div className="compare-list">
                          {group.offers.map((offer, i) => (
                            <a key={offer.url + i} className="compare-row" href={offer.url} target="_blank" rel="noopener noreferrer">
                              <span>
                                <span className="medal">{["1", "2", "3"][i] ?? "·"}</span>
                                {offer.label}
                              </span>
                              <span style={{ fontWeight: 700 }}>{rub(offer.effectivePrice ?? offer.price)} ₽</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {phase === "failed" && (
        <div className="progress">
          <div className="progress-title">Поиск не удался</div>
          <div className="progress-stage">{stage}. Попробуйте ещё раз.</div>
        </div>
      )}
    </div>
  );
}
