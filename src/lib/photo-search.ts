import { parseSearchQuery, searchProducts } from "./product-search";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export type PhotoSearchAnalysis = {
  query: string;
  category?: string;
  gender?: "мальчик" | "девочка";
  color?: string;
  age?: number;
  size?: number;
};

export async function analyzeProductPhoto(imageUrl: string): Promise<PhotoSearchAnalysis> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Ты помощник сервиса Мама, дешевле!.",
                "Распознай детский товар на фотографии для поиска в каталоге.",
                "Верни только JSON с полями query, category, gender, color, age, size.",
                "Не выдумывай возраст, размер или пол, если их нельзя определить.",
                "query должен быть коротким поисковым запросом на русском.",
              ].join(" "),
            },
            { type: "input_image", image_url: imageUrl },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Vision API error ${response.status}: ${await response.text()}`);
  const json = await response.json() as { output_text?: string };
  if (!json.output_text) throw new Error("Vision API returned no output");

  const parsed = JSON.parse(json.output_text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as PhotoSearchAnalysis;
  if (!parsed.query || typeof parsed.query !== "string") throw new Error("Vision result has no query");
  return parsed;
}

export async function searchByPhoto(imageUrl: string, limit = 5) {
  const analysis = await analyzeProductPhoto(imageUrl);
  const filters = parseSearchQuery(analysis.query);
  const enrichedQuery = [
    analysis.query,
    analysis.gender,
    analysis.color,
    analysis.age ? `${analysis.age} лет` : undefined,
    analysis.size ? `${analysis.size} см` : undefined,
  ].filter(Boolean).join(" ");

  return {
    analysis,
    filters,
    results: await searchProducts(enrichedQuery, limit),
  };
}
