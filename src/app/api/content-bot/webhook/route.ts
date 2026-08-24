import { NextResponse } from "next/server";
import { generateContentDraft } from "../../../../lib/content-ai";
import { answerCallback, notifyAdmin, publishApprovedPost, sendDraftForApproval } from "../../../../lib/content-bot";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

export const runtime = "nodejs";
const AUTO_COUNT = 3;
const env = (name: string) => process.env[name]?.trim() || "";
const isAdmin = (id: unknown) => String(id ?? "") === env("CONTENT_ADMIN_CHAT_ID");
const fingerprint = (body: string) => body.toLowerCase().replace(/\s+/g, " ").trim();

async function createDraft() {
  const supabase = getSupabaseAdmin();
  const draft = await generateContentDraft();
  const { data, error } = await supabase.from("content_posts").insert({ content_type: draft.contentType, rubric: draft.rubric, topic: draft.topic, body: draft.body, status: "pending", fingerprint: fingerprint(draft.body) }).select("id,rubric,topic,body").single();
  if (error) { if (error.code === "23505") return null; throw error; }
  await sendDraftForApproval(data);
  return data;
}

async function generateSeveral(count: number) {
  let created = 0;
  for (let i = 0; i < count; i += 1) if (await createDraft()) created += 1;
  return created;
}

async function handleCallback(update: any) {
  const callback = update.callback_query;
  if (!callback?.id || !isAdmin(callback.message?.chat?.id)) return;
  const [action, id] = String(callback.data ?? "").split(":");
  if (!id) return;
  const supabase = getSupabaseAdmin();
  const { data: post, error } = await supabase.from("content_posts").select("id,body,rubric,topic,status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!post) { await answerCallback(callback.id, "Пост уже не найден"); return; }

  if (action === "approve") {
    if (post.status !== "pending") { await answerCallback(callback.id, "Этот пост уже обработан"); return; }
    try {
      const published = await publishApprovedPost(post);
      const now = new Date().toISOString();
      const { error: updateError } = await supabase.from("content_posts").update({ status: "published", approved_at: now, published_at: now, telegram_message_id: Number(published?.message_id ?? 0) || null }).eq("id", id).eq("status", "pending");
      if (updateError) throw updateError;
      await answerCallback(callback.id, "Опубликовано ❤️");
    } catch (error) {
      console.error("Content publish failed", error);
      await answerCallback(callback.id, "Не удалось опубликовать");
      await notifyAdmin(`⚠️ Не смогла опубликовать пост «${post.topic}». Он остался на проверке.`);
    }
    return;
  }

  if (action === "reject") {
    await supabase.from("content_posts").update({ status: "rejected", rejected_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
    await answerCallback(callback.id, "Отклонено");
    return;
  }

  if (action === "regenerate") {
    const draft = await generateContentDraft();
    const { error: updateError } = await supabase.from("content_posts").update({ content_type: draft.contentType, rubric: draft.rubric, topic: draft.topic, body: draft.body, fingerprint: fingerprint(draft.body) }).eq("id", id).eq("status", "pending");
    if (updateError) throw updateError;
    await sendDraftForApproval({ id, rubric: draft.rubric, topic: draft.topic, body: draft.body });
    await answerCallback(callback.id, "Переделала");
  }
}

async function handleMessage(update: any) {
  const message = update.message;
  if (!message || !isAdmin(message.chat?.id)) return;
  const text = String(message.text ?? "").trim();
  if (text === "/start" || text === "/help") {
    await notifyAdmin("🤖 Content Bot\n\n/generate — подготовить 3 новых поста\n/pending — показать материалы на проверке\n\nЯ занимаюсь только контентом. Товары, цены и ссылки не использую.");
    return;
  }
  if (text === "/generate") {
    const created = await generateSeveral(AUTO_COUNT);
    await notifyAdmin(`Готово ❤️ Подготовила ${created} новых материалов. Проверь их выше.`);
    return;
  }
  if (text === "/pending") {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("content_posts").select("id,rubric,topic,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    await notifyAdmin(data?.length ? `⏳ На проверке: ${data.length}\n\n${data.map((item, index) => `${index + 1}. ${item.rubric} — ${item.topic}`).join("\n")}` : "✅ На проверке ничего нет.");
  }
}

export async function POST(request: Request) {
  const secret = env("CONTENT_WEBHOOK_SECRET");
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = await request.json();
    const updateId = Number(update?.update_id);
    if (!Number.isSafeInteger(updateId)) return NextResponse.json({ ok: true });
    const supabase = getSupabaseAdmin();
    const { error: insertError } = await supabase.from("content_bot_updates").insert({ update_id: updateId });
    if (insertError?.code === "23505") return NextResponse.json({ ok: true });
    if (insertError) throw insertError;
    if (update.callback_query) await handleCallback(update);
    else if (update.message) await handleMessage(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Content webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() { return NextResponse.json({ ok: true, service: "mama-dezhevle-content-bot" }); }
