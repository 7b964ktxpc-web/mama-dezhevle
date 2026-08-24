export type ChildCategory = "feeding" | "diapers" | "strollers" | "car_seats" | "clothing" | "shoes" | "toys" | "school" | "hygiene" | "furniture" | "safety" | "books" | "sports" | "electronics" | "pregnancy_parenting" | "other";

const RULES: Record<ChildCategory, string[]> = {
  feeding: ["смесь", "бутылоч", "соска", "поильник", "тарелк", "стакан детск", "пюре детск"],
  diapers: ["подгуз", "памперс", "трусики-подгуз", "впитывающиe пелен"],
  strollers: ["коляск", "люльк", "прогулочн коляск"],
  car_seats: ["автокресл", "бустер", "детское кресло"],
  clothing: ["детск одежд", "боди", "слип", "комбинезон детск", "пижама детск", "куртка детск", "платье детск"],
  shoes: ["детск обув", "кроссовки детск", "ботинки детск", "сандалии детск"],
  toys: ["игрушк", "конструктор", "кукл", "пазл", "погремуш", "прорезыв"],
  school: ["школьн", "рюкзак детск", "пенал", "канцелярия детск", "тетрадь"],
  hygiene: ["детск шампун", "детск мыл", "детск крем", "детск зубн", "влажные салфетки детск", "горшок"],
  furniture: ["детск кроват", "детск стул", "детск стол", "манеж", "пеленальн стол"],
  safety: ["детск ворота", "защита розеток", "замок на шкаф", "блокиратор", "уголки безопасности"],
  books: ["детск книг", "сказк", "азбук", "буквар", "раскраск"],
  sports: ["детск самокат", "детск велосипед", "беговел", "ролики детск", "детск спорт"],
  electronics: ["детские часы", "детск раци", "детский фотоаппарат", "детские наушники"],
  pregnancy_parenting: ["для беременн", "для кормлен", "молокоотсос", "слинг", "кенгуру"],
  other: [],
};

export function classifyChildCategories(text: string): ChildCategory[] {
  const value = text.toLowerCase().replace(/ё/g, "е");
  const categories = (Object.entries(RULES) as [ChildCategory, string[]][])
    .filter(([, rules]) => rules.some((rule) => value.includes(rule)))
    .map(([category]) => category);
  return categories.length ? categories : ["other"];
}
