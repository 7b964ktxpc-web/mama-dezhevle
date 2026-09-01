import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";

// Web admin auth: username + scrypt password in admin_users (Supabase), plus
// HMAC-signed HttpOnly session cookies. No third-party auth service needed.

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminSession = { userId: string; username: string; exp: number };

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, username: string) {
  const session: AdminSession = { userId, username, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdminSession;
    if (!session.userId || !session.username || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  },
};

async function ensureBootstrapAdmin() {
  const envUser = process.env.ADMIN_USER?.trim();
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!envUser || !envPassword) return;
  const supabase = getSupabaseAdmin();
  const { count } = await supabase.from("admin_users").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const { hash, salt } = hashPassword(envPassword);
  await supabase.from("admin_users").insert({ username: envUser, password_hash: hash, salt });
  console.log("bootstrap admin account created from ADMIN_USER/ADMIN_PASSWORD; change the password in the panel");
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession | null> {
  await ensureBootstrapAdmin();
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("admin_users").select("id, username, password_hash, salt").eq("username", username).maybeSingle();
  if (!data) return null;
  if (!verifyPassword(password, data.password_hash, data.salt)) return null;
  return { userId: data.id, username: data.username, exp: 0 };
}

export async function getSessionUser(request: Request): Promise<AdminSession | null> {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return readSessionToken(match?.slice(COOKIE_NAME.length + 1));
}

export async function updateCredentials(userId: string, currentPassword: string, newUsername: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("admin_users").select("id, username, password_hash, salt").eq("id", userId).maybeSingle();
  if (!data) return { ok: false, error: "Пользователь не найден" };
  if (!verifyPassword(currentPassword, data.password_hash, data.salt)) return { ok: false, error: "Неверный текущий пароль" };
  if (newPassword && newPassword.length < 8) return { ok: false, error: "Пароль должен быть не короче 8 символов" };
  if (newUsername && newUsername.length < 3) return { ok: false, error: "Логин должен быть не короче 3 символов" };
  const update: Record<string, string> = { updated_at: new Date().toISOString() };
  if (newUsername) update.username = newUsername;
  if (newPassword) {
    const { hash, salt } = hashPassword(newPassword);
    update.password_hash = hash;
    update.salt = salt;
  }
  const { error } = await supabase.from("admin_users").update(update).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function adminTelegramIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}
