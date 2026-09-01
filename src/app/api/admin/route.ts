import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";
import { buildDealPost } from "../../../lib/post-template";
import { sendTelegramPost } from "../../../lib/telegram";
import { trackedUrlFor } from "../../../lib/affiliate";
import { getSessionUser, loginAdmin, createSessionToken, sessionCookie, updateCredentials } from "../../../lib/auth";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function publishDealToChannel(dealId: string) {
  const supabase = getSupabaseAdmin();
  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, product_id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, products(id,title,url,rating,reviews_count,age_label,category,source,available,image_url)")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw error;
  if (!deal) throw new Error("deal not found");
  const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
  if (!product) throw new Error("product not found");

  const link = trackedUrlFor(deal.product_id, product.source ?? "unknown", product.url);
  if (process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHANNEL_ID?.trim()) {
    const post = buildDealPost(
      {
        id: String(deal.product_id),
        title: product.title,
        currentPrice: Number(deal.current_price),
        referencePrice: Number(deal.reference_price),
        rating: product.rating ?? null,
        reviewsCount: product.reviews_count ?? null,
        ageLabel: product.age_label ?? null,
        url: link,
        source: product.source ?? null,
      },
      {
        score: deal.deal_score,
        level: deal.deal_level,
        realDiscountPercent: Number(deal.discount_percent),
        savingAmount: Math.max(0, Number(deal.reference_price) - Number(deal.current_price)),
        reasons: deal.ai_reason ? [deal.ai_reason] : [],
      },
    );
    const message = await sendTelegramPost(post);
    await supabase.from("telegram_posts").insert({
      deal_id: deal.id,
      telegram_message_id: message?.message_id ?? 0,
      published_price: Number(deal.current_price),
      post_text: post,
    });
  }
  const { error: updateError } = await supabase
    .from("deals")
    .update({ status: "approved", published_at: new Date().toISOString() })
    .eq("id", dealId);
  if (updateError) throw updateError;
}

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) return unauthorized();
  const supabase = getSupabaseAdmin();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "me") {
      return NextResponse.json({ username: session.username });
    }
    if (action === "metrics") {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [searches, clicks, dealsApproved] = await Promise.all([
        supabase.from("search_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("link_clicks").select("id", { count: "exact", head: true }).gte("clicked_at", since),
        supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "approved"),
      ]);
      return NextResponse.json({
        searches24h: searches.count ?? 0,
        clicks24h: clicks.count ?? 0,
        approvedDeals: dealsApproved.count ?? 0,
      });
    }
    const { data: deals, error } = await supabase
      .from("deals")
      .select("id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, created_at, products(title, url, source, image_url, rating, reviews_count)")
      .eq("status", "candidate")
      .order("deal_score", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ deals: deals ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Public auth endpoints (rate limiting is delegated to the edge/host).
  if (action === "login") {
    try {
      const body = await request.json();
      const username = String(body.username ?? "").trim().slice(0, 64);
      const password = String(body.password ?? "").slice(0, 128);
      if (!username || !password) return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
      const session = await loginAdmin(username, password);
      if (!session) return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
      const response = NextResponse.json({ ok: true, username: session.username });
      response.cookies.set(sessionCookie.name, createSessionToken(session.userId, session.username), sessionCookie.options);
      return response;
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }

  const session = await getSessionUser(request);
  if (!session) return unauthorized();

  try {
    if (action === "logout") {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
      return response;
    }
    if (action === "change-credentials") {
      const body = await request.json();
      const result = await updateCredentials(
        session.userId,
        String(body.currentPassword ?? ""),
        String(body.newUsername ?? "").trim().slice(0, 64),
        String(body.newPassword ?? ""),
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      const response = NextResponse.json({ ok: true, username: body.newUsername || session.username });
      if (String(body.newUsername ?? "").trim()) {
        response.cookies.set(
          sessionCookie.name,
          createSessionToken(session.userId, String(body.newUsername).trim()),
          sessionCookie.options,
        );
      }
      return response;
    }

    const body = await request.json();
    const dealId = String(body.dealId ?? "");
    const act = String(body.action ?? "");
    if (!dealId || !["approve", "reject"].includes(act)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    if (act === "approve") {
      await publishDealToChannel(dealId);
      return NextResponse.json({ ok: true, published: true });
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("deals").update({ status: "rejected" }).eq("id", dealId);
    if (error) throw error;
    return NextResponse.json({ ok: true, published: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
