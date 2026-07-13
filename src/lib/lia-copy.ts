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

export function welcomeAddressButton(): string {
  return "Oi! 💚 Sou a Lia. Eu busco suas compras e entrego hoje mesmo. Pra começar, vamos cadastrar e verificar seu endereço — você só faz isso uma vez.";
}

export function quantityAsk(name: string): string {
  return `Quantas unidades de *${name}*? Responde *1*, *2*, *3* ou digita outra quantidade.`;
}

export function askMoreItems(): string {
  return "Claro! Sua cesta continua salva. Me diz o que mais você quer adicionar. 🙂";
}

// Re-pedido de CEP (2ª+ vez) — curto, sem repetir a apresentação inteira.
export function askCepAgain(): string {
  return "Só preciso do seu *CEP* pra continuar (ex.: 01310-100) 📍 — com ele eu calculo a entrega certinha.";
}

// Itens anotados quando a Lia JÁ se apresentou — confirma curto e pede só o CEP.
export function notedAskCep(notedItems: string[]): string {
  return `✅ Anotei:\n${notedItems.map((i) => `• ${i}`).join("\n")}\n\nAgora só falta seu *CEP* (ex.: 01310-100) 📍 que eu busco tudo.`;
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

// Fora da área que a Lia atende hoje: nunca aceita um pedido que não consegue entregar —
// guarda o contato e promete avisar. `areaLabel` vem da config de cobertura (coverage.ts).
export function outsideCoverage(city: string | undefined, areaLabel: string): string {
  const onde = city ? `em ${city}` : "aí ainda";
  return [
    `Ah, que pena — a Lia ainda não chega ${onde} 😔.`,
    `Por enquanto eu entrego só em *${areaLabel}*.`,
    "",
    "Mas já anotei seu contato aqui 📍 — assim que a gente chegar na sua região, te chamo na hora! 💚"
  ].join("\n");
}

// Cidade É atendida, mas o endereço ficou longe demais de qualquer loja parceira hoje.
// Cuidado: NÃO dizer "não atendo sua cidade" (atendo!) — é questão de loja perto ainda.
export function tooFarForDelivery(city: string | undefined, areaLabel: string): string {
  const onde = city ? `em ${city}` : "no seu endereço";
  return [
    `Eu até atendo ${onde}, mas ele ficou longe demais das lojas parceiras que eu tenho por perto 😔.`,
    "Assim eu não conseguiria te entregar hoje sem te cobrar um frete que não vale a pena.",
    "",
    "Já anotei seu contato 📍 — assim que abrir uma loja mais pertinho de você, te chamo na hora! 💚"
  ].join("\n");
}

// ---------- search / basket ----------

export function searching(): string {
  return "🔎 Procurando aqui, um instante…";
}

export function deliveryQuoteUnavailable(): string {
  return "Não consegui confirmar o valor da entrega agora 🙏. Não vou te mostrar um frete estimado. Tenta de novo em instantes que eu faço uma nova cotação em tempo real.";
}

export function itemsNotFound(items: string[]): string {
  return `Não achei ${items.join(", ")} no catálogo de hoje 🤔. Se quiser, me manda uma marca, tamanho ou versão específica que eu tento de novo.`;
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

// "só isso" com a cesta ABAIXO do mínimo da loja: sem loop — explica e dá saída.
export function minimumDeadEnd(displayMin: number, falta: number): string {
  return [
    `Entendi! Só que a loja não fecha pedido abaixo de *${brl(displayMin)}* em produtos — falta *${brl(falta)}* 😕`,
    "",
    "Me manda mais um itenzinho barato (um sal, um fósforo, um biscoito…) que eu fecho — ou responde *cancelar* se preferir deixar pra depois. 🙂"
  ].join("\n");
}

export function finishOrderFirst(): string {
  return "Você ainda não fechou esse pedido 🙂 Responde *pagar* que eu te passo o código na hora.";
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

export function choiceSequence(queries: string[]): string {
  return `Encontrei os ${queries.length} itens. Vou te mostrar um de cada vez pra ficar fácil — primeiro *${queries[0]}* e depois ${queries
    .slice(1)
    .map((q) => `*${q}*`)
    .join(", ")}.`;
}

export function nextChoiceHeader(query: string, remaining: number): string {
  const tail = remaining > 1 ? ` Depois ainda falta escolher ${remaining - 1}.` : "";
  return `Agora vamos escolher *${query}*.${tail}`;
}

export function choiceLine(index: number, name: string, displayPrice: number): string {
  return `*${index + 1})* ${name} — ${brl(displayPrice)}`;
}

export function choicesAsk(count: number): string {
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  return count <= 1
    ? "Responde *1* pra confirmar — ou *qualquer* que eu escolho, ou *pula* pra deixar de fora. 🙂"
    : `Responde *${nums.slice(0, -1).join("*, *")}* ou *${nums[nums.length - 1]}* — ou *qualquer* que eu escolho, ou *pula* pra deixar de fora. 🙂`;
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
  pickupCount?: number;
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
  if ((input.pickupCount ?? 1) > 1) {
    out.push("", `_Este pedido usa ${input.pickupCount} lojas. O frete acima já soma as ${input.pickupCount} retiradas._`);
  }
  out.push(
    "",
    "Escolha abaixo como prefere pagar. 💚",
    "_Quer mudar algo antes? \"tira o arroz\", \"troca X por Y\" ou simplesmente manda mais itens._"
  );
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

// O CÓDIGO vai numa mensagem SEPARADA (enviada logo após esta): no WhatsApp o cliente
// copia a mensagem inteira — se tiver prosa junto, o Pix não cola no banco.
export function pixInstructions(total: number, mock: boolean): string {
  return [
    `Fechado! Total *${brl(total)}* no Pix.`,
    "",
    "Vou te mandar o código na próxima mensagem — é só segurar nela, copiar e colar no *Pix copia e cola* do seu banco. 👇",
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

// Intro do reenvio — o código em si vai na mensagem seguinte, sozinho (copiável).
export function resendPix(): string {
  return "Claro! Segue seu código Pix na próxima mensagem 👇 É só copiar ela inteira e colar no *Pix copia e cola* do banco. 💚";
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

// "coca" com Fanta+2 Cocas na mesa → estreitou pras que batem.
export function narrowedChoices(query: string): string {
  return `Boa, ficou entre essas de *${query}*:`;
}

// "só isso"/"fechado" quando o pedido já está fechado e só falta a forma de pagamento —
// nunca responder "não peguei qual você quer" (copy de escolha de produto).
export function donePickPayment(): string {
  return "Fechado, pedido completo! 🙌";
}

// "algum até X reais?" e nenhuma das opções na mesa cabe no teto.
export function nonePriceCap(cap: number): string {
  return `Dessas aqui, nenhuma sai por até ${brl(cap)} 😕 Responde *mais barato* que eu pego a mais em conta, ou *mais opções* que eu procuro outras.`;
}

// Item novo anotado ENQUANTO o cliente ainda escolhe outro — sem isto o item entra
// mudo na fila e o cliente acha que a Lia ignorou.
export function queuedItemsNote(queries: string[]): string {
  return `Anotei ${queries.map((q) => `*${q}*`).join(", ")} pra gente escolher já já 😉`;
}

// "vai mudar o frete?" com pedido já cotado → o número real, não a explicação genérica.
export function currentFee(fee: number): string {
  return `No seu pedido atual a entrega tá em *${brl(fee)}* 🛵 Se mudar o endereço ou a cesta, eu recalculo e te mostro de novo.`;
}

// "quanto deu?" com cobrança aberta → total fechado + caminho pro código.
export function totalAwaitingPayment(total: number): string {
  return `O total ficou em *${brl(total)}* — só falta o pagamento 🙂 Quer o código de novo? Responde *pix* (ou *cartão*, se preferir o link).`;
}

// "quanto deu tudo?" no meio das escolhas/coleta → parcial honesto, sem inventar frete.
export function partialTotal(items: CopyBasketItem[], produtos: number, pendingCount: number): string {
  if (!items.length) {
    return "Ainda não fechamos nenhum item 🙂 Me responde as opções que eu te passo o total certinho, com a entrega.";
  }
  const lines = items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  const tail =
    pendingCount > 0
      ? `_Falta escolher ${pendingCount === 1 ? "1 item" : `${pendingCount} itens`} — aí te passo o total com a entrega._`
      : '_Te passo o total com a entrega quando você fechar — é só dizer *"só isso"*._';
  return ["🛒 *Até agora:*", ...lines, "", `Produtos: ${brl(produtos)}`, tail].join("\n");
}

// ---------- perguntas de serviço / atendimento ----------

// Resposta direta a "vocês entregam em X?", "quanto custa o frete?", "demora quanto?",
// "como pago?" — NUNCA cair em busca de produto com pergunta operacional.
export function serviceAnswer(
  topic: "area" | "fee" | "eta" | "payment" | "generic",
  areaLabel: string,
  ctx?: { hasCep?: boolean; hasBasket?: boolean }
): string {
  switch (topic) {
    case "area":
      return ctx?.hasCep
        ? `A Lia atende ${areaLabel} 📍 Seu endereço já tá salvo e coberto — e se quiser conferir outro lugar, me manda o CEP que eu confirmo na hora!`
        : `A Lia atende ${areaLabel} 📍 Me manda seu *CEP* que eu confirmo na hora se chego até você!`;
    case "fee":
      if (ctx?.hasBasket)
        return "A entrega é por motoboy e o frete sai pela distância até você 🛵 Te mostro o valor certinho junto com o total, assim que a gente fechar a cesta — sem surpresa.";
      if (ctx?.hasCep)
        return "A entrega é por motoboy e o frete sai pela distância até você 🛵 Me diz o que precisa que eu já te mostro o total certinho, sem surpresa.";
      return "A entrega é feita por motoboy e o frete é calculado na hora, pela distância até você 🛵 Me diz o que precisa + seu CEP que eu já te mostro o total certinho, sem surpresa.";
    case "eta":
      return "A entrega é no mesmo dia — normalmente em 1 a 2 horas depois do pagamento, dependendo da distância 🛵 Quando você fizer o pedido eu te mostro a previsão certinha.";
    case "payment":
      return "Você paga *Pix* (copia-e-cola, sem taxa) ou *cartão* (link seguro do Mercado Pago) — tudo aqui pelo chat mesmo. 💳 Vale-refeição por enquanto não consigo aceitar. 🙏";
    default:
      return "Boa pergunta! Eu faço suas compras do dia a dia e entrego no mesmo dia por motoboy — você paga por Pix ou cartão aqui no chat. Me diz o que você precisa que eu resolvo. 💚";
  }
}

export function humanHandoff(): string {
  return "Claro! Já chamei alguém da equipe pra falar com você por aqui mesmo — pode escrever o que precisa que a mensagem chega. 💚 Enquanto isso, se for sobre um pedido, me pergunta *status* que eu te adianto.";
}

export function complaintAck(): string {
  return "Poxa, sinto muito por isso 😔 Já passei sua mensagem pra equipe — vamos resolver. Me conta o que aconteceu (ou manda uma foto) que a gente dá um jeito: troca ou estorno, o que preferir.";
}

export function cancelHowTo(hasActiveOrder: boolean): string {
  return hasActiveOrder
    ? 'Consegue sim! É só responder *cancelar* que eu cancelo pra você. Se o pedido já saiu pra entrega aí não dá mais, tá? 🙂'
    : 'Consegue sim — quando tiver um pedido em andamento, é só dizer *cancelar*. Agora mesmo você não tem nenhum aberto. 🙂';
}

export function cartExpired(): string {
  return "_Sua lista anterior expirou, então comecei uma nova pra evitar erro. Seu endereço continua salvo._";
}

export function orderReopened(): string {
  return "Deixa comigo! Atualizei seu pedido com o item novo — o total anterior não vale mais, segue o novo resumo 👇";
}

export function greetingMidOrder(step: string, itemCount: number): string {
  const base = "Oi de novo! 💚";
  if (step === "awaiting_payment") return `${base} Seu pedido está só esperando o pagamento — responde *pagar* se precisar do código de novo.`;
  if (itemCount > 0) return `${base} Sua cesta tem ${itemCount} ${itemCount === 1 ? "item" : "itens"} — me diz o que mais precisa, ou responde *pagar* pra fechar.`;
  return `${base} Me diz o que você precisa hoje — ex.: ${EXAMPLES}.`;
}

export function genericError(): string {
  return "Tive um probleminha aqui agora 🙏. Pode mandar de novo em instantes?";
}
