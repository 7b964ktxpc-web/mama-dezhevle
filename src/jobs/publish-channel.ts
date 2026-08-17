import { getSupabaseAdmin } from "../lib/supabase-admin";

const API = "https://api.telegram.org/bot";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function sendChannelMessage(text: string) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv("TELEGRAM_CHANNEL_ID");
  const response = await fetch(`${API}${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    }),
  });
  if (!response.ok) throw new Error(`Telegram API error ${response.status}: ${await response.text()}`);
}

function formatPost(deal: any) {
  const product = deal.products;
  const discount = Math.round(Number(deal.discount_percent ?? 0));
  const price = Math.round(Number(deal.current_price));
  const reference = Math.round(Number(deal.reference_price ?? price));
  const old = reference > price ? `\n~~${reference.toLocaleString("ru-RU")} ₽~~` : "";
  const score = Math.round(Number(deal.deal_score ?? 0));

  return [
    "🔥 МАМА, ДЕШЕВЛЕ!",
    "",
    product.title,
    "",
    `💰 ${price.toLocaleString("ru-RU")} ₽${old}`,
    discount > 0 ? `📉 Скидка около ${discount}%` : "💸 Выгодная цена",
    score >= 80 ? "⭐ Очень выгодное предложение" : "👍 Нашли хорошую цену",
    "",
    `👉 Купить: ${product.url}`,
    "",
    "Цены могут измениться — проверяйте цену перед покупкой.",
  ].join("\n");
}

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id,current_price,reference_price,discount_percent,deal_score,deal_level,products!inner(title,url,image_url)")
    .eq("status", "candidate")
    .order("deal_score", { ascending: false })
    .limit(3);

  if (error) throw error;
  if (!deals?.length) {
    console.log("No candidate deals to publish.");
    return;
  }

  for (const deal of deals) {
    await sendChannelMessage(formatPost(deal));
    const { error: updateError } = await supabase
      .from("deals")
      .update({ status: "published" })
      .eq("id", deal.id);
    if (updateError) throw updateError;
    console.log(`Published deal ${deal.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
