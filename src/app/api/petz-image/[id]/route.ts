import { prisma } from "@/lib/prisma";
import { opsKeyMatches } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Revisão 01/09: a rota aceitava qualquer `image/*` (SVG com <script> = XSS armazenado
// same-origin contra o cookie do /ops) e falhava aberta sem token.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// GET: serve a re-hosted Petz product image from our own domain. This is the URL stored
// in the catalog and sent to WhatsApp — Twilio CAN fetch it (unlike Petz's Akamai-locked
// CDN, which 403s every server-side request). Immutable-cached so it's fetched once.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const row = await prisma.petzImage.findUnique({ where: { id: params.id } });
  if (!row) return new Response("not found", { status: 404 });
  const buf = row.data as unknown as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      // Só raster sai daqui: um SVG gravado seria script rodando na nossa origem.
      "Content-Type": ALLOWED_TYPES.has(row.contentType) ? row.contentType : "image/jpeg",
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox"
    }
  });
}

// POST: re-host one image. Called from the browser (which passes Akamai and can read
// Petz's CORS-enabled image bytes) as a no-cors text/plain request so it needs no
// preflight: body = JSON string {key, dataUrl}. Auth via OPS_TOKEN. Stores a small
// resized JPEG in Postgres, keyed by the Petz product id (the [id] path segment).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const raw = await req.text();
  let payload: { key?: string; dataUrl?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!opsKeyMatches(payload.key)) return new Response("unauthorized", { status: 401 });
  if (!/^[\w.-]{1,64}$/.test(params.id)) return new Response("bad id", { status: 400 });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(payload.dataUrl ?? "");
  if (!match) return new Response("bad dataUrl", { status: 400 });
  const contentType = match[1].toLowerCase();
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 900_000) return new Response("bad size", { status: 400 });
  await prisma.petzImage.upsert({
    where: { id: params.id },
    create: { id: params.id, data, contentType, bytes: data.length },
    update: { data, contentType, bytes: data.length }
  });
  return new Response("ok");
}
