import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET: serve a re-hosted Petz product image from our own domain. This is the URL stored
// in the catalog and sent to WhatsApp — Twilio CAN fetch it (unlike Petz's Akamai-locked
// CDN, which 403s every server-side request). Immutable-cached so it's fetched once.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = await prisma.petzImage.findUnique({ where: { id: params.id } });
  if (!row) return new Response("not found", { status: 404 });
  const buf = row.data as unknown as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.contentType || "image/jpeg",
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}

// POST: re-host one image. Called from the browser (which passes Akamai and can read
// Petz's CORS-enabled image bytes) as a no-cors text/plain request so it needs no
// preflight: body = JSON string {key, dataUrl}. Auth via OPS_TOKEN. Stores a small
// resized JPEG in Postgres, keyed by the Petz product id (the [id] path segment).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const expected = process.env.OPS_TOKEN ?? process.env.API_TOKEN;
  const raw = await req.text();
  let payload: { key?: string; dataUrl?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (expected && payload.key !== expected) return new Response("unauthorized", { status: 401 });
  const match = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(payload.dataUrl ?? "");
  if (!match) return new Response("bad dataUrl", { status: 400 });
  const contentType = match[1];
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 900_000) return new Response("bad size", { status: 400 });
  await prisma.petzImage.upsert({
    where: { id: params.id },
    create: { id: params.id, data, contentType, bytes: data.length },
    update: { data, contentType, bytes: data.length }
  });
  return new Response("ok");
}
