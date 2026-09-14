// Classificação PURA dos e-mails transacionais das lojas (Fase 4, 11/09). Mesmo espírito de
// explicitTrackingStatus: frases explícitas por remetente, número do pedido obrigatório,
// nada de inferência. O corpo do e-mail nunca é gravado; só o veredito.
export type StoreMailKind = "created" | "paid" | "invoiced" | "out_for_delivery" | "delivered" | "canceled";
export type StoreMailVerdict = { kind: StoreMailKind; storeOrderNumber: string; trackingUrl?: string };

// `senders`: domínio de plataforma compartilhada (VTEX) aceito só com o nome de exibição exato da loja.
type Rule = { domains: string[]; senders?: { domain: string; name: string }[]; number: RegExp; kinds: { kind: StoreMailKind; subject: RegExp }[] };
const VTEX_KINDS: Rule["kinds"] = [
  { kind: "delivered", subject: /(pedido|compra) (foi )?entregu[eo]|entrega (conclu[ií]da|realizada)/i },
  { kind: "out_for_delivery", subject: /saiu para entrega|a caminho|em rota de entrega/i },
  { kind: "invoiced", subject: /nota fiscal|faturad[oa]/i },
  { kind: "canceled", subject: /cancelad[oa]/i },
  { kind: "paid", subject: /pagamento (aprovado|confirmado)/i },
  { kind: "created", subject: /pedido (recebido|realizado|confirmado|criado)|recebemos seu pedido/i },
];
const VTEX_NUMBER = /\b(\d{9,13}-\d{2})\b/;
export const STORE_MAIL_RULES: Record<string, Rule> = {
  swift: { domains: ["swift.com.br"], senders: [{ domain: "vtexcommerce.com.br", name: "Loja Online Swift" }], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  cobasi: { domains: ["cobasi.com.br"], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  rihappy: { domains: ["rihappy.com.br"], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  drogariasp: { domains: ["drogariasaopaulo.com.br"], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  naturaldaterra: { domains: ["naturaldaterra.com.br"], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  paguemenos: { domains: ["paguemenos.com.br"], number: VTEX_NUMBER, kinds: VTEX_KINDS },
  mercadolivre: {
    domains: ["mercadolivre.com.br", "mercadolivre.com", "mercadopago.com.br"],
    number: /\b(2\d{15})\b/,
    kinds: [
      { kind: "delivered", subject: /(foi |está )?entregu[eo]|chegou/i },
      { kind: "out_for_delivery", subject: /saiu para entrega|a caminho|chega hoje/i },
      { kind: "canceled", subject: /cancelad[oa]/i },
      { kind: "paid", subject: /pagamento aprovado|compra aprovada/i },
      { kind: "created", subject: /voc[êe] comprou|compra realizada|pedido recebido/i },
    ],
  },
};
function senderMatches(from: string, rule: Rule) {
  const hit = (d: string, x: string) => d === x || d.endsWith(`.${x}`);
  const domains = (from.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+/g) ?? []).map((a) => a.split("@")[1]);
  if (domains.some((d) => rule.domains.some((x) => hit(d, x)))) return true;
  const name = from.split("<")[0].replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").toLowerCase();
  return (rule.senders ?? []).some((s) => name === s.name.toLowerCase() && domains.some((d) => hit(d, s.domain)));
}
export function classifyStoreMail(storeKey: string, mail: { from: string; subject: string; text: string }): StoreMailVerdict | null {
  const rule = STORE_MAIL_RULES[storeKey];
  if (!rule || !senderMatches(mail.from, rule)) return null;
  const subject = mail.subject.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const match = rule.kinds.find((k) => k.subject.test(subject));
  if (!match) return null;
  const haystack = `${mail.subject}\n${mail.text}`;
  const number = haystack.match(rule.number)?.[1];
  if (!number) return null;
  const tracking = haystack.match(/https:\/\/[^\s"'<>]+(rastre|tracking|track|envio|shipment)[^\s"'<>]*/i)?.[0];
  return { kind: match.kind, storeOrderNumber: number, ...(tracking ? { trackingUrl: tracking } : {}) };
}
