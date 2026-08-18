import { classifyChildCategories } from "../children-categories";

describe("classifyChildCategories", () => {
  it("classifies core baby categories", () => {
    expect(classifyChildCategories("Подгузники Pampers 4 104 шт")).toContain("diapers");
    expect(classifyChildCategories("Коляска 2 в 1 для малыша")).toContain("strollers");
    expect(classifyChildCategories("Автокресло детское 9-18 кг")).toContain("car_seats");
  });
  it("classifies school, toy and clothing products", () => {
    expect(classifyChildCategories("Школьный рюкзак для девочки")).toContain("school");
    expect(classifyChildCategories("Конструктор детский")).toContain("toys");
    expect(classifyChildCategories("Куртка детская зимняя")).toContain("clothing");
  });
  it("falls back to other when no category signal exists", () => {
    expect(classifyChildCategories("Неизвестный товар")).toEqual(["other"]);
  });
});
