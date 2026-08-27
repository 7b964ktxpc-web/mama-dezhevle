import { NextResponse } from "next/server";
import { recordClick } from "../../lib/affiliate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("p");
  if (!productId) {
    return new NextResponse("Missing product id", { status: 400 });
  }

  try {
    const result = await recordClick(productId);
    if (!result) {
      return NextResponse.redirect(new URL("/", request.url), { status: 302 });
    }
    return NextResponse.redirect(result.url, { status: 302 });
  } catch {
    return new NextResponse("Tracking failed", { status: 500 });
  }
}
