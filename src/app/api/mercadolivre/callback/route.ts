import { NextResponse } from "next/server";

// Compatibility for the old DevCenter callback. New apps must register the
// /oauth/callback URL, which binds the authorization response to a CSRF state
// cookie and stores the tokens encrypted instead of showing them in the browser.
export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/mercadolivre/oauth/callback";
  return NextResponse.redirect(url);
}
