import { getSupabaseAdmin } from "./supabase-admin";

// Channel auto-registration: when the bot is added to a channel as admin, or
// an admin forwards a channel post to the bot, we memorize that channel id in
// the settings table and use it for publishing — no manual TELEGRAM_CHANNEL_ID
// configuration needed.

const KEY = "telegram_channel_id";

export async function getChannelId(): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("settings").select("value").eq("key", KEY).maybeSingle();
    const stored = data?.value?.trim();
    if (stored) return stored;
  } catch { /* fall through to env */ }
  return process.env.TELEGRAM_CHANNEL_ID?.trim() || null;
}

export async function setChannelId(chatId: string | number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const value = String(chatId);
  const { error } = await supabase.from("settings").upsert({ key: KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export async function forgetChannelId(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("settings").delete().eq("key", KEY);
  if (error) throw error;
}
