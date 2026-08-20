// Every customer-facing message Lia sends, in one place. Pure functions over plain
// data (no prisma/adapters) so tone, wording and formatting stay consistent and are
// unit-testable.
//
// Voice (revisão do dono, 17/08/2026 — ver docs/todas-as-mensagens-da-lia.md):
//   1. Verbo na frente, resultado primeiro.
//   2. Sem preâmbulo de simpatia ("Prontinho", "Opa", "Claro!", "Fechado!", "Poxa").
//   3. Sem explicar a mecânica interna (quantas lojas, como o frete é calculado,
//      que a Pagar.me tokeniza o cartão, por que a cotação venceu).
//   4. No máximo 1 emoji, e só onde carrega informação (📍 endereço, 🛵 entrega, ✅ ok).
//   5. Uma saída por mensagem.
//   6. Sem lista de exemplos de produto — a pergunta aberta basta.
//   7. Sem endereço/CEP fictício de exemplo: descrever os campos, não inventar um.
//   8. NUNCA prometer prazo antes de cotar (regra abaixo).
//
// PRAZO — a regra que não pode ser quebrada: quem manda no prazo é o checkout da loja,
// e ele varia (às vezes é no mesmo dia, às vezes leva dias). Nenhuma mensagem genérica
// diz "chega hoje" / "no mesmo dia" / "em ~1h". O prazo aparece uma vez só, no resumo do
// pedido, e SOMENTE com o valor real que a loja devolveu — sem número inventado de
// fallback. Antes disso a Lia diz que MOSTRA o prazo, nunca qual é.

export function brl(value: number): string {
  return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
}

export type CopyBasketItem = { qty: number; name: string; displayLineTotal: number };

// ---------- social ----------

export function greeting(): string {
  return "Oi! Sou a Lia 💚 Me pede qualquer coisa que eu compro e entrego para você.";
}

export function thanks(): string {
  return "Imagina! Qualquer coisa é só chamar 💚";
}

export function help(): string {
  return [
    "Funciona assim:",
    "",
    "1. Você me diz o que precisa",
    "2. Eu mostro o total, o frete e o prazo",
    "3. Você paga por Pix ou cartão",
    "4. Eu compro e acompanho até chegar 🛵",
    "",
    "Também entendo *status*, *trocar endereço*, *tira o item X* e *repete o de sempre*.",
    "",
    "O que você precisa?"
  ].join("\n");
}

export function didNotUnderstand(): string {
  return "Não entendi. Me diz os itens que você quer.";
}

// "quero" / "queria comprar" sem dizer o quê — pergunta aberta, não "não entendi".
export function askWhatYouWant(): string {
  return "Me diz o que você precisa.";
}

// ---------- onboarding / address ----------

// A apresentação é a MESMA da `greeting` (sem o 💚, que fica só na saudação pura), pra
// Lia não se apresentar de três jeitos diferentes dependendo do caminho de entrada.
const INTRO = "Oi! Sou a Lia. Me pede qualquer coisa que eu compro e entrego para você.";

export function welcomeAskCep(notedItems?: string[]): string {
  const note = notedItems?.length ? `\n\nJá anotei:\n${notedItems.map((i) => `• ${i}`).join("\n")}` : "";
  return `${INTRO}${note}\n\nMe manda seu *CEP*? Só peço uma vez. 📍`;
}

export function welcomeAddressButton(): string {
  return `${INTRO}\n\nCadastra seu endereço aí embaixo — só uma vez.`;
}

export function welcomeAskFullDeliveryAddress(notedItems?: string[]): string {
  const note = notedItems?.length ? `\n\nJá anotei:\n${notedItems.map((i) => `• ${i}`).join("\n")}` : "";
  return `${INTRO}${note}\n\nMe manda seu *endereço completo* com CEP — rua, número, bairro e cidade. Só peço uma vez. 📍`;
}

// Fallback em texto dos botões 1 / 2 / Outra quantidade — por isso os números ficam:
// o texto tem que espelhar as mesmas opções que o canal com botões oferece.
export function quantityAsk(name: string): string {
  return `Quantas unidades de *${name}*? Responde *1*, *2* ou outro número.`;
}

export function askMoreItems(): string {
  return "Sua cesta está salva. O que mais você quer?";
}

// Re-pedido de endereço (2ª+ vez) — sem repetir a apresentação.
export function askCepAgain(): string {
  return "Falta seu *endereço completo com CEP* — rua, número, complemento, bairro, cidade e CEP 📍";
}

// Itens anotados quando a Lia JÁ se apresentou — confirma curto e pede só o CEP.
export function notedAskCep(notedItems: string[]): string {
  return `✅ Anotei:\n${notedItems.map((i) => `• ${i}`).join("\n")}\n\nFalta seu *CEP* 📍`;
}

// O cliente costuma terminar o endereço com ponto ("… São Paulo - SP.") — sem esta
// limpeza a mensagem saía com pontuação dupla ("SP..", rodada 8 de 14/08).
function cleanAddressForCopy(address: string): string {
  return address.replace(/[\s.,;]+$/, "");
}

export function addressSavedAskItems(address: string): string {
  return `📍 Endereço salvo: ${cleanAddressForCopy(address)}\n_Pra mudar depois, é só dizer "trocar endereço"._\n\nO que você quer?`;
}

// O CEP entra na confirmação quando é conhecido e não está no texto do endereço —
// 7º ciclo (16/08): o cliente corrigiu o CEP no fim do endereço, o fluxo processou
// certo, mas a confirmação não mostrava o número e parecia perdido.
function withCep(address: string, cep?: string): string {
  const clean = cleanAddressForCopy(address);
  if (!cep || clean.includes(cep)) return clean;
  return `${clean} — CEP ${cep}`;
}

export function addressSavedPrefix(address: string, cep?: string): string {
  return `📍 Endereço salvo: ${withCep(address, cep)}`;
}

export function addressUpdated(address: string, cep?: string): string {
  return `📍 Endereço atualizado: ${withCep(address, cep)}`;
}

// Encurtar não pode custar o SUBSTANTIVO: "Falta rua, número e complemento" chega logo
// depois de o cliente mandar um produto em vez do endereço, e sem a palavra "endereço" a
// frase não diz de que assunto ela é (eval manual-concierge, 17/08).
export function askFullDeliveryAddress(): string {
  return "Falta o *endereço*: rua, número e complemento 📍";
}

export function addressSavedAskCep(): string {
  return "📍 Endereço salvo. Falta o *CEP*.";
}

// UMA pergunta, não duas (feedback do dono, 16/08: "por que pede o CEP e depois o
// endereço?"). Os dois são necessários — CEP decide cobertura/frete, o endereço com
// número e complemento é o que o entregador usa — mas cabem na MESMA mensagem, e o
// parser já sabe ler endereço+CEP juntos desde 06/08.
export function askNewCep(): string {
  return "Manda o *endereço novo com CEP* — rua, número, complemento, bairro, cidade e CEP 📍";
}

export function askCepForQuote(items: string[]): string {
  return `Anotei:\n${items.map((i) => `• ${i}`).join("\n")}\n\nQual seu *CEP*? 📍`;
}

export function cepNotFound(cep: string): string {
  return `Não achei o CEP ${cep}. Confere e manda de novo.`;
}

// Fora da área que a Lia atende hoje: nunca aceita um pedido que não consegue entregar —
// guarda o contato e promete avisar. `areaLabel` vem da config de cobertura (coverage.ts).
// A área CONTINUA aparecendo aqui (e em `tooFarForDelivery` e `serviceAnswer:area`): sem
// dizer até onde a Lia vai, a recusa vira um "não" sem informação nenhuma.
export function outsideCoverage(city: string | undefined, areaLabel: string): string {
  const onde = city ? `em ${city}` : "aí";
  return [
    `Ainda não chego ${onde} — hoje entrego só em *${areaLabel}* 😔`,
    "",
    "Anotei seu contato: quando eu chegar na sua região, te chamo."
  ].join("\n");
}

// Cidade É atendida, mas o endereço ficou longe demais de qualquer loja parceira hoje.
// Cuidado: NÃO dizer "não atendo sua cidade" (atendo!) — é questão de loja perto ainda.
export function tooFarForDelivery(city: string | undefined, areaLabel: string): string {
  const onde = city ? city : "seu endereço";
  return [
    `Atendo ${onde}, mas seu endereço ficou longe demais das lojas que tenho por perto — o frete não valeria a pena 😔`,
    "",
    "Anotei seu contato: quando abrir uma loja mais perto, te chamo."
  ].join("\n");
}

// ---------- search / basket ----------

export function searching(): string {
  return "🔎 Procurando…";
}

export function deliveryQuoteUnavailable(): string {
  return "Não consegui confirmar o valor da entrega agora — e não quero te passar um valor chutado. Tenta de novo em instantes.";
}

export function itemsNotFound(items: string[]): string {
  return `Não achei ${items.join(", ")}. Me diz uma marca ou tamanho que eu tento de novo.`;
}

export function noMedicine(): string {
  return "Remédio eu não posso vender — por lei, só farmácia pode. Fora isso eu trago de tudo. O que mais você precisa?";
}

export function medicineSkippedNote(): string {
  return "_Remédio eu não posso vender, então deixei ele de fora._";
}

export function cartCleared(): string {
  return "Carrinho limpo. O que você quer agora?";
}

export function removedItems(names: string, basketEmpty: boolean): string {
  return basketEmpty ? `Tirei ${names}. Sua cesta ficou vazia — o que você quer?` : `Tirei ${names}.`;
}

export function removeNotFound(): string {
  return "Não achei esse item na sua cesta. Me diz o nome como está na lista.";
}

export function swapAskWhat(from: string): string {
  return `Trocar ${from} por qual?`;
}

export function swapRemovedPrefix(from: string): string {
  return `Tirei ${from}.`;
}

export function swappedFor(from: string, to: string): string {
  return `✅ Troquei ${from} por ${to}.`;
}

// "só isso" com a cesta ABAIXO do mínimo da loja: sem loop — explica e dá saída.
export function minimumDeadEnd(displayMin: number, falta: number): string {
  return [
    `A loja não fecha abaixo de *${brl(displayMin)}* — faltam *${brl(falta)}*.`,
    "",
    "Manda mais um item barato que eu fecho, ou responde *cancelar*."
  ].join("\n");
}

export function finishOrderFirst(): string {
  return "Esse pedido ainda não foi fechado. Responde *pagar* que eu mando o código.";
}

export function emptyCartPay(): string {
  return "Sua cesta está vazia. Me diz o que você quer.";
}

export function rejectedAskAgain(): string {
  return "Me diz de outro jeito — marca, tamanho — que eu procuro.";
}

// ---------- choices ----------

export function choicesHeader(query: string): string {
  return `Opções de *${query}*:`;
}

export function choiceSequence(queries: string[]): string {
  return `Achei os ${queries.length} itens. Vamos um de cada vez: *${queries[0]}*, depois ${queries
    .slice(1)
    .map((q) => `*${q}*`)
    .join(" e ")}.`;
}

export function nextChoiceHeader(query: string, remaining: number): string {
  const tail = remaining > 1 ? ` — depois faltam ${remaining - 1}` : "";
  return `Agora *${query}*${tail}.`;
}

export function choiceLine(index: number, name: string, displayPrice: number, delivery?: string): string {
  // `delivery` só existe em vitrine que informa o prazo por anúncio (Mercado Livre):
  // é a promessa da PRÓPRIA loja ("chega hoje"), nunca uma estimativa nossa.
  const prazo = delivery ? ` · _${delivery}_` : "";
  return `*${index + 1})* ${name} — ${brl(displayPrice)}${prazo}`;
}

// O comando *qualquer* continua valendo no parser; saiu só do texto, que oferecia
// quatro saídas de uma vez (dono, 17/08: "uma pergunta por mensagem").
export function choicesAsk(count: number): string {
  const nums = Array.from({ length: count }, (_, i) => i + 1);
  return count <= 1
    ? "Responde *1* pra confirmar, *outras* pra ver mais, ou *pula* pra deixar de fora."
    : `Responde *${nums.slice(0, -1).join("*, *")}* ou *${nums[nums.length - 1]}* — ou *outras* pra ver mais, *pula* pra deixar de fora.`;
}

export function choicesText(query: string, options: { name: string; displayPrice: number; delivery?: string }[], header?: string): string {
  return [
    header ?? choicesHeader(query),
    ...options.map((o, i) => choiceLine(i, o.name, o.displayPrice, o.delivery)),
    "",
    choicesAsk(options.length)
  ].join("\n");
}

export function moreChoicesHeader(query: string): string {
  return `Mais opções de *${query}*:`;
}

export function priceSortedHeader(query: string, cheapest: boolean): string {
  return cheapest ? `As mais baratas de *${query}*:` : `As mais caras de *${query}*:`;
}

export function noMoreOptions(query: string): string {
  return `Essas são todas as opções de *${query}* que eu tenho. Responde o número, ou *pula* pra seguir sem esse item.`;
}

export function refineNoResult(refined: string): string {
  return `Não achei *${refined}*. O que eu tenho é isso:`;
}

// Confirmação da escolha SEMPRE mostra a quantidade quando ela já é conhecida —
// "✅ Caixa de Bombom" depois de pedir "quatro caixas" parecia que o 4 se perdeu
// (re-teste 15/08, rodadas 3, 7 e 9; o estado interno estava certo, o texto não).
export function choiceConfirmed(name: string, qty = 1): string {
  return qty > 1 ? `✅ ${qty}x ${name}` : `✅ ${name}`;
}

export function choiceSkipped(query: string): string {
  return `Deixei *${query}* de fora. Se quiser, me diz de outro jeito que eu procuro.`;
}

// Dizia só "Não peguei qual você quer" e deixava o cliente sem próximo passo.
export function choiceNotUnderstood(): string {
  return "Não peguei qual você quer. Responde o número.";
}

export function autoAddedNote(items: string[]): string {
  return `✅ Anotei: ${items.join(", ")}`;
}

export function notFoundNote(items: string[]): string {
  return `_Não achei: ${items.join(", ")}. Me fala de outro jeito que eu procuro._`;
}

// ---------- quote / summary ----------

export type SummaryInput = {
  items: CopyBasketItem[];
  produtos: number;
  frete: number;
  etaMinutes?: number;
  deliveryPromise?: string;
  total: number;
  deliveryAddress?: string;
  notFound?: string[];
  pickupCount?: number;
};

// O prazo do resumo é o ÚNICO lugar onde a Lia fala em tempo — e só quando existe dado
// real. Antes havia `?? 40` / `?? 90` de fallback: sem prazo da loja, a Lia escrevia
// "chega em ~40 min" sem base nenhuma (dono, 17/08: "para de mentir q sempre chega no
// mesmo dia pq n eh verdade as vezes"). Sem dado, a linha sai só com o valor.
function deliveryLine(frete: number, deliveryPromise?: string, etaMinutes?: number): string {
  const prazo = deliveryPromise ?? (etaMinutes ? `chega em ~${etaMinutes} min` : null);
  return `Entrega: ${brl(frete)}${prazo ? ` · ${prazo}` : ""}`;
}

export function summary(input: SummaryInput): string {
  const lines = input.items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  const out = [
    "🛒 *Seu pedido:*",
    ...lines,
    "",
    `Produtos: ${brl(input.produtos)}`,
    deliveryLine(input.frete, input.deliveryPromise, input.etaMinutes),
    `*Total: ${brl(input.total)}*`
  ];
  if (input.notFound?.length) {
    out.push("", notFoundNote(input.notFound));
  }
  if ((input.pickupCount ?? 1) > 1) {
    out.push("", `_Frete de ${input.pickupCount} lojas já somado._`);
  }
  if (input.deliveryAddress) {
    out.push("", `📍 ${input.deliveryAddress}`, '_Pra mudar, diz "trocar endereço"._');
  }
  out.push(
    "",
    "Escolhe abaixo como quer pagar.",
    '_Quer ajustar? "tira o arroz", "troca X por Y", ou manda mais itens._'
  );
  return out.join("\n");
}

export function minimumOrder(input: {
  items: CopyBasketItem[];
  produtos: number;
  displayMin: number;
  falta: number;
  // A parte da cesta que NÃO conta pro mínimo desta loja. Sem mostrar isso, a mensagem
  // parecia um resumo completo e o cliente achava que os outros itens tinham sumido
  // (rodadas 3 e 10 dos testes reais de 14/08).
  storeLabel?: string;
  otherItems?: CopyBasketItem[];
}): string {
  const lines = input.items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  const store = input.storeLabel ?? "a loja";
  const out = [
    `🛒 *Itens de ${store}:*`,
    ...lines,
    "",
    `Produtos (${store}): ${brl(input.produtos)}`,
    "",
    `A ${store} tem pedido mínimo de *${brl(input.displayMin)}* — faltam *${brl(input.falta)}*. Manda mais um item de lá que eu fecho.`
  ];
  if (input.otherItems?.length) {
    out.push(
      "",
      "_O resto da sua cesta continua guardado:_",
      ...input.otherItems.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`)
    );
  }
  return out.join("\n");
}

// Escolha de entrega do MARKETPLACE (pedido do dono, 17/08: "tem q perguntar se ele quer o
// mais rápido e caro ou mais demorado e barato e tem q ter botão"). Aqui o trade-off é
// preço × DATA — o anúncio publica data, não minutos —, e o número que decide é o TOTAL,
// não o frete solto: é o que vai sair da conta do cliente. Os botões vão junto no canal
// Meta; esta lista numerada é o fallback (e o que o cliente lê pra comparar).
export function shippingSpeedChoice(
  barato: { total: number; estimate?: string },
  rapido: { total: number; estimate?: string }
): string {
  const quando = (estimate?: string) => (estimate ? `chega até ${estimate}` : "sem data publicada");
  return [
    "Tem duas formas de entrega. Qual você prefere?",
    `*1)* Mais barata — ${brl(barato.total)} · ${quando(barato.estimate)}`,
    `*2)* Mais rápida — ${brl(rapido.total)} · ${quando(rapido.estimate)}`,
    "",
    "Toca no botão ou responde *1* ou *2*."
  ].join("\n");
}

export function freteChoice(barato?: { fee: number; etaMinutes: number }, rapido?: { fee: number; etaMinutes: number }): string {
  const lines = ["Como prefere a entrega?"];
  if (barato) lines.push(`*1)* Mais barata — ${brl(barato.fee)} · ~${barato.etaMinutes} min`);
  if (rapido) lines.push(`*2)* Mais rápida — ${brl(rapido.fee)} · ~${rapido.etaMinutes} min`);
  lines.push("", "Responde *1* ou *2*.");
  return lines.join("\n");
}

// ---------- payment ----------

export function paymentMethod(totalPix: number, totalCard: number): string {
  return [
    "Como prefere pagar?",
    `*1)* Pix — ${brl(totalPix)} _(sem taxa)_`,
    `*2)* Cartão — ${brl(totalCard)} _(com taxa da maquininha)_`,
    "",
    "Responde *pix* ou *cartão*."
  ].join("\n");
}

// O CÓDIGO vai numa mensagem SEPARADA (enviada logo após esta): no WhatsApp o cliente
// copia a mensagem inteira — se tiver prosa junto, o Pix não cola no banco.
export function pixInstructions(total: number, mock: boolean): string {
  return [
    `Total *${brl(total)}* no Pix.`,
    "",
    "O código vem na próxima mensagem — copia ela inteira e cola no *Pix copia e cola* do seu banco 👇",
    "",
    mock ? sandboxHint() : "Assim que cair, eu começo a separar."
  ].join("\n");
}

export function cardInstructions(total: number, link: string, mock: boolean): string {
  return [
    `Total *${brl(total)}* no cartão _(taxa da maquininha incluída)_.`,
    "",
    "Paga por este link 👇",
    link,
    "",
    mock ? sandboxHint() : "Assim que aprovar, eu começo a separar."
  ].join("\n");
}

// First card only: the fields are tokenized by Pagar.me in the customer's browser.
// Reorders never use this link; they use WhatsApp's native payment confirmation.
export function cardEnrollmentInstructions(total: number, link: string, mock: boolean): string {
  return [
    `Total *${brl(total)}* no cartão _(taxa da maquininha incluída)_.`,
    "",
    "Na primeira compra você cadastra o cartão neste link seguro. Nas próximas, confirma aqui mesmo 👇",
    link,
    "",
    mock ? sandboxHint() : "_Eu não recebo o número nem o CVV do seu cartão._"
  ].join("\n");
}

export function cardPaymentProcessing(): string {
  return "Pagamento em processamento. Te aviso assim que confirmar.";
}

// Body rendered inside Meta's native order_details payment bubble. The card number
// is never sent or stored here; WhatsApp only shows the last four digits we supply.
export function orderDetailsBody(total: number, last4: string): string {
  return `Seu pedido: *${brl(total)}*. Toque em *Revisar e pagar* pra cobrar no cartão final *${last4}*.`;
}

// Fallback em texto quando os botões interativos não estão disponíveis (provider de
// teste). Aceita as formas humanas que o parser entende: "usar cartão" / "outro cartão".
export function savedCardOffer(total: number, last4: string): string {
  return [
    `Pagar *${brl(total)}* no cartão salvo final *${last4}*?`,
    "",
    "Responde *usar cartão*, ou *outro cartão* pra cadastrar outro."
  ].join("\n");
}

export function savedCardCharging(last4: string): string {
  return `Cobrando no cartão final *${last4}*. Te confirmo em instantes.`;
}

export function savedCardNothingPending(): string {
  return "Não tem cobrança em aberto. Responde *pagar* que eu gero uma nova.";
}

export function cardChargeFailed(last4: string): string {
  return `O cartão final *${last4}* não aprovou. Responde *pix*, ou *cartão* que eu mando um link novo.`;
}

export function cardAttemptExpired(): string {
  return "Essa cobrança venceu. Responde *pagar* que eu gero uma nova.";
}

export function paymentConfirmed(): string {
  return "✅ Pagamento confirmado. Já estou separando — te aviso quando sair pra entrega.";
}

export function paymentConfirmedSupplierCheck(): string {
  return "✅ Pagamento confirmado. Confirmando os itens na loja agora — te aviso quando avançar.";
}

export function supplierValidationStarted(): string {
  return "Confirmando itens, frete e prazo na loja. Te mostro o total final antes do pagamento.";
}

export function supplierValidationPending(): string {
  return "Ainda confirmando na loja. Não precisa pagar nada agora — te aviso quando estiver pronto.";
}

export function quoteExpired(): string {
  return "Essa cotação venceu. Monto uma nova antes de cobrar qualquer coisa.";
}

export function quoteValidFor(minutes: number): string {
  return `Cotação válida por ${minutes} min. Escolhe Pix ou cartão pra eu gerar o pagamento.`;
}

export function pixNotSeenYet(): string {
  return "O Pix ainda não caiu aqui. Assim que cair, te aviso na hora. Se passar de 5 min, me chama.";
}

export function cardPending(): string {
  return "Ainda não aprovou. Assim que confirmar, te aviso na hora.";
}

export function alreadyPaid(): string {
  return "✅ Seu pagamento já está confirmado. Pra acompanhar, responde *status*.";
}

// Intro do reenvio — o código em si vai na mensagem seguinte, sozinho (copiável).
export function resendPix(): string {
  return "Segue o código na próxima mensagem — copia ela inteira e cola no *Pix copia e cola* 👇";
}

export function resendCard(link: string): string {
  return ["Seu link de pagamento 👇", link].join("\n");
}

export function paymentSwitched(method: "pix" | "card", total: number): string {
  return method === "pix"
    ? `Troquei pra Pix — total *${brl(total)}*, sem taxa. Segue o código 👇`
    : `Troquei pro cartão — total *${brl(total)}*, com taxa da maquininha. Segue o link 👇`;
}

// Mercado Pago fora do ar com credencial real: NUNCA cai num Pix de mentira. O pedido
// continua aguardando e o cliente tem uma saída clara — repetir a forma de pagamento.
// "nada foi cobrado" é a informação que tira o medo de pagar duas vezes.
export function paymentIssueFailed(): string {
  return "Não consegui gerar seu pagamento agora — nada foi cobrado. Responde *pix* ou *cartão* que eu tento de novo.";
}

export function sandboxHint(): string {
  return "_(sandbox: responda *paguei* pra simular)_";
}

// ---------- order lifecycle ----------

// O "Seu pedido" que abria as 14 variantes saiu: o `#id` em negrito já abre a linha e
// economiza uma linha inteira na tela do celular.
export function orderStatusLine(input: {
  shortId: string;
  status: string;
  trackingUrl?: string | null;
  etaMinutes?: number;
  itemsPreview?: string;
}): string {
  const id = `*#${input.shortId}*`;
  switch (input.status) {
    case "awaiting_operator_quote":
      return `${id} em cotação. Mando o total com a entrega pra você aprovar — nada é cobrado antes.`;
    case "awaiting_supplier_validation":
    case "payment_issuing":
      return `${id} em confirmação na loja. Te aviso quando o carrinho estiver pronto.`;
    case "awaiting_payment":
      return `${id} aguardando pagamento. Responde *pagar* que eu mando o código de novo.`;
    case "paid":
      return `${id} confirmado, separando os itens. Te aviso quando sair pra entrega.`;
    // Com link de acompanhamento (o operador cola o do próprio pedido na loja/ML ao marcar
    // a compra), o cliente vê o andamento na FONTE em vez de depender de a gente marcar
    // "saiu pra entrega" — nos pedidos que a loja entrega, o operador não sabe a hora
    // certa disso e o cliente ficava no escuro (dono, 17/08).
    case "retailer_preparing":
      return input.trackingUrl
        ? `${id} comprado, a loja está preparando 📦\nAcompanha: ${input.trackingUrl}`
        : `${id} comprado, a loja está preparando. Te aviso quando sair pra entrega.`;
    case "retailer_out_for_delivery":
      return `${id} saiu pra entrega pela loja 🚚${input.trackingUrl ? `\nAcompanha: ${input.trackingUrl}` : ""}`;
    case "operator_buying":
      return input.trackingUrl
        ? `${id} comprado e em preparação 📦\nAcompanha: ${input.trackingUrl}`
        : `${id} comprado e em preparação. Te aviso quando sair pra entrega.`;
    case "ready_for_pickup":
      return `${id} pronto pra retirada.`;
    case "dispatched":
      return `${id} saiu pra entrega 🛵${input.trackingUrl ? `\nAcompanha: ${input.trackingUrl}` : ""}`;
    case "delivered":
      return `${id} entregue ✅ Precisando de algo, é só chamar.`;
    case "refund_pending":
      return `${id} cancelado. O estorno ainda está pendente — te aviso quando concluir.`;
    case "refunded":
      return `${id} cancelado e estornado ✅`;
    case "canceled":
      return `${id} cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?`;
    default:
      return `${id} em andamento. Qualquer novidade eu aviso.`;
  }
}

export function noOrdersYet(): string {
  return "Você ainda não tem pedidos. Me diz o que precisa que eu monto o primeiro.";
}

export function canceledUnpaid(): string {
  return "Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.";
}

// Mesma regra em três entradas diferentes (pedido pago, "cancelar" tarde demais e a
// pergunta "como cancelo?") — o texto é um só, de propósito.
const NO_CANCEL_AFTER_PAYMENT =
  "Depois do pagamento não dá pra cancelar. Se faltar item, estorno o valor dele; se atrasar, eu aviso.";

export function cancelRequestedPaid(): string {
  return NO_CANCEL_AFTER_PAYMENT;
}

export function cancelTooLate(): string {
  return NO_CANCEL_AFTER_PAYMENT;
}

export function nothingToCancel(): string {
  return "Não tem pedido em andamento pra cancelar. Quer começar um novo?";
}

export function noPreviousOrder(): string {
  return "Você ainda não tem um pedido pra repetir. Me diz o que quer que eu monto.";
}

export function dispatched(trackingUrl?: string | null): string {
  return `🛵 Saiu pra entrega. Te aviso quando chegar.${trackingUrl ? `\nAcompanha: ${trackingUrl}` : ""}`;
}

export function retailerOutForDelivery(trackingUrl?: string | null): string {
  return `🚚 Seu pedido saiu pra entrega. Te aviso quando chegar.${trackingUrl ? `\nAcompanha: ${trackingUrl}` : ""}`;
}

export function delivered(): string {
  return "Entregue ✅ Da próxima, é só mandar *repete o de sempre*.";
}

export function refundRequested(): string {
  return "Estorno solicitado. Te aviso quando for confirmado.";
}

export function refundConfirmed(): string {
  return "✅ Estorno confirmado. Qualquer dúvida sobre o prazo do banco, me chama.";
}

export function finishChoiceFirst(): string {
  return "Confirma esse item primeiro que aí eu fecho.";
}

// "coca" com Fanta+2 Cocas na mesa → estreitou pras que batem.
export function narrowedChoices(query: string): string {
  return `Ficou entre essas de *${query}*:`;
}

// "só isso"/"fechado" quando o pedido já está fechado e só falta a forma de pagamento —
// nunca responder "não peguei qual você quer" (copy de escolha de produto).
export function donePickPayment(): string {
  return "Pedido completo. Escolhe abaixo como quer pagar.";
}

// "algum até X reais?" e nenhuma das opções na mesa cabe no teto.
export function nonePriceCap(cap: number): string {
  return `Nenhuma dessas sai por até ${brl(cap)}. Responde *mais barato* ou *mais opções*.`;
}

// Item novo anotado ENQUANTO o cliente ainda escolhe outro — sem isto o item entra
// mudo na fila e o cliente acha que a Lia ignorou.
export function queuedItemsNote(queries: string[]): string {
  return `Anotei ${queries.map((q) => `*${q}*`).join(", ")} — a gente escolhe em seguida.`;
}

// "vai mudar o frete?" com pedido já cotado → o número real, não a explicação genérica.
export function currentFee(fee: number): string {
  return `A entrega do seu pedido está em *${brl(fee)}*. Se mudar endereço ou cesta, eu recalculo.`;
}

// "quanto deu?" com cobrança aberta → total fechado + caminho pro código.
export function totalAwaitingPayment(total: number): string {
  return `Total: *${brl(total)}* — só falta pagar. Responde *pix* ou *cartão* que eu mando de novo.`;
}

// "quanto deu tudo?" no meio das escolhas/coleta → parcial honesto, sem inventar frete.
export function partialTotal(items: CopyBasketItem[], produtos: number, pendingCount: number): string {
  if (!items.length) {
    return "Nenhum item fechado ainda. Responde as opções que eu mando o total.";
  }
  const lines = items.map((item) => `• ${item.qty}x ${item.name} — ${brl(item.displayLineTotal)}`);
  const tail =
    pendingCount > 0
      ? `_${pendingCount === 1 ? "Falta 1 item" : `Faltam ${pendingCount} itens`} pra escolher. Aí sai o total com a entrega._`
      : '_Diz *"só isso"* que eu mando o total com a entrega._';
  return ["🛒 *Até agora:*", ...lines, "", `Produtos: ${brl(produtos)}`, tail].join("\n");
}

// ---------- concierge manual (largura + cotação do operador) ----------

// Regra do dono (11/08): "se não tem, fala que não tem" — item sem preço nas 18 lojas
// NUNCA vira espera de cotação. A resposta é honesta, na hora, e convida a tentar de
// outro jeito (marca/versão) ou pedir outra coisa.
// Recusa quando OUTRAS linhas da mesma mensagem acharam opções (elas vêm logo abaixo):
// escopo explícito pra não ler como recusa do pedido inteiro (teste real 19/08: "sacola
// eu não consigo trazer" seguido de cards de mochila pareceu contradição).
export function itemsNotAvailableWithOptions(items: string[]): string {
  if (items.length === 1) {
    return `*${items[0]}* eu não achei — o resto achei e tá logo abaixo.`;
  }
  return [`Esses eu não achei: ${items.join(", ")}.`, "O resto achei e tá logo abaixo."].join("\n");
}

export function itemsNotAvailable(items: string[]): string {
  if (items.length === 1) {
    return `*${items[0]}* eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.`;
  }
  return [
    "Esses eu não consigo trazer hoje:",
    ...items.map((i) => `• ${i}`),
    "",
    "Me diz outras marcas ou versões que eu tento de novo."
  ].join("\n");
}

// Depois de escolher as opções: a lista continua aberta (diferente do fluxo legado, onde
// escolher já ia direto pra cotação).
export function conciergeKeepAdding(): string {
  return 'Quer mais alguma coisa? Quando fechar, diz *"só isso"* que eu mando o total.';
}

export function conciergeAskWhatYouWant(): string {
  return "Me diz o que você precisa.";
}

// "só isso" no concierge: o pedido foi para a fila de cotação do operador. A Lia NÃO
// mostra um total inventado — ela volta com o valor real depois de cotar.
export function operatorQuoteRequested(items: string[]): string {
  const list = items.length ? `\n${items.map((i) => `• ${i}`).join("\n")}\n` : " ";
  return [
    `Recebi seu pedido:${list}`,
    "Um dos itens precisa de conferência na loja, então o total não sai automático. Mando preço, entrega e prazo em instantes pra você aprovar — nada é cobrado antes disso."
  ].join("\n");
}

// Cliente escreve enquanto o operador ainda está cotando.
export function operatorQuoteStillWorking(): string {
  return "Ainda estou cotando. Mando o total com entrega e prazo em instantes.";
}

// Corpo da confirmação pós-escolha quando os BOTÕES (Pagar / Adicionar mais itens /
// Cancelar) vão junto — o texto não repete o que os botões já dizem. O fallback sem
// botões continua sendo conciergeKeepAdding().
export function conciergeChooseNext(): string {
  return "Escolhe aí embaixo — ou manda o próximo item direto.";
}

// Item pedido ENQUANTO a cotação do operador está em andamento: entra no mesmo pedido
// (a cotação ainda não saiu), nunca é engolido nem exige cancelar pra pedir de novo.
export function addedToPendingQuote(items: string[]): string {
  const list = items.map((i) => `• ${i}`).join("\n");
  return [`Incluí na cotação:\n${list}`, "", "Mando o total com tudo junto em instantes."].join("\n");
}

// Resumo da cotação manual: itens por nome (o operador informa o custo total dos
// produtos e o frete), com prazo/entrega e endereço. É o gêmeo de `summary` para o
// fluxo concierge, onde não há preço por linha.
export function manualQuoteSummary(input: {
  items: { qty: number; name: string }[];
  produtos: number;
  frete: number;
  deliveryPromise?: string;
  etaMinutes?: number;
  total: number;
  deliveryAddress?: string;
  sameHour?: boolean;
  // true = a mensagem sai com o botão "Trocar endereço" (dono, 11/08: ação em botão,
  // não instrução de digitar) — a dica de texto some porque o botão fala por ela.
  addressButton?: boolean;
}): string {
  const lines = input.items.map((item) => `• ${item.qty}x ${item.name}`);
  const out = [
    "🛒 *Seu pedido:*",
    ...lines,
    "",
    `Produtos: ${brl(input.produtos)}`,
    deliveryLine(input.frete, input.deliveryPromise, input.etaMinutes),
    `*Total: ${brl(input.total)}*`
  ];
  if (input.deliveryAddress) {
    out.push("", `📍 ${input.deliveryAddress}`);
    if (!input.addressButton) out.push('_Pra mudar, diz "trocar endereço"._');
  }
  out.push("", "Escolhe abaixo como quer pagar.");
  return out.join("\n");
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
        ? `Atendo ${areaLabel} 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.`
        : `Atendo ${areaLabel} 📍 Me manda seu *CEP* que eu confirmo se chego até você.`;
    case "fee":
      if (ctx?.hasBasket)
        return "O frete depende da distância até você 🛵 Te mostro o valor exato junto com o total quando fechar a cesta.";
      if (ctx?.hasCep)
        return "O frete depende da distância até você 🛵 Me diz o que precisa que eu mando o total exato.";
      return "O frete depende da distância até você 🛵 Me diz o que precisa e seu CEP que eu mando o total exato.";
    case "eta":
      // NÃO prometer same-day: o prazo é do checkout da loja e varia por item/endereço.
      return "O prazo depende da loja e do seu endereço — tem item que chega em horas, tem item que leva alguns dias. Me diz o que você precisa que eu mostro o prazo exato junto com o total, antes de você pagar.";
    case "payment":
      return "*Pix* (sem taxa) ou *cartão* (link seguro) — tudo aqui pelo chat. Vale-refeição ainda não aceito.";
    default:
      return "Eu compro o que você precisar e entrego no seu endereço. Você paga por Pix ou cartão aqui no chat, e eu mostro o prazo antes. O que você precisa?";
  }
}

export function humanHandoff(): string {
  return "Chamei alguém da equipe — pode escrever aqui mesmo que a mensagem chega. Se for sobre um pedido, responde *status* que eu já adianto.";
}

export function complaintAck(): string {
  return "Sinto muito. Já passei pra equipe. Se faltou item, estorno o valor dele; se atrasou, eu aviso.";
}

export function cancelHowTo(hasPaidOrder: boolean): string {
  return hasPaidOrder
    ? NO_CANCEL_AFTER_PAYMENT
    : "Antes de pagar, você pode limpar a lista quando quiser. Depois do pagamento não dá pra cancelar.";
}

export function cartExpired(): string {
  return "_Sua lista anterior expirou — comecei uma nova. Seu endereço continua salvo._";
}

export function orderReopened(): string {
  return "Atualizei seu pedido. O total anterior não vale mais — segue o novo 👇";
}

export function greetingMidOrder(step: string, itemCount: number): string {
  if (step === "awaiting_payment") return "Oi! Seu pedido só falta pagar. Responde *pagar* que eu mando o código.";
  if (itemCount > 0)
    return `Oi! Sua cesta tem ${itemCount} ${itemCount === 1 ? "item" : "itens"}. Manda mais algum, ou responde *pagar* pra fechar.`;
  return "Oi! O que você precisa hoje?";
}

export function genericError(): string {
  return "Deu um erro aqui. Manda de novo em instantes?";
}

// ---------- alertas ao OPERADOR (LIA_OPERATOR_PHONE — não são mensagens de cliente) ----------
// Caso real 11/08: pedido ficou 2 dias em cotação manual porque nada avisava o operador;
// pro cliente, o "te mando em instantes" virou nunca. O alerta é o que fecha esse ciclo.
// Estes NÃO seguem a régua de tom do cliente — são operacionais, densos de propósito.

export function operatorQuoteAlert(shortId: string, items: string[]): string {
  return [`🛎️ [operador] Pedido #${shortId} aguardando SUA cotação no /ops:`, ...items.map((i) => `• ${i}`)].join("\n");
}

export function operatorItemAddedAlert(shortId: string, items: string[]): string {
  return `➕ [operador] Pedido #${shortId} ganhou item durante a cotação: ${items.join(", ")}`;
}

// Falha ao emitir a cobrança (Mercado Pago fora do ar) com credencial real: o cliente
// ficou sem Pix/link e o pedido parado. O operador precisa saber NA HORA — é dinheiro
// que não entrou por falha nossa, não por desistência.
export function operatorPaymentFailedAlert(shortId: string, detail: string): string {
  return `🚨 [operador] Pedido #${shortId}: o Mercado Pago falhou ao gerar a cobrança (${detail}). Cliente avisado, pedido aguardando — confira no /ops.`;
}

export function operatorPaidAlert(shortId: string, total: number): string {
  return `💰 [operador] Pedido #${shortId} PAGO (${brl(total)}) — hora de comprar e acionar a entrega. Detalhes no /ops.`;
}

// Cotação abandonada (1h+ sem resposta antes do total sair) expirou sozinha na volta do
// cliente: transparência curta — nada foi cobrado — e convite a recomeçar. A mensagem
// nova dele é processada normalmente logo em seguida.
export function staleQuoteRestart(shortId: string): string {
  return `Cancelei o pedido *#${shortId}* por inatividade — nada foi cobrado. Bora recomeçar.`;
}

// Trocar endereço com cotação na mesa: o frete foi calculado pro endereço antigo, então
// a cotação cai e a Lia recota depois do endereço novo. Nada foi cobrado.
export function quoteDroppedForNewAddress(): string {
  return "Cancelei a cotação anterior — nada foi cobrado. Já refaço com o endereço novo 📍";
}

// Trocar endereço com Pix/cartão já emitidos: a cobrança vale um total calculado com
// OUTRO frete — o caminho seguro é cancelar (nada foi pago) e refazer.
export function addressChangeNeedsCancel(): string {
  return "O pagamento já foi gerado pro endereço antigo. Responde *cancelar* (nada foi cobrado) que eu refaço com o novo.";
}

// Endereço trocado com o pedido ainda na fila de cotação: o pedido sobrevive.
export function addressUpdatedQuoteContinues(address: string): string {
  return `📍 Endereço atualizado: ${address}\nSua cotação continua valendo — o total já sai pro endereço novo.`;
}

export function operatorAddressChangedAlert(shortId: string, address: string): string {
  return `📍 [operador] Pedido #${shortId} trocou de endereço ANTES da cotação: ${address}. Cote com o frete do endereço novo.`;
}

// "mais três do mesmo": o último item da cesta cresce pelo sku — confirmação com o
// total de unidades pra não sobrar dúvida de que é o MESMO produto.
export function moreOfSameAdded(added: number, name: string, totalQty: number): string {
  return `✅ Agora são ${totalQty}x ${name}. Quer mais alguma coisa? Quando fechar, diz *"só isso"*.`;
}

// Número solto logo após um item entrar na cesta = ajuste de quantidade do último item.
// O "Ajustei" fica: sem ele a mensagem vira sósia do `choiceConfirmed` ("✅ 5x Bombom") e o
// cliente não distingue CORREÇÃO de item novo — encurtar não pode custar o sentido.
export function qtyAdjusted(qty: number, name: string): string {
  return `✅ Ajustei: ${qty}x ${name}. Quer mais alguma coisa? Quando fechar, diz *"só isso"*.`;
}

// Toque em "Outra quantidade": pergunta aberta — o número vem digitado no chat.
export function quantityAskFree(name: string): string {
  return `Quantas unidades de *${name}*? (de 1 a 50)`;
}

// Busca que passou de ~2,5s: o cliente precisa saber que a Lia está trabalhando —
// silêncio de 25s parece travamento. Curta e SEM expor a mecânica interna (feedback do
// dono, 17/08: "essa msg de procurei nas lojas parceiras e não achei é péssima, só
// deixa procurando"). O cliente não quer saber quantos fornecedores existem.
// Watchdog do turno (19/08: busca morreu no teto da função e o cliente ficou no
// silêncio absoluto). Honesto, sem prazo e sem mecânica; se as opções chegarem logo
// depois, a sequência continua fazendo sentido.
export function turnStillWorking(): string {
  return "Ainda procurando — já te respondo.";
}

export function searchingWider(): string {
  return "🔎 Procurando as melhores opções…";
}
