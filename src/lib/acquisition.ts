import { prisma } from "@/lib/prisma";

export type InboundAcquisition = {
  source: "meta_ads" | "message_code";
  campaignCode?: string;
  sourceType?: string;
  sourceId?: string;
  sourceUrl?: string;
  headline?: string;
  body?: string;
  mediaType?: string;
  mediaUrl?: string;
  ctwaClid?: string;
};

// Only eat horizontal padding around the marker. Newlines are semantic input for
// shopping lists and must survive byte-for-byte (a forwarded list is not a sentence).
const CAMPAIGN_TAG = /[ \t]*\[AD:([A-Z0-9][A-Z0-9_-]{0,31})\][ \t]*/gi;

function clipped(value: string | undefined, max: number): string | undefined {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : undefined;
}

// Text tags are only a fallback for previews/manual links. Meta's referral object and
// ctwa_clid are authoritative. Removing the tag here keeps it out of the NLU and the
// customer's recorded sentence.
export function stripAcquisitionTag(input: string): { text: string; campaignCode?: string } {
  let campaignCode: string | undefined;
  const text = input.replace(CAMPAIGN_TAG, (_match, raw: string) => {
    campaignCode ??= raw.toUpperCase();
    return " ";
  });
  // Fast path also guarantees that ordinary customer text is not normalized by the
  // attribution layer. When a tag exists, collapse only duplicate horizontal spaces.
  return campaignCode
    ? { text: text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim(), campaignCode }
    : { text: input.trim() };
}

export function metaReferralAcquisition(referral: {
  source_type?: string;
  source_id?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
} | undefined): InboundAcquisition | undefined {
  if (!referral) return undefined;
  const meaningful = referral.ctwa_clid || referral.source_id || referral.source_url || referral.headline || referral.body;
  if (!meaningful) return undefined;
  return {
    source: "meta_ads",
    sourceType: clipped(referral.source_type, 80),
    sourceId: clipped(referral.source_id, 160),
    sourceUrl: clipped(referral.source_url, 2000),
    headline: clipped(referral.headline, 500),
    body: clipped(referral.body, 2000),
    mediaType: clipped(referral.media_type, 80),
    mediaUrl: clipped(referral.image_url ?? referral.video_url ?? referral.thumbnail_url, 2000),
    ctwaClid: clipped(referral.ctwa_clid, 500)
  };
}

export function mergeAcquisition(
  referral: InboundAcquisition | undefined,
  campaignCode: string | undefined
): InboundAcquisition | undefined {
  if (referral) return { ...referral, ...(campaignCode ? { campaignCode } : {}) };
  return campaignCode ? { source: "message_code", campaignCode } : undefined;
}

export async function recordAcquisitionTouch(input: {
  conversationId: string;
  providerMessageId: string;
  acquisition: InboundAcquisition;
}) {
  const acquisition = input.acquisition;
  return prisma.acquisitionTouch.upsert({
    where: { providerMessageId: input.providerMessageId },
    create: {
      conversationId: input.conversationId,
      providerMessageId: input.providerMessageId,
      source: acquisition.source,
      campaignCode: clipped(acquisition.campaignCode, 32),
      sourceType: clipped(acquisition.sourceType, 80),
      sourceId: clipped(acquisition.sourceId, 160),
      sourceUrl: clipped(acquisition.sourceUrl, 2000),
      headline: clipped(acquisition.headline, 500),
      body: clipped(acquisition.body, 2000),
      mediaType: clipped(acquisition.mediaType, 80),
      mediaUrl: clipped(acquisition.mediaUrl, 2000),
      ctwaClid: clipped(acquisition.ctwaClid, 500)
    },
    // A provider message is immutable evidence. Never let a retry rewrite its origin.
    update: {}
  });
}

export async function latestAcquisitionTouchId(conversationId: string): Promise<string | undefined> {
  // A later repeat purchase must not be credited forever to an old ad click. Seven
  // days matches the pilot's decision window; the env exists so the reporting policy
  // can change without a migration.
  const configuredDays = Number(process.env.LIA_AD_ATTRIBUTION_DAYS ?? 7);
  const windowDays = Number.isFinite(configuredDays) ? Math.min(90, Math.max(1, configuredDays)) : 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60_000);
  const touch = await prisma.acquisitionTouch.findFirst({
    where: { conversationId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  return touch?.id;
}

type SummaryCounters = {
  touches: number;
  conversations: number;
  orders: number;
  paidOrders: number;
  refundedOrders: number;
  retainedRevenue: number;
};

export async function getAcquisitionSummary(windowDays = 7) {
  const safeDays = Math.min(90, Math.max(1, Math.round(windowDays)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60_000);
  const touches = await prisma.acquisitionTouch.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      conversationId: true,
      source: true,
      sourceId: true,
      campaignCode: true,
      orders: { select: { id: true, status: true, total: true, paidAt: true } }
    }
  });

  const summarize = (rows: typeof touches): SummaryCounters => {
    const conversations = new Set(rows.map((row) => row.conversationId));
    const orders = new Map(rows.flatMap((row) => row.orders.map((order) => [order.id, order] as const)));
    const paid = [...orders.values()].filter((order) => order.paidAt);
    const refunded = paid.filter((order) => ["refund_pending", "refunded"].includes(order.status));
    const retained = paid.filter((order) => !["refund_pending", "refunded", "canceled"].includes(order.status));
    return {
      touches: rows.length,
      conversations: conversations.size,
      orders: orders.size,
      paidOrders: paid.length,
      refundedOrders: refunded.length,
      retainedRevenue: Math.round(retained.reduce((sum, order) => sum + order.total, 0) * 100) / 100
    };
  };

  const buckets = new Map<string, typeof touches>();
  for (const touch of touches) {
    const key = touch.campaignCode ?? touch.sourceId ?? touch.source;
    const bucket = buckets.get(key) ?? [];
    bucket.push(touch);
    buckets.set(key, bucket);
  }

  return {
    windowDays: safeDays,
    since,
    ...summarize(touches),
    groups: [...buckets.entries()].map(([key, rows]) => ({ key, ...summarize(rows) }))
      .sort((a, b) => b.paidOrders - a.paidOrders || b.conversations - a.conversations)
  };
}
