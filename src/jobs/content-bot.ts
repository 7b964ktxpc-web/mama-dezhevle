import { generateContentDraft } from "../lib/content-ai";
import { answerCallback, getContentBotUpdates, notifyAdmin, publishApprovedPost, sendDraftForApproval } from "../lib/content-bot";
import { getSupabaseAdmin } from "../lib/supabase-admin";

const AUTO_COUNT = 3;

function env(name: string) { return process.env[name]?.trim() || ""; }
function adminChatId() { return env("CONTENT_ADMIN_CHAT_ID"); }

function isAdminChat(chatId: unknown) { return String(chatId ?? "") === adminChatId(); }
function fingerprint(body: string) { return `${body.toLowerCase().replace(/\\s+/g, " ").trim()}`; }

async function createDraft() {
  const supabase = getSupabaseAdmin();
  const draft = await generateContentDraft();
  const fp = fingerprint(draft.body);
  const { data, error } = await supabase.from("content_posts").insert({
    content_type: draft.contentType,
    rubric: draft.rubric,
    topic: draft.topic,
    body: draft.body,
    status: "pending",
    fingerprint: fp,
  }).select("id,rubric,topic,body").single();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  await sendDraftForApproval(data);
  return data;
}

async function generateSeveral(count: number) {
  let created = 0;
  for (let i = 0; i < count; i += 1) {
    const draft = await createDraft();
    if (draft) created += 1;
  }
  return created;
}

async function handleCallback(update: any) {
  const callback = update.callback_query;
  const message = callback?.message;
  if (!callback?.id || !isAdminChat(message?.chat?.id)) return;
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
      await supabase.from("content_posts").update({ status: "published", approved_at: new Date().toISOString(), published_at: new Date().toISOString(), telegram_message_id: Number(published?.message_id ?? 0) || null }).eq("id", id).eq("status", "pending");
      await answerCallback(callback.id, "Опубликовано ❤️");
    } catch (publishError) {
      console.error("Content publish failed", publishError);
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
    const fp = fingerprint(draft.body);
    const { error: updateError } = await supabase.from("content_posts").update({ content_type: draft.contentType, rubric: draft.rubric, topic: draft.topic, body: draft.body, fingerprint: fp }).eq("id", id).eq("status", "pending");
    if (updateError) throw updateError;
    await sendDraftForApproval({ id, rubric: draft.rubric, topic: draft.topic, body: draft.body });
    await answerCallback(callback.id, "Переделала");
  }
}

async function handleMessage(update: any) {
  const message = update.message;
  if (!message || !isAdminChat(message.chat?.id)) return;
  const text = String(message.text ?? "").trim();
  if (text === "/start" || text === "/help") {
    await notifyAdmin("🤖 Content Bot\n\n/generate — подготовить 3 новых поста\n/pending — показать количество постов на проверке\n\nЯ занимаюсь только контентом. Товары, цены и ссылки не использую.");
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

async function main() {
  const supabase = getSupabaseAdmin();
  const latest = await supabase.from("content_bot_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw latest.error;
  const offset = latest.data ? Number(latest.data.update_id) + 1 : undefined;
  const updates = await getContentBotUpdates(offset);
  for (const update of updates) {
    const { error } = await supabase.from("content_bot_updates").insert({ update_id: update.update_id });
    if (error?.code === "23505") continue;
    if (error) throw error;
    if (update.callback_query) await handleCallback(update);
    else await handleMessage(update);
  }

  if (env("CONTENT_AUTO_GENERATE") === "true") {
    const { count, error } = await supabase.from("content_posts").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (error) throw error;
    const pending = Number(count ?? 0);
    if (pending < AUTO_COUNT) await generateSeveral(AUTO_COUNT - pending);
  }

  console.log(JSON.stringify({ received: updates.length }));
}

main().catch((error) => { console.error(error); process.exit(1); });
