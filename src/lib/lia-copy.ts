// Every customer-facing message Lia sends, in one place. Pure functions over plain
// data (no prisma/adapters) so tone, wording and formatting stay consistent and are
// unit-testable. Voice: warm, brazilian, short sentences, at most ~1 emoji per
// message, never robotic, never blames the customer.

export function brl(value: number): string {
  return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
}

export type CopyBasketItem = { qty: number; name: string; displayLineTotal: number };

const EXAMPLES = `*"guaraná, pasta de dente e papel higiênico"*`;

// ---------- social ----------

export function greeting(): string {
  return `Oi! 💚 Sou a Lia — você me pede as compras do dia a dia por aqui, eu busco na loja e um motoboy entrega hoje mesmo.\n\nMe diz o que você precisa — ex.: ${EXAMPLES}.`;
}

export function thanks(): string {
  return "Imagina! 💚 Qualquer coisa é só chamar.";
}

export function help(): string {
  return [
    "Eu faço suas compras do dia a dia e entrego hoje. 💚 Funciona assim:",
    "",
    `1. Me diz o que precisa — ex.: ${EXAMPLES}`,
    "2. Eu mostro o total com frete",
    "3. Você paga por Pix ou cartão",
    "4. Chega na sua casa em ~1h 🛵",
    "",
    "Também entendo *status* (acompanhar o pedido), *trocar endereço*, *tira o item X*, *cancelar* e *repete o de sempre*."
  ].join("\n");
}

export function didNotUnderstand(): string {
  return `Não entendi seu pedido 🤔. Me diz os itens que você quer, ex.: ${EXAMPLES}.`;
}

// ---------- onboarding / address ----------

export function welcomeAskCep(notedItems?: string[]): string {
  const note = notedItems?.length ? `Já anotei:\n${notedItems.map((i) => `• ${i}`).join("\n")}\n\n` : "";
  return `Oi! 💚 Sou a Lia — faço suas compras do dia a dia e entrego em casa. ${note}Pra começar, me manda seu *CEP*? Configuro uma vez só e uso em todos os pedidos. 📍`;
}

export function addressSavedAskItems(address: string): string {
  return `📍 Endereço salvo: ${address}. Vou usar ele em todos os seus pedidos (se mudar, é só dizer "trocar endereço").\n\nAgora me diz o que você quer — ex.: ${EXAMPLES}.`;
}

export function addressSavedPrefix(address: string): string {
  return `📍 Endereço salvo: ${address}.`;
}

export function addressUpdated(address: string): string {
  return `📍 Prontinho, endereço atualizado: ${address}.`;
}

export function askNewCep(): string {
  return "Claro! Me manda o novo *CEP* (ex.: 01310-100) que eu atualizo. 📍";
}

export function askCepForQuote(items: string[]): string {
  return `Anotei:\n${items.map((i) => `• ${i}`).join("\n")}\n\nQual seu *CEP*? Assim calculo o frete e o prazo certinhos. 📦`;
}

export function cepNotFound(cep: string): string {
  return `Hmm, não achei o CEP ${cep} 🤔. Confere se está certinho (ex.: 01310-100) e me manda de novo?`;
}

// ---------- search / basket ----------

export function searching(): string {
  return "🔎 Procurando aqui, um instante…";
}

export function itemsNotFound(items: string[]): string {
  return `Não achei ${items.join(", ")} por aqui 🤔. Me diz de outro jeito (ex.: "pasta de dente Colgate", "fralda Pampers M") que eu procuro de novo.`;
}

export function noMedicine(): string {
  return "Remédio eu não consigo trazer (por lei, só farmácia pode vender) 🙏. Mas te ajudo com higiene, beleza, limpeza, mercado, bebida e pet — o que você precisa?";
}

export function medicineSkippedNote(): string {
  return "_Só não consigo trazer remédio (por lei, só farmácia vende) — deixei ele de fora._";
}

export function cartCleared(): string {
  return "Prontinho, limpei seu carrinho! 🧹 Me diz o que você quer agora.";
}

export function removedItems(names: string, basketEmpty: boolean): string {
  return basketEmpty
    ? `Pronto, tirei ${names}. Sua cesta ficou vazia — me diz o que você quer. 🙂`
    : `Pronto, tirei ${names}.`;
}

export function removeNotFound(): string {
  return "Não achei esse item na sua cesta 🤔. Me diz o nome como está na lista que eu tiro pra você.";
}

export function swapAskWhat(from: string): string {
  return `Trocar ${from} por qual produto? Me diz que eu busco. 🙂`;
}

export function swapRemovedPrefix(from: string): string {
  return `Troquei: tirei ${from}.`;
}

export function swappedFor(from: string, to: string): string {
  return `Troquei ${from} por ${to}. ✅`;
}

export function emptyCartPay(): string {
  return `Sua cesta ainda está vazia 🙂. Me diz o que você quer — ex.: ${EXAMPLES} — e eu já te passo o total.`;
}

export function rejectedAskAgain(): string {
  return "Sem problema! Me diz de outro jeito o que você procura (marca, tamanho…) que eu acho a opção certa. 🙂";
}

// ---------- choices ----------

export function choicesHeader(query: string): string {
  return `Achei essas opções de *${query}*:`;
}

export function choiceLine(index: number, name: string, displayPrice: number): string {
  return `*${index + 1})* ${name} — ${brl(displayPrice)}`;
}

export function choicesAsk(count: number): string {
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  return count <= 1
    ? "Responde *1* pra confirmar (ou *qualquer* que eu escolho pra você). 🙂"
    : `Responde *${nums.slice(0, -1).join("*, *")}* ou *${nums[nums.length - 1]}* — ou *qualquer* que eu escolho pra você. 🙂`;
}

export function choicesText(query: string, options: { name: string; displayPrice: number }[], header?: string): string {
  return [
    header ?? choicesHeader(query),
    ...options.map((o, i) => choiceLine(i, o.name, o.displayPrice)),
    "",
    choicesAsk(options.length)
  ].join("\n");
}

export function moreChoicesHeader(query: string): string {
  return `Claro! Mais opções de *${query}*:`;
}

export function noMoreOptions(query: string): string {
  return `Essas são todas as opções de *${query}* que eu tenho por aqui 🙏 Se alguma servir, responde o número — ou *pula* que eu sigo sem esse item.`;
}

export function refineNoResult(refined: string): string {
  return `Procurei *${refined}* e não achei por aqui 🙏 O que eu tenho são essas:`;
}

export function choiceConfirmed(name: string): string {
  return `✅ ${name}.`;
}

export function choiceSkipped(query: string): string {
  return `Tranquilo, deixei *${query}* de fora. Se quiser, me diz de outro jeito que eu procuro de novo.`;
}

export function choiceNotUnderstood(): string {
  return "Não peguei qual você quer 🤔.";
}

export function autoAddedNote(items: string[]): string {
  return `✅ Já anotei: ${items.join(", ")}.`;
}

export function notFoundNote(items: string[]): string {
  return `_Não achei: ${items.join(", ")} — me fala de outro jeito que eu procuro._`;
}

// ---------- quote / summary ----------

export type SummaryInput = {
  items: CopyBasketItem[];
  produtos: number;
  frete: number;
  etaMinutes: number;
  total: number;
  notFound?: string[];
};

export function summary(input: SummaryInput): string {
  const lines = input.items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  const out = [
    "🛒 *Seu pedido:*",
    ...lines,
    "",
    `Produtos: ${brl(input.produtos)}`,
    `🛵 Entrega: ${brl(input.frete)} · chega em ~${input.etaMinutes} min`,
    `*Total: ${brl(input.total)}*`
  ];
  if (input.notFound?.length) {
    out.push("", notFoundNote(input.notFound));
  }
  out.push("", "Posso fechar? Responde *pagar* que eu te passo o Pix ou o link do cartão. 💚");
  return out.join("\n");
}

export function minimumOrder(input: { items: CopyBasketItem[]; produtos: number; displayMin: number; falta: number }): string {
  const lines = input.items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  return [
    "🛒 *Seu pedido até agora:*",
    ...lines,
    "",
    `Produtos: ${brl(input.produtos)}`,
    "",
    `A loja pede um mínimo de *${brl(input.displayMin)}* em produtos — falta só *${brl(input.falta)}*. Me manda mais um itenzinho que eu fecho pra você! 🙂`
  ].join("\n");
}

export function freteChoice(barato?: { fee: number; etaMinutes: number }, rapido?: { fee: number; etaMinutes: number }): string {
  const lines = ["Como prefere a entrega? 🛵"];
  if (barato) lines.push(`*1)* Mais barata — ${brl(barato.fee)} · chega em ~${barato.etaMinutes} min`);
  if (rapido) lines.push(`*2)* Mais rápida — ${brl(rapido.fee)} · chega em ~${rapido.etaMinutes} min`);
  lines.push("", "Responde *1* ou *2*.");
  return lines.join("\n");
}

// ---------- payment ----------

export function paymentMethod(totalPix: number, totalCard: number): string {
  return [
    "Como prefere pagar? 💳",
    `*1)* Pix — ${brl(totalPix)} _(sem taxa, cai na hora)_`,
    `*2)* Cartão — ${brl(totalCard)} _(com a taxa da maquininha)_`,
    "",
    "Responde *pix* ou *cartão* (ou 1/2)."
  ].join("\n");
}

export function pixInstructions(total: number, copiaECola: string, mock: boolean): string {
  return [
    `Fechado! Total *${brl(total)}* no Pix.`,
    "",
    "Copia o código abaixo e cola no *Pix copia e cola* do seu banco 👇",
    copiaECola,
    "",
    mock ? sandboxHint() : "Assim que o Pix cair eu já começo a separar tudo e te aviso por aqui. 💚"
  ].join("\n");
}

export function cardInstructions(total: number, link: string, mock: boolean): string {
  return [
    `Fechado! Total *${brl(total)}* no cartão _(taxa da maquininha já incluída)_.`,
    "",
    "Paga com cartão por este link seguro 👇",
    link,
    "",
    mock ? sandboxHint() : "Assim que o pagamento aprovar eu já começo a separar tudo e te aviso por aqui. 💚"
  ].join("\n");
}

export function paymentConfirmed(): string {
  return "Pagamento confirmado! ✅ Já estou separando seu pedido — te aviso assim que sair pra entrega. 🛵";
}

export function pixNotSeenYet(): string {
  return "Ainda não apareceu aqui — o Pix costuma cair em segundos. 🙂 Assim que confirmar eu te aviso na hora. Se demorar mais de 5 min, me chama!";
}

export function cardPending(): string {
  return "A aprovação do cartão chega automática pra mim — assim que confirmar, te aviso na hora por aqui. 🙂";
}

export function alreadyPaid(): string {
  return "Pode ficar tranquilo, seu pagamento já está confirmado por aqui! ✅ Estou cuidando do seu pedido — quer saber como está, é só perguntar *status*.";
}

export function resendPix(copiaECola: string): string {
  return ["Claro! Seu Pix é este 👇", copiaECola, "", "É só colar no *Pix copia e cola* do banco. 💚"].join("\n");
}

export function resendCard(link: string): string {
  return ["Claro! Seu link de pagamento é este 👇", link].join("\n");
}

export function paymentSwitched(method: "pix" | "card", total: number): string {
  return method === "pix"
    ? `Sem problema, troquei pra Pix — o total fica *${brl(total)}* (sem taxa). Segue o código 👇`
    : `Sem problema, troquei pro cartão — o total fica *${brl(total)}* (com a taxa da maquininha). Segue o link 👇`;
}

export function sandboxHint(): string {
  return "_(sandbox: responda *paguei* pra simular o pagamento)_";
}

// ---------- order lifecycle ----------

export function orderStatusLine(input: {
  shortId: string;
  status: string;
  trackingUrl?: string | null;
  etaMinutes?: number;
  itemsPreview?: string;
}): string {
  const id = `*#${input.shortId}*`;
  switch (input.status) {
    case "awaiting_payment":
      return `Seu pedido ${id} está só esperando o pagamento. 💳 Se precisar do código de novo, responde *pagar*.`;
    case "paid":
      return `Seu pedido ${id} está confirmado e já estou separando os itens. 🛒 Te aviso quando sair pra entrega!`;
    case "operator_buying":
    case "ready_for_pickup":
      return `Seu pedido ${id} já foi comprado e está sendo preparado. 📦 O motoboy sai em breve — te aviso!`;
    case "dispatched":
      return `Seu pedido ${id} saiu pra entrega! 🛵${input.trackingUrl ? `\nAcompanha por aqui: ${input.trackingUrl}` : ""}`;
    case "delivered":
      return `Seu pedido ${id} foi entregue! 🎉 Se precisar de mais alguma coisa é só chamar.`;
    case "canceled":
      return `Seu pedido ${id} foi cancelado. Se pagou algo, o estorno já está a caminho. Quer pedir de novo? 💚`;
    default:
      return `Seu pedido ${id} está em andamento. Qualquer novidade eu te aviso por aqui!`;
  }
}

export function noOrdersYet(): string {
  return "Você ainda não tem pedidos por aqui. 🙂 Me diz o que precisa que eu monto o primeiro!";
}

export function canceledUnpaid(): string {
  return "Prontinho, cancelei — como o pagamento não tinha caído, não foi cobrado nada. 🙂 Quando quiser, é só pedir de novo!";
}

export function cancelRequestedPaid(): string {
  return "Deixa comigo — já pedi o cancelamento pra equipe e te confirmo o estorno por aqui em instantes. 🙏";
}

export function cancelTooLate(): string {
  return "Esse já saiu pra entrega, então não consigo mais cancelar 😅. Qualquer problema com o pedido, me chama que eu resolvo!";
}

export function nothingToCancel(): string {
  return "Não achei nenhum pedido em andamento pra cancelar 🙂. Se quiser começar um novo, me diz o que precisa!";
}

export function noPreviousOrder(): string {
  return "Ainda não tenho um pedido anterior seu pra repetir. Me diz o que você quer que eu monto rapidinho. 🙂";
}

export function dispatched(trackingUrl?: string | null): string {
  return `🛵 Saiu pra entrega!${trackingUrl ? `\nAcompanha em tempo real: ${trackingUrl}` : ""} Te aviso quando chegar.`;
}

export function delivered(): string {
  return "Entregue! 🎉 Espero que esteja tudo certinho. Da próxima é só mandar *repete o de sempre*. 💚";
}

export function canceledRefunded(): string {
  return "Seu pedido foi cancelado e o valor está sendo estornado. Desculpa o transtorno! 🙏";
}

export function finishChoiceFirst(): string {
  return "Só me confirma esse item primeiro que aí eu fecho tudo. 🙂";
}

export function genericError(): string {
  return "Tive um probleminha aqui agora 🙏. Pode mandar de novo em instantes?";
}
