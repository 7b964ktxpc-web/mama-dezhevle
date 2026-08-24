import { bestAgeSignal, extractAgeSignals } from "../age-signals";

describe("age-signals", () => {
  it("reads year ranges", () => {
    const signal = bestAgeSignal("Куртка 12-18 лет");
    expect(signal?.min).toBe(12);
    expect(signal?.max).toBe(18);
    expect(signal?.confidence).toBeGreaterThan(0.95);
  });
  it("reads months", () => {
    const signal = bestAgeSignal("Игрушка от 6 месяцев");
    expect(signal?.max).toBe(1);
    expect(signal?.source).toBe("months");
  });
  it("reads plus notation", () => {
    const signal = bestAgeSignal("Игрушка 3+ лет");
    expect(signal?.min).toBe(3);
    expect(signal?.max).toBe(18);
  });
  it("does not treat ordinary numbers as age without a marker", () => {
    expect(extractAgeSignals("Подгузники 104 шт")).toHaveLength(0);
  });
});
