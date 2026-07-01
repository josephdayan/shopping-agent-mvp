import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Exchange the ops key (from ?key=) for a long-lived httpOnly cookie, so the operator
// can bookmark a plain /ops with no token in the URL. Called once by the board when it
// sees a ?key=; after that the cookie authorizes /api/ops/* automatically.
export async function GET(request: Request) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  const key = new URL(request.url).searchParams.get("key");
  if (!expected || key !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("ops_session", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90 // 90 days
  });
  return res;
}
