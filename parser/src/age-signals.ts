export interface AgeSignal { min?: number; max?: number; confidence: number; source: "years" | "months" | "age-plus" | "age-size" | "height" | "weight" | "unknown"; raw: string; }

const MONTHS = /\b(?:от\s*)?(\d{1,2})\s*(?:мес|месяц(?:а|ев)?)\b/gi;
const YEARS = /\b(?:от\s*)?(\d{1,2})\s*(?:лет|год(?:а|ов)?)\b/gi;
const RANGE = /\b(\d{1,2})\s*(?:-|–|—|до)\s*(\d{1,2})\s*(?:лет|год(?:а|ов)?)\b/gi;
const PLUS = /\b(\d{1,2})\s*\+\s*(?:лет|г)?\b/gi;
const AGE_SIZE = /\b(?:размер|size)\s*(\d{1,2})\b/gi;
const HEIGHT = /\b(\d{2,3})\s*см\b/gi;
const WEIGHT = /\b(\d+(?:[.,]\d+)?)\s*кг\b/gi;

export function extractAgeSignals(text: string): AgeSignal[] {
  const value = text.toLowerCase().replace(/ё/g, "е");
  const signals: AgeSignal[] = [];
  for (const match of value.matchAll(RANGE)) signals.push({ min: +match[1], max: +match[2], confidence: 0.99, source: "years", raw: match[0] });
  for (const match of value.matchAll(YEARS)) signals.push({ min: +match[1], max: +match[1], confidence: 0.95, source: "years", raw: match[0] });
  for (const match of value.matchAll(MONTHS)) signals.push({ max: Math.ceil(+match[1] / 12), confidence: 0.93, source: "months", raw: match[0] });
  for (const match of value.matchAll(PLUS)) signals.push({ min: +match[1], max: 18, confidence: 0.9, source: "age-plus", raw: match[0] });
  for (const match of value.matchAll(AGE_SIZE)) signals.push({ min: +match[1], max: +match[1], confidence: 0.35, source: "age-size", raw: match[0] });
  for (const match of value.matchAll(HEIGHT)) {
    const cm = +match[1];
    if (cm <= 200) signals.push({ min: Math.max(0, Math.floor((cm - 80) / 7)), max: Math.min(18, Math.ceil((cm - 50) / 7)), confidence: 0.3, source: "height", raw: match[0] });
  }
  for (const match of value.matchAll(WEIGHT)) {
    const kg = +(match[1].replace(",", "."));
    if (kg <= 60) signals.push({ max: Math.min(18, Math.ceil(kg / 3)), confidence: 0.25, source: "weight", raw: match[0] });
  }
  return signals;
}

export function bestAgeSignal(text: string): AgeSignal | undefined {
  return extractAgeSignals(text).sort((a, b) => b.confidence - a.confidence)[0];
}
