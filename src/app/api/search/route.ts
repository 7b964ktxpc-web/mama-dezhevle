import { NextResponse } from "next/server";
import { searchProducts } from "../../../lib/product-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json({ results: [] });

  try {
    const results = await searchProducts(query, 12);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [], error: error instanceof Error ? error.message : String(error) });
  }
}
