// Pure NLU layer for the Lia WhatsApp conversation: normalization, intent
// detection and reply parsing. NO imports of prisma/adapters so every rule here
// is unit-testable without a database. The delivery-service consumes this and
// decides what each intent means given the conversation step.

// qtyExplicit: o cliente DISSE a quantidade ("uma coca", "2 leites") — o fluxo não
// deve re-perguntar "quantas unidades?" depois da escolha. Ausente = qty implícito.
export type ParsedLine = { phrase: string; qty: number; qtyExplicit?: boolean; cap?: number };

export type Intent =
  | { kind: "thanks" }
  | { kind: "greeting" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "paid_claim" }
  | { kind: "clear_cart" }
  | { kind: "change_address" }
  // "Vc salvou o endereço?"/"pegou meu cep?" — pergunta sobre o endereço em arquivo:
  // responde com o endereço salvo, nunca vira busca (teste real 24/08: virou busca e a
  // recusa "não consigo trazer *Vc salvou o endereço já*" saiu pro cliente).
  | { kind: "address_question" }
  // "quanto falta?"/"o que posso pedir pra completar?" — pergunta sobre o que falta pro
  // fechamento (pedido mínimo), nunca busca (teste real 24/08: virou busca e beco).
  | { kind: "missing_question" }
  | { kind: "haggle" }
  // rest = o que sobrou da mensagem além do CEP ("meu cep é 01310-100, quero arroz e leite")
  | { kind: "cep"; cep: string; bare: boolean; rest?: string }
  | { kind: "repeat_last" }
  | { kind: "swap_item"; from: string; to: string; attr?: boolean }
  // andAdd = item a ADICIONAR numa multi-intenção ("tira o arroz e coloca feijão")
  | { kind: "remove_item"; target: string; andAdd?: string }
  | { kind: "pay"; method?: "pix" | "card" }
  | { kind: "cancel"; explicitOrder?: boolean }
  | { kind: "choose_payment"; method: "pix" | "card" }
  | { kind: "affirm" }
  | { kind: "reject" }
  // Toque num botão "Escolher esse" FORA de uma escolha ativa: é um botão de mensagem
  // antiga — resposta específica, nunca "não entendi" (rodada 27/08 S1).
  | { kind: "stale_option_tap"; sku: string }
  // "Outras opções" (botão ou texto) fora da escolha ativa; cheaper=true quando o
  // cliente pediu "mais barato" seco — reabre a última escolha ordenada por preço.
  | { kind: "more_options"; cheaper?: boolean }
  // "só isso", "mais nada", "é só" — fechar a lista e seguir pro total.
  | { kind: "done" }
  // Pergunta operacional (frete/prazo/área/pagamento) — responder com copy, nunca buscar produto.
  | { kind: "service_question"; topic: "area" | "fee" | "eta" | "payment" | "generic" }
  // "posso cancelar?" — pergunta sobre cancelar; explicar, não executar.
  | { kind: "cancel_question" }
  // "não recebi o código", "o pix expirou", "manda de novo" — reemitir cobrança.
  | { kind: "resend_code"; expired: boolean }
  // "quero mudar a forma de pagamento" (sem dizer qual).
  | { kind: "switch_payment" }
  // "quero falar com um atendente/humano".
  | { kind: "human" }
  // "veio errado", "faltou item", "produto estragado" — reclamação pós-pedido.
  | { kind: "complaint" }
  // "quero" / "queria comprar" / "quero fazer um pedido" SEM dizer o quê — perguntar
  // o item com carinho, nunca "não entendi seu pedido" nem disparar busca.
  | { kind: "want_items" }
  | { kind: "number"; value: number }
  // "mais três do mesmo bombom" / "mais 2 iguais" — repetir o ÚLTIMO item da cesta,
  // resolvido por sku (nunca nova busca, que podia trazer outra marca — rodada 13).
  | { kind: "add_more_same"; qty: number; noun?: string }
  // Cartão salvo (modo sem Meta Payments): toque no botão "Pagar •••• 1234" volta como
  // id `cardpay:<attemptId>`; o texto humano equivalente vem sem o id. "Outro cartão"
  // troca a credencial (novo link de cadastro).
  | { kind: "saved_card_pay"; attemptId?: string }
  | { kind: "saved_card_other" }
  | { kind: "free_text" };

export function normalizeMsg(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- CEP ----------

export function extractCep(text: string): string | undefined {
  const m = normalizeMsg(text).match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : undefined;
}

// "01310-100", "cep 01310100", "meu cep e 01310-100" — nothing else in the message.
export function isBareCep(text: string): boolean {
  const n = normalizeMsg(text).replace(/\b(meu|o|cep|e|eh|é|:|novo)\b/g, " ").replace(/\s+/g, " ").trim();
  return /^\d{5}-?\d{3}$/.test(n);
}

// ---------- deterministic basket line splitter (fallback when OpenAI is off) ----------

// Quantidades por extenso ("dois pães", "meia dúzia de ovo").
const WORD_QTY: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, duzia: 12
};
// Teto de sanidade: "999 cocas" é typo/abuso, não pedido — o total iria direto pro Pix.
const MAX_QTY = 50;

// WhatsApp real vem cheio de abreviações. Expandir só as formas inequívocas antes
// de separar a lista evita que "qro", "tb" e "pf" virem palavras do produto.
// Mantemos isto conservador: gíria ambígua não é alterada.
function expandShoppingShorthand(text: string): string {
  return text
    .replace(/\b(qro|qr|qero)\b/gi, "quero")
    .replace(/\b(qria|keria)\b/gi, "queria")
    .replace(/\b(pf|pff+|pf+v+r?|pfr|pls)\b/gi, "por favor")
    .replace(/\b(tb|tbm|tmb|tambem)\b/gi, "tambem")
    .replace(/\b(me ve|m ve)\b/gi, "me ve");
}

// Segmentos que são conversa, não produto ("bom dia", "por favor", "lista:").
const NOISE_SEGMENT_RE =
  /^(oi+( lia)?|ola+( lia)?|bom dia+|boa tarde+|boa noite+|tudo (bem|bom)|td bem|e ?ai|opa+|obrigad\w*|valeu|por favor|pfv*|pls|lista|segue( a lista)?|ai vai|entao|so isso|é so|e so|mais nada|nada mais|ta+|ta bom|bom|ok+|okay|blz|beleza+|show|top|firmeza|certo|entendi|pensando bem|mudei de ideia|na verdade|alias|deixa (pra la|quieto)|quer saber|(nao|n) sei( .*)?|o que .*)[\s:!.?]*$/;

// Restrição/complemento que NUNCA é produto (15 rodadas reais, 14/08): orçamento
// ("até uns 100 reais"), preferência vazia ("qualquer marca", "de preferência o mais
// barato"), condição ("se tiver") e urgência de entrega ("queria receber hoje se der").
// Sem este filtro, o merge com a IA "resgatava" esses segmentos como itens — nasceu a
// cesta de R$167 num pedido "até 100 reais" e o "não tenho como trazer: se tiver".
// O ORÇAMENTO não é jogado fora: vira teto de preço da linha anterior (parseBasketLines).
const MODIFIER_SEGMENT_RE = new RegExp(
  "^(" +
    [
      "(de )?(ate|abaixo de|menos de|no maximo|max(imo)?) ?(uns |umas )?(r\\$ ?)?\\d+([.,]\\d{1,2})? ?(reais|real|conto|contos|pila|pilas)?( cada( uma?)?| por unidade)?",
      "(uns|umas) \\d+([.,]\\d{1,2})? ?(reais|real|conto|contos|pila|pilas)( cada( uma?)?| por unidade)?",
      "(pode ser )?(de )?qualquer [a-z]+( uma?)?",
      "sem preferencia( de marca)?( nenhuma)?",
      "de preferencia .*",
      "(o |a )?mais barat[oa]( que tiver| possivel)?",
      "(bem )?barat[oa]s?( demais)?",
      "p(a)?ra ((o|a|um|uma) )?(domingo|segunda|terca|quarta|quinta|sexta|sabado|hoje|amanha|semana|festa|viagem|casa|churrasco|almoco|jantar|cafe da manha|lanche|feriado|natal|pascoa|aniversario)( .*)?",
      "((e )?(queria|quero|preciso)( de)? )?(algo|alguma coisa) (bem |mais )?(barat[oa]|simples|bo[am]|em conta)( possivel)?",
      "sem precisar( de)? .*",
      "se (tiver|der|for possivel|possivel|rolar|puder|achar|encontrar)( .*)?",
      "((e )?(se der[, ]*)?(queria|quero|preciso|gostaria de|da pra|pode)( me)? )?(receber|entregar?|chega(r|ndo)?|mandar|enviar)( ainda| ate| para| pra| em casa| o pedido)* (hoje|amanha|rapido|logo)( se der| se possivel| se rolar)?",
      "(hoje|amanha)",
      "p(a)?ra (hoje|amanha)( se der| se possivel)?",
      "o quanto antes",
      "urgente(mente)?",
      "(entrega|entregam|entregue|entregando) (hoje|amanha|rapida|rapido)( .*)?",
      // aposto classificador ("coisa simples de farmácia", "coisinhas básicas de
      // mercado") — descreve a LISTA, nunca é item (rodada 27/08 S20)
      "(umas? |so |apenas )?(coisa|coisinha)s? (simples|basica|rapida)s?( (de|do|da) [a-zà-ú]+)?",
      "(fazer )?(a |as |uma )?compras? (da semana|do mes|de casa)( .*)?"
    ].join("|") +
    ")$"
);

// Oração NARRATIVA ("meu neto vem sábado", "vou receber a família", "que não seja
// muito caro"): contexto sobre pessoas/planos/preferências, nunca item de compra.
// Sem este filtro, o resgate do merge com a IA re-promovia a narrativa a produto e a
// Lia ecoava a frase inteira como não-achado (rodada 27/08 S3/S13/S20).
const NARRATIVE_SEGMENT_RE = new RegExp(
  "^(" +
    [
      "(eu |a gente |nos )?(meu|minha|meus|minhas) [a-zà-ú]+( [a-zà-ú]+)? (que )?(vem|veio|vai|vao|chega|volta|pediu|pedia|falou|disse|gosta|adora|mora|visita|completa|faz)\\b.*",
      "(eu )?(vou|vamos) (receber|fazer|dar|ter|visitar|viajar|arrumar|deixar)\\b.*",
      "(eu )?(quero |queria |gostaria de )?(deixar|arrumar) (meu|minha|o|a)\\b.*",
      "que (nao )?(seja|fique|custe|passe|pese|demore)\\b.*",
      "(porque|pois|ja que) .*",
      // AUTO-APRESENTAÇÃO ("seu Jorge aqui", "aqui é a Marlene", "sou o Pedro"):
      // o nome do cliente NUNCA é item — na rodada 3 virou busca de imagem de São
      // Jorge três vezes (S6/S13/S19).
      "(o |a )?(seu|dona|sr|sra|dr|dra|doutora?)\\.? [a-zà-ú]+ (aqui|falando|na linha)( .*)?",
      "aqui (e|eh|quem fala e|quem ta e) (o |a |seu |dona )?[a-zà-ú]+",
      "(sou|me chamo) (o |a |seu |dona )?[a-zà-ú]+",
      "meu nome (e|eh) [a-zà-ú]+( [a-zà-ú]+)?"
    ].join("|") +
    ")$"
);

export function isNarrativeSegment(phrase: string): boolean {
  return NARRATIVE_SEGMENT_RE.test(normalizeMsg(phrase));
}

// Desabafo sobre o próprio estado ("to com dor de cabeça", "estou gripada", "to com
// fome") — conversa, nunca item de compra. "to sem X" NÃO entra aqui: é pedido de X.
const STATE_SEGMENT_RE =
  /^(eu )?(to|tou|estou|ando) ((com|meio|toda?|todo) )?(dor(es)?|febre|fome|sede|gripe|enxaqueca|preguica|pressa|frio|calor|sono|correria|doente|gripad\w*|resfriad\w*|cansad\w*|exaust\w*|passando mal|mal|pessim\w*|apertad\w*|atrasad\w*)\b/;

// Uma frase inteira é só restrição/contexto ("Para uma viagem", "qualquer marca")?
// Usado também para FILTRAR itens vindos da extração por IA — o determinístico já
// descarta, mas a IA às vezes devolve o contexto como item (6º ciclo, rodada 1).
export function isRequestModifier(phrase: string): boolean {
  return MODIFIER_SEGMENT_RE.test(normalizeMsg(phrase));
}

// Urgência de ENTREGA na mensagem ("preciso pra hoje", "urgente", "o quanto antes").
// Não muda a busca nem a resposta ao cliente: vira a tag "⚡ URGENTE" no pedido, pro
// operador escolher o canal na cotação (Rappi/retirada agora vs. ML/dia seguinte).
// "rapido" solto NÃO conta — "carregador rápido"/"carga rápida" é atributo de produto;
// só vale atrelado a um verbo de entrega ("chegar rápido") ou como "entrega rápida".
const URGENCY_RE = new RegExp(
  "\\b(" +
    [
      "urgente(mente)?",
      "urgencia",
      "o quanto antes",
      "(pra|para) (hoje|agora|ja)",
      "ainda hoje",
      "hoje sem falta",
      "(preciso|quero|queria) (disso |dele |dela )?(hoje|agora)",
      "(receber|chega\\w*|entrega\\w*|mandar?|enviar?)( [a-z0-9]+){0,3} (hoje|agora|rapido|rapidinho)",
      "entrega (rapida|expressa|imediata)",
      "(to|tou|estou) com (muita )?pressa",
      "o mais rapido possivel"
    ].join("|") +
    ")\\b"
);
export function hasUrgencySignal(text: string): boolean {
  return URGENCY_RE.test(normalizeMsg(text));
}

export function parseBasketLines(text: string): ParsedLine[] {
  let source = expandShoppingShorthand(text);
  // Lista enumerada ("1 arroz\n2 feijão\n3 óleo"): índices sequenciais a partir de 1 em
  // 3+ linhas são NUMERAÇÃO, não quantidade — remove os índices antes de parsear.
  const lines = source.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    const idx = lines.map((l) => l.match(/^(\d{1,2})[\s.)\-]+\S/)?.[1]);
    const sequential = idx.every((v, i) => v !== undefined && Number(v) === i + 1);
    if (sequential) source = lines.map((l) => l.replace(/^\d{1,2}[\s.)\-]+/, "")).join("\n");
  }

  // Introdução com dois-pontos ("oi! preciso de umas coisas pra casa: X, Y") — o que
  // vem antes do ":" é conversa quando tem cara de pedido/lista; só os itens ficam.
  source = source
    .split("\n")
    .map((l) => l.replace(/^[^:\n]*\b(preciso|precisava|quero|queria|lista|coisas|compras?|mercado|casa|segue|anota|manda|ve)\b[^:\n]*:\s*/i, ""))
    .join("\n");

  const parsedLines = source
    .replace(/\bvou querer\b|\bquero\b|\bqueria\b|\bme manda\b|\bme ve\b|\bmanda\b|\b(?:preciso|presiso)(?: de| d)?\b|\bpode ser\b|\bcoloca\b|\bpoe\b|\bbota\b|\btraz\b|\badiciona\b|\binclui\b|\bcompra\b|\btambem\b|\btbm?\b|\bpor favor\b/gi, "")
    // protege decimais ("1,5l" / "1.5l") do split por vírgula/ponto
    .replace(/(\d),(\d)/g, "$1§$2")
    .replace(/(\d)\.(\d)/g, "$1¤$2")
    // ponto/interrogação separam sentenças ("sabao em po. ah e um refri" = 2 segmentos)
    .split(/[,\n;.?]|\s+e\s+|\s*\+\s*/i)
    .map((raw) =>
      raw
        .replace(/§/g, ",")
        .replace(/¤/g, ".")
        .trim()
        .replace(/^((oi+|ola+|opa+|bom dia|boa tarde|boa noite|e ?ai)( lia)?[\s,!.?]*)+/i, "")
        .replace(/^(tudo (bem|bom)|td bem|como vai)[\s,!.?]*/i, "")
        .replace(/^(ah+|hm+|hmm+|dai|tipo|ne|entao|ok+|okay|blz|beleza|ta|certo)\s+/i, "")
        // sujeito-parente ("meu neto quer um violão", "minha filha pediu suco"): o
        // pedido é o OBJETO — o parente sai, o produto fica (27/08 r3 S15: a query
        // virou "meu neto quer um violão" inteira). ANTES do vocativo, que comeria só
        // o "minha filha" e deixaria o verbo órfão na frase.
        .replace(
          /^(?:meu|minha)\s+(?:net[oa]|netinh[oa]|filh[oa]|filhinh[oa]|esposa?|marido|m[aã]e|pai|irm[aã]o?|sogr[oa]|av[oó]|v[oó]|sobrinh[oa]|cunhad[oa]|nora|genro|mulher|namorad[oa]|nen[eê]m?|beb[eê])\s+(?:que\s+)?(?:quer|queria|pediu|precisa(?:va)?(?:\s+de)?|ta\s+precisando\s+de|esta\s+precisando\s+de|anda\s+pedindo|adora|ama)\s+(?:de\s+)?/i,
          ""
        )
        // vocativo ("minha filha, quero…", "amiga, me vê…", "lia,…") não é produto
        .replace(/^((minha|meu)\s+(filha?|filho|querid[ao]|amor|anjo|bem)|querid[ao]|amig[ao]|amigona|mo[cç][ao]|lia)[\s,!.]+/i, "")
        // conjunção sobrando no começo do segmento ("e areia pro gato", "mais um refri",
        // "mas entrega hoje se der" — a adversativa escondia o modificador de urgência)
        .replace(/^(e|mais|mas|porem|porém|so que|só que|com)\s+/i, "")
        // "to sem café" é jeito real de PEDIR café — o item é o que falta
        .replace(/^(?:eu\s+)?(?:t[oô]|tou|estou)\s+sem\s+/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(
      (raw) =>
        raw.length > 1 &&
        !NOISE_SEGMENT_RE.test(normalizeMsg(raw)) &&
        !STATE_SEGMENT_RE.test(normalizeMsg(raw)) &&
        !NARRATIVE_SEGMENT_RE.test(normalizeMsg(raw)) &&
        !/^(ah+|hm+|hmm+|aa+|eh+|dai|tipo|ne|iss[oa]( ai)?|aquilo( ali)?|esses? ai|essas? ai)$/i.test(normalizeMsg(raw))
    )
    .map((raw) => {
      // Peso/volume NÃO é quantidade: "2kg de arroz" = 1× "arroz 2kg" (o tamanho vai pro
      // nome e o matcher casa por atributo); "1,5l de leite" idem.
      const weight = raw.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|lt|litros?)\s+(?:de\s+)?(.+)$/i);
      if (weight) return { phrase: `${weight[3].trim()} ${weight[1]}${weight[2].toLowerCase()}`, qty: 1 };

      const m = raw.match(/^(\d+)\s*(?:x|un|unidades?)?\s+(.*)$/i);
      if (m) return { phrase: m[2].trim(), qty: Math.min(MAX_QTY, Math.max(1, Number(m[1]))), qtyExplicit: true };

      // "dois pães", "meia dúzia de ovo", "uma dúzia de banana"
      // ([\wà-ú]+) e não (\w+): "três" tem acento e \w é ASCII — sem isso "três
      // pacotes" não virava quantidade (re-teste 15/08, rodada 9).
      const word = raw.match(/^(?:(meia)\s+d[uú]zia|(uma\s+)?d[uú]zia|([\wà-ú]+))\s+(?:de\s+)?(.+)$/i);
      if (word) {
        const n = normalizeMsg(word[3] ?? "");
        if (word[1]) return { phrase: word[4].trim(), qty: 6, qtyExplicit: true };
        if (/d[uú]zia/i.test(raw) && !word[3]) return { phrase: word[4].trim(), qty: 12, qtyExplicit: true };
        if (n && WORD_QTY[n]) return { phrase: word[4].trim(), qty: WORD_QTY[n], qtyExplicit: true };
      }
      return { phrase: raw, qty: 1 };
    });

  // "ração pro meu dog, ele é filhote": cláusula com pronome DESCREVE o item anterior
  // (vira atributo do nome), nunca um item novo. Sem item anterior, descrição solta
  // não é produto.
  const merged: ParsedLine[] = [];
  for (const line of parsedLines) {
    const pron = line.phrase.match(/^(?:ele|ela)s?\s+(?:é|e|eh|sao|são|esta|está|ta|tá)\s+(?:um\s+|uma\s+)?(.+)$/i);
    if (pron) {
      const prev = merged[merged.length - 1];
      if (prev) prev.phrase = `${prev.phrase} ${pron[1].trim()}`.replace(/\s+/g, " ");
      continue;
    }
    // Adição RELATIVA dentro da MESMA mensagem: "…30 litros, qualquer marca; mais um
    // desses" e "leite sem lactose; mais dois leites" somam na linha ANTERIOR — nunca
    // viram linha nova nem "recomeço" (5º ciclo, rodadas 5 e 8). O "mais" já foi
    // limpo pelo map; sobra "um desses" / "dois leites".
    if (merged.length) {
      const prev = merged[merged.length - 1];
      const bareRef = /^(?:um |uma )?(?:desses?|dessas?|d[oa] mesm[oa]s?|iguais?)$/.test(normalizeMsg(line.phrase));
      const bareNoun =
        line.qtyExplicit && meaningfulProductTokens(line.phrase).length === 1 && sharesProductNoun(line.phrase, prev.phrase);
      if (bareRef || bareNoun) {
        prev.qty = Math.min(MAX_QTY, prev.qty + Math.max(1, line.qty));
        prev.qtyExplicit = true;
        continue;
      }
    }
    // Preferência NEGATIVA como segmento ("sem pimenta", "não veicular", "não quero
    // brinquedo barulhento", "não quero os muito amargos"): vira atributo "sem <alvo>"
    // do item ANTERIOR — o matcher já exclui por negação (negatedWords). Nunca vira
    // linha própria (3º ciclo de testes, 15/08: virava "não tenho como trazer").
    const negSeg = line.phrase.match(
      /^(?:mas\s+|porem\s+)?(?:sem|n(?:a|\u00e3)o(?:\s+(?:quero|gosto de|pode ser|precisa(?: de)?))?)\s+(?:de\s+)?(?:os\s+|as\s+|um\s+|uma\s+)?(?:muito\s+|tao\s+|t\u00e3o\s+)?(.{2,40})$/i
    );
    if (negSeg && merged.length) {
      const targetTokens = normalizeMsg(negSeg[1]).split(" ").filter(Boolean);
      const target = targetTokens[targetTokens.length - 1];
      if (target && target.length >= 3) {
        const prev = merged[merged.length - 1];
        prev.phrase = `${prev.phrase} sem ${target}`.replace(/\s+/g, " ");
        continue;
      }
    }
    // "ração para gato, TRÊS PACOTES": o segmento é só quantidade+embalagem — a
    // quantidade pertence ao item ANTERIOR, nunca vira "produto indisponível"
    // (re-teste 15/08, rodadas 7 e 9).
    if (
      line.qtyExplicit &&
      /^(?:de )?(pacotes?|caixas?|unidades?|garrafas?|latas?|potes?|rolos?|sacos?|pares?|frascos?|un)$/.test(normalizeMsg(line.phrase))
    ) {
      const prev = merged[merged.length - 1];
      if (prev && !prev.qtyExplicit) {
        prev.qty = line.qty;
        prev.qtyExplicit = true;
      }
      continue;
    }
    // Restrição solta nunca vira item; orçamento gruda como teto no item anterior
    // ("presente de aniversário, até uns 100 reais" → 1 item com cap de R$100).
    if (MODIFIER_SEGMENT_RE.test(normalizeMsg(line.phrase))) {
      const cap = parsePriceCap(line.phrase) ?? parsePriceCap(`até ${line.phrase}`);
      const prev = merged[merged.length - 1];
      if (cap != null && prev && parsePriceCap(prev.phrase) == null) {
        prev.phrase = `${prev.phrase} até ${cap} reais`;
      }
      continue;
    }
    merged.push(line);
  }
  return merged;
}

// Quantidade respondida no passo imediatamente posterior à escolha do produto.
// Aceita o jeito que as pessoas realmente escrevem: "2", "quero 2", "mais duas",
// "me vê 4". O contexto já diz que a mensagem é quantidade, então não precisamos
// obrigar a pessoa a usar um comando rígido.
export function parseContextualQuantity(text: string): number | null {
  const n = normalizeMsg(text)
    .replace(/[?!.,]/g, " ")
    .replace(/\b(qro|qr|qero)\b/g, "quero")
    .replace(/\s+/g, " ")
    .trim();
  const button = n.match(/^qty:(\d{1,2})$/)?.[1];
  if (button) {
    const qty = Number(button);
    return qty >= 1 && qty <= MAX_QTY ? qty : null;
  }
  // "tira a coca e coloca um guarana" tem um "um" no meio, mas NÃO é resposta de
  // quantidade — frase longa ou com verbo de edição segue pro roteador de intenção.
  if (n.split(" ").length > 6 || REMOVE_START_RE.test(n) || SWAP_RE.test(n)) return null;

  const digit = n.match(/(?:^|\b)(\d{1,2})(?:\s*(?:x|un|unidades?))?(?:\b|$)/)?.[1];
  if (digit) {
    const qty = Number(digit);
    return qty >= 1 && qty <= MAX_QTY ? qty : null;
  }

  if (/\bmeia\s+duzia\b/.test(n)) return 6;
  if (/\b(?:uma\s+)?duzia\b/.test(n)) return 12;
  for (const [word, qty] of Object.entries(WORD_QTY)) {
    if (new RegExp(`\\b${word}\\b`).test(n)) return qty;
  }
  return null;
}

// A extração por IA melhora sinônimos, mas uma lista nunca pode perder itens por uma
// omissão do modelo. Confere o resultado com o parser determinístico e acrescenta só
// as linhas realmente ausentes. Sinônimos comuns são canonizados para não duplicar
// "pasta de dente" quando a IA devolve "creme dental".
// Duas frases falam do MESMO produto? (compartilham um token significativo, com os
// sinônimos que o cliente realmente usa). Serve ao merge IA×determinístico e ao
// esclarecimento durante a escolha ("só shampoo normal" enquanto escolhe shampoo).
const PRODUCT_TOKEN_ALIASES: Record<string, string> = {
  pasta: "creme",
  dente: "dental",
  refri: "refrigerante",
  refrigerantes: "refrigerante",
  coca: "coca",
  lenco: "lenco",
  bebe: "umedecido"
};
function meaningfulProductTokens(phrase: string): string[] {
  return normalizeMsg(phrase)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    // Singulariza ANTES do alias: "cafés moídos" tem que casar com "café moído" — sem
    // isso o merge com a IA duplicava a linha (5º ciclo, rodada 4).
    .map((token) => (token.length >= 5 ? token.replace(/s$/, "") : token))
    .map((token) => PRODUCT_TOKEN_ALIASES[token] ?? token)
    .filter((token) => token.length >= 4 && !["para", "umas", "mais", "cada"].includes(token));
}
export function sharesProductNoun(a: string, b: string): boolean {
  const aTokens = meaningfulProductTokens(a);
  const bTokens = new Set(meaningfulProductTokens(b));
  return aTokens.some((token) => bTokens.has(token));
}

export function mergeShoppingLines(ai: ParsedLine[], deterministic: ParsedLine[]): ParsedLine[] {
  if (!ai.length) return deterministic;
  const meaningful = meaningfulProductTokens;
  const sameProduct = sharesProductNoun;
  // "um presente pra minha namorada, tipo um perfume": o LLM já transformou a
  // intenção em produto ("perfume feminino"); o segmento meta (presente + pessoa)
  // não pode ser "resgatado" como segundo item.
  const GIFT_META = new Set([
    "presente", "presentinho", "lembrancinha", "lembranca", "aniversario", "surpresa",
    "namorada", "namorado", "esposa", "esposo", "marido", "mulher", "amiga", "amigo",
    "filha", "filho", "sogra", "sogro", "cunhada", "cunhado", "madrinha", "padrinho",
    "professora", "professor", "chefe", "colega", "minha", "meu"
  ]);
  const giftMetaOnly = (phrase: string) => {
    const tokens = meaningful(phrase);
    return tokens.length > 0 && tokens.every((token) => GIFT_META.has(token));
  };
  // O LLM não devolve "quantidade foi DITA" — sem propagar o qtyExplicit do parser
  // determinístico, "1 coca" volta a re-perguntar "Quantas unidades?". qty>1 do LLM
  // é sempre dito (ninguém ganha 2 sem pedir); qty=1 herda a flag do determinístico.
  // "leite sem lactose; mais dois leites": quando a própria IA devolve a linha nua
  // ("leite", qty 2) ao lado da rica ("leite sem lactose"), a nua com quantidade dita
  // se dobra na rica ANTES da herança de quantidade do gêmeo determinístico — depois
  // dela contaria duas vezes (o gêmeo já traz o total somado).
  const foldedAi: ParsedLine[] = [];
  for (const line of ai) {
    const saidQty = line.qtyExplicit || line.qty > 1;
    const host = saidQty && meaningfulProductTokens(line.phrase).length === 1
      ? foldedAi.find((c) => sameProduct(line.phrase, c.phrase) && meaningfulProductTokens(c.phrase).length > 1)
      : undefined;
    if (host) {
      host.qty = Math.min(MAX_QTY, host.qty + Math.max(1, line.qty));
      host.qtyExplicit = true;
      continue;
    }
    foldedAi.push({ ...line });
  }
  const flagged = foldedAi.map((line) => {
    // O TETO de preço vive no gêmeo determinístico (a IA remove preço da query por
    // instrução): sem re-anexar, "até R$25 cada" era ordenação e as opções passavam
    // do limite (rodada 10, 4º ciclo: card de R$29,69 com teto de R$25).
    const twin = deterministic.find((d) => sameProduct(d.phrase, line.phrase));
    const twinCap = twin ? parsePriceCap(twin.phrase) : null;
    const phrase = twinCap != null && parsePriceCap(line.phrase) == null ? `${line.phrase} até ${twinCap} reais` : line.phrase;
    if (line.qtyExplicit) return { ...line, phrase };
    if (line.qty > 1) return { ...line, phrase, qtyExplicit: true };
    if (twin?.qtyExplicit) return { ...line, phrase, qty: Math.max(line.qty, twin.qty), qtyExplicit: true };
    return { ...line, phrase };
  });
  if (deterministic.length <= flagged.length) return flagged;
  const merged = [...flagged];
  for (const line of deterministic) {
    if (giftMetaOnly(line.phrase)) continue;
    // O resgate só re-promove segmento com cara de PRODUTO: narrativa/modificador que a
    // IA descartou de propósito não volta (rodada 27/08 S3/S20 — o resgate desfazia o
    // descarte certo da IA e a narrativa virava "item não achado").
    if (isNarrativeSegment(line.phrase) || isRequestModifier(line.phrase)) continue;
    if (!merged.some((candidate) => sameProduct(line.phrase, candidate.phrase))) merged.push(line);
  }
  return merged;
}

// ---------- medicine guard (deterministic — works even with OpenAI off) ----------

const MEDICINE_WORDS = [
  // Colírio é item de farmácia regulado (muitos são medicamento): a régua do produto é
  // conservadora — recusa COM explicação, nunca "não consigo trazer" genérico (feedback
  // real de testador, 24/08: pediu Systane e a recusa pareceu falha de estoque).
  "colirio",
  "colirios",
  "remedio",
  "remedios",
  "medicamento",
  "medicamentos",
  "dipirona",
  "paracetamol",
  "tylenol",
  "ibuprofeno",
  "advil",
  "aspirina",
  "aas",
  "dorflex",
  "neosaldina",
  "buscopan",
  "amoxicilina",
  "antibiotico",
  "antibioticos",
  "anticoncepcional",
  "rivotril",
  "clonazepam",
  "fluoxetina",
  "omeprazol",
  "losartana",
  "insulina",
  "antialergico",
  "loratadina",
  "dramin",
  "xarope pra tosse",
  "xarope para tosse",
  "tarja preta"
];

// "sem remédio" / "não quero remédio" é NEGAÇÃO — o cliente está afastando remédio,
// não pedindo (rodadas 4 e 14: a Lia avisava que tinha removido um medicamento que
// nunca foi pedido). Remove a frase negada ANTES de qualquer detecção/extração.
export function stripMedicineNegation(text: string): string {
  return text
    .replace(/[,;]?\s*(?:mas|porem|porém|so que|só que)?\s*(?:sem|n[aã]o\s+(?:quero|precisa(?:\s+de)?|pode\s+ser)|nada\s+de)\s+(?:nenhum\s+|nenhuma\s+)?(?:rem[eé]dios?|medicamentos?)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function looksLikeMedicine(text: string): boolean {
  const n = normalizeMsg(text);
  return MEDICINE_WORDS.some((word) =>
    word.includes(" ") ? n.includes(word) : new RegExp(`\\b${word}\\b`).test(n)
  );
}

// "quero receber em casa" não é troca de endereço — é o normal. Só "em/para <lugar
// nomeado>" troca destino; "em casa"/"aqui"/"no meu endereço" ficam de fora.
const PRODUCT_HINT_AFTER_DELIVER_RE = /\b(entregar|receber|mandar|enviar)\s+(em|para|pra|no|na)\s+(casa|minha casa|meu endereco|meu endereço|aqui)\b/;

// ---------- intent detection ----------

const GREETING_RE =
  /^(oi+|ol[a]+|opa+|e ?a[ie]+|eai+|iae+|salve|coe+|fala( lia)?|hey|hello|bom dia+|boa tarde+|boa noite+|tudo bem|tudo bom|alo+|oi lia+|ola lia+)[\s!?.,]*$/;

// ONLY genuine thanks here. Words like "perfeito"/"show"/"top" are AFFIRMATIONS —
// at the quote step they mean "yes, close the order", so they live in AFFIRM_CORE.
const THANKS_RE =
  /^((muito|mto|mt)\s+)?(obrigad\w*|brigad\w*|valeu+|vlw+|obg( dms)?)(\s+(lia|viu|mesmo|demais|dms))?[\s!?.😊💚❤️🙏👍]*$/;

const HELP_RE = /^(ajuda|help|menu|como funciona\??|o que (voce|vc) faz\??|como (te )?uso\??|comandos)[\s!?.]*$/;

// NOTE: no bare "meu pedido"/"minha entrega" here — "adiciona um leite no meu pedido"
// must stay a product request, not a status check. A pergunta INTEIRA "e meu pedido?"
// é status — por isso as alternativas ancoradas (^…$) no fim.
const STATUS_RE =
  /\b(status|cade|rastreio|rastrear|rastreamento|acompanhar|previsao( de entrega)?|quando chega|chega quando|que horas? chega|vai chegar|chega hoje|(ainda )?nao chegou|ta (vindo|chegando|a caminho)|onde (ta|esta|anda)( o| meu)? ?(pedido|entregador|motoboy)?|falta muito|ja saiu|saiu pra entrega|andamento)\b|^chegou\?+$|^e? ?(o |a )?(meu|minha) (pedido|entrega|compra)[\s!?.]*$|^como (ta|esta|anda|ficou) (o |a )?(meu |minha )?(pedido|entrega|compra)[\s!?.]*$/;

const PAID_RE =
  /\b(paguei|ja paguei|acabei de pagar|pagamento (feito|realizado|efetuado)|pix (feito|enviado|pago)|fiz o pix|mandei o pix|transferi|ta pago|esta pago|caiu( o pix)?)\b|^pago[\s!.]*$/;
// "ainda não paguei", "não consegui pagar" — the OPPOSITE of a paid claim: they want
// (to retry) the charge, so route to "pay" (which resends the code) instead.
const NOT_PAID_RE = /\b(ainda |^)?nao (paguei|pagou|fiz o pix|mandei o pix|consegui pagar|consigo pagar)\b/;

const CANCEL_RE = /\b(cancel\w*|cansel\w*|desist\w*|nao quero mais( o pedido)?)\b/;

// "não vou pagar" / "não quero pagar" = desistência — PRECISA vencer o PAY_RE (que
// contém "pagar") senão a Lia reenvia o código Pix pra quem está desistindo.
const REFUSE_PAY_RE = /\bn(a|ã)o (vou|quero|vamos|pretendo) (pagar|comprar|levar|querer)\b/;

// Negação/desistência SECA — a resposta mais comum do WhatsApp. Sem isto, "não" vira
// busca de produto e casa com "Esponja NÃO Risca" no catálogo.
const REJECT_BARE_RE =
  /^(n+|nn+|nao+( nao)?|hoje nao|agora nao|por enquanto nao|melhor nao|acho que nao|nao quero( nao)?|nao precisa( mais)?|nem precisa|deixa( pra la| quieto)?|esquece|to de boa|dispenso)[\s,!.]*((muito |mto )?obrigad\w*|valeu|brigad\w*|vlw)?[\s,!.]*$/;

// "só isso", "mais nada", "é só" — o cliente FECHOU a lista; hora de mostrar o total.
const DONE_RE =
  /^((e|é|eh) ?so( isso)?( mesmo)?|so isso( mesmo)?( por (hoje|enquanto))?|mais nada|nada mais|(por (hoje|enquanto) )?(e|é|eh) ?isso( ai)?|fechou a lista|acabou( a lista)?|pronto,? (e|é|eh)? ?(so|isso)?)[\s,!.]*$/;

// "não recebi o código", "o pix expirou", "manda o pix de novo", "perdi o link".
const RESEND_CODE_RE =
  /\b(nao (recebi|chegou|veio|achei)( aqui)?( o)? (codigo|pix|link|qr ?code)|perdi o (codigo|pix|link)|manda (o )?(pix|codigo|link)( de novo| novamente| dnv)?|(pix|codigo|link|qr ?code) (de novo|dnv|sumiu|nao (chegou|veio|apareceu))|reenvia\w*|reemite|manda de novo)\b/;
const CODE_EXPIRED_RE = /\b(pix|codigo|link|qr ?code|cobranca)\s+(expirou|venceu|expirado|vencido|invalido)\b|\bexpirou\b/;

// "quero mudar a forma de pagamento" (sem dizer qual) — oferecer pix e cartão de novo.
const SWITCH_PAYMENT_RE =
  /\b(muda\w*|troca\w*|altera\w*) (a |de |o )?(forma|meio|metodo|jeito) de pag\w+\b|\bpagar de outro jeito\b|\boutra forma de pag\w+\b/;

// "quero falar com um atendente/humano/pessoa de verdade".
const HUMAN_RE =
  /\b(atendente|humano|falar com (alguem|uma pessoa|um humano|um atendente|o dono|o responsavel)|pessoa (de verdade|real)|sac\b|suporte|ouvidoria)\b/;

// Reclamação pós-pedido: "veio errado", "faltou", "estragado" — pedir desculpa e
// acionar o operador, nunca oferecer produto.
const COMPLAINT_RE =
  /\b((veio|chegou|ta|esta) (errado|faltando|estragado|vencido|quebrado|derramado|aberto)|pedido errado|produto errado|item errado|faltou (um|uma|o|a|itens?)|nao era o que pedi|quero (reclamar|meu dinheiro|reembolso)|absurdo|pessimo|horrivel|uma vergonha)\b/;

// Pergunta operacional (frete/prazo/área/pagamento) sem produto — responder com copy.
const SERVICE_WORDS_RE =
  /\b(entreg\w+|frete|taxa|cobertura|regiao|area de (entrega|atendimento)|prazo|demora\w*|horario|funcionam?\w*|atendem?\w*|pagamento|formas? de pagar|parcel\w+|vale[- ]?(refeicao|alimentacao)|vr\b|va\b|cupom|desconto|pedido minimo|minimo)\b/;

const CLEAR_CART_RE =
  /\b(zera|zerar|recome[c]ar|come[c]ar de novo|novo pedido|outro pedido)\b|\b(limpa|limpar)\s+(o\s+|a\s+)?(carrinho|cesta|pedido|tudo|lista)\b|\b(tira|tirar|remove|remover|apaga|apagar|esquece|esquecer)\s+(o\s+|os\s+|a\s+|as\s+)?(tudo|anteriores|antigos|de antes|carrinho|cesta)\b/;

const CHANGE_ADDRESS_RE =
  /\b(muda|mudar|troca|trocar|altera|alterar|atualiza|atualizar|corrige|corrigir)\w*\b[^]*\b(endereco|cep)\b|\b(endereco|cep)\s+(novo|errado|mudou|diferente)\b|\bnovo\s+(endereco|cep)\b|\boutro\s+endereco\b/;

const REPEAT_RE =
  /\b(repete|repetir|(o )?de sempre|mesmo pedido|pedido anterior|ultimo pedido|mesma coisa( de sempre)?|manda o mesmo|(igual|mesmo|mesma) (ao?|d[oa]) (ultim[oa]|anterior|sempre)( vez)?)\b|^o mesmo$/;

const PAY_RE =
  /\b(pagar|pagamento|finaliza|finalizar|fecha( o pedido)?|fechar( o pedido)?|fechamos|checkout|manda o pix|me manda o pix|manda o link|gera o pix)\b/;

const AFFIRM_RE =
  /^(sim+|s|ss+|ok+|okay|pode( ser)?( mandar)?|pode sim|isso( ai)?|issa|(e|é|eh) isso( ai)?( mesmo)?|fechado|fechou|beleza|blz|confirmo|confirmar|confirma|confirmado|bora|dale|vai|manda( ai| ver)?|ta bom|ta otimo|ta certo|perfeito|certo|claro|aham|uhum|yes|👍)[\s!.]*$/;

// Multi-word confirmations ("sim, confirmo", "isso mesmo, fechado", "pode confirmar"):
// every token is an affirmation/filler word AND at least one is a core "yes".
const AFFIRM_CORE = new Set([
  "sim", "ok", "okay", "pode", "isso", "fechado", "fechou", "confirmo", "confirmar", "confirma",
  "confirmado", "beleza", "blz", "bora", "claro", "perfeito", "certo", "aham", "uhum", "yes",
  "combinado", "show", "top", "otimo", "joia", "massa", "legal", "maravilha", "ss"
]);
const AFFIRM_FILLER = new Set([
  ...AFFIRM_CORE, "s", "ser", "mesmo", "dale", "vai", "manda", "mandar", "ver", "entao", "ta",
  "tá", "bom", "ai", "e", "eh", "é", "por", "favor", "pfv", "obrigado", "obrigada", "valeu",
  "issa", "quero", "sim", "demais", "tudo"
]);
function isAffirm(n: string): boolean {
  if (AFFIRM_RE.test(n)) return true;
  const tokens = n.replace(/[!.,?👍]/g, " ").split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.length <= 5 && tokens.every((t) => AFFIRM_FILLER.has(t)) && tokens.some((t) => AFFIRM_CORE.has(t));
}

const REJECT_RE =
  /\b(nao era isso|nao e isso|nada a ver|errado|errou|nao gostei|nenhum(a)?( dess[ea]s| del[ea]s)?|outras opcoes|tem outr[ao]s?|acha outr[ao]s?|mostra outr[ao]s?)\b/;

// "esquece o carregador" é remoção — e a interjeição na frente ("aa esquece...")
// não pode esconder o verbo (27/08 r3 S14: virou "pula" do item ERRADO).
const REMOVE_START_RE =
  /^(?:(?:aa+|ah+|hm+|opa|ei|nossa|pera(?:i)?)[\s,]+)?(?:pode\s+)?(tira|tirar|remove|remover|retira|retirar|exclui|excluir|apaga|apagar|esquece|esquecer|sem|cancel\w*)\s+/;

const SWAP_RE =
  /\b(?:troca|trocar|substitui|substituir|muda|mudar)\s+(?:o |a |os |as )?(.+?)\s+(?:por|pelo|pela)\s+(.+)$/;
// "coca zero em vez da normal" / "bota X no lugar do Y" — ordem INVERTIDA (to vem antes).
const SWAP_INSTEAD_RE =
  /^(?:(?:bota|poe|coloca|manda|me ve|quero|queria|prefiro|melhor|ah)\s+)?(?:o |a |um |uma )?(.+?)\s+(?:em vez|no lugar|ao inves)\s+(?:de|da|do|das|dos)\s+(.+)$/;
// "não quero de uva, quero de laranja" — correção de ATRIBUTO do item da cesta. O
// "de/da/do" antes dos dois lados é o sinal de atributo (attr: o cérebro compõe a
// busca com o substantivo do item: "suco laranja", não "laranja" solta = fruta).
const SWAP_NEG_RE =
  /^nao quero\s+(de |da |do )?(.+?)[,;.]?\s+(?:quero|prefiro|me ve|manda|pode ser|melhor)\s+(de |da |do )?(.+)$/;

// Emoji-only message ("🙏", "👍👍", "😊") — never product search.
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}️‍\s]+$/u;

// "quero", "queria comprar", "quero fazer um pedido", "preciso de umas coisas" —
// intenção de comprar SEM item nenhum. Não pode virar busca (dá "não entendi").
const WANT_ITEMS_RE =
  /^(?:oi[,!\s]+)?(?:eu )?(?:vou querer|quero|queria|gostaria|preciso|to precisando|estou precisando)(?: (?:de )?(?:comprar|pedir|encomendar|fazer (?:um |uma )?(?:pedido|compra|encomenda)|umas? coisas?|algumas coisas)| de)?[\s!.,…]*$/;

export function detectIntent(text: string): Intent {
  const n = normalizeMsg(text);
  if (!n) return { kind: "free_text" };

  // Ids exatos dos botões de cartão salvo (chegam como texto quando o cliente toca).
  // Vêm ANTES de qualquer regex: são strings de máquina, não linguagem.
  const savedCardTap = n.match(/^cardpay:([a-z0-9]+)$/);
  if (savedCardTap) return { kind: "saved_card_pay", attemptId: savedCardTap[1] };
  if (n === "cardother") return { kind: "saved_card_other" };
  // Botão "Outras opções" do último card de produto. No fluxo de escolha, o
  // handleChoosing pagina via wantsMoreOptions ANTES do intent; num toque atrasado
  // (fora da escolha) o roteador reabre a ÚLTIMA escolha em vez de responder "me diz
  // de outro jeito" (teste real 19/08: o toque no card antigo caía no reject).
  if (n === "opt:outras") return { kind: "more_options" };
  // "outras"/"outras opções"/"mais opções" secos fora da escolha: mesma coisa.
  if (/^(outr[ao]s( opcoes)?|mais opcoes)[\s!.]*$/.test(n)) return { kind: "more_options" };
  // "mais barato"/"mais em conta" seco fora da escolha: reabrir a última escolha
  // ordenada por preço — antes virava modificador vazio e caía no "não entendi".
  if (/^(tem )?(o |a |algo )?(mais barat[oa]s?|mais em conta|menor preco)( que tiver| possivel)?[\s?!.]*$/.test(n)) {
    return { kind: "more_options", cheaper: true };
  }
  // Botão "Escolher esse" (id por sku). Na escolha, o handleChoosing resolve o sku
  // ANTES de qualquer parser; fora dela, é botão de conversa ANTIGA — intent próprio
  // com o sku preservado, nunca busca de produto nem "não entendi" (27/08 S1).
  const staleTap = n.match(/^optsku:(.+)$/);
  if (staleTap) return { kind: "stale_option_tap", sku: staleTap[1].trim() };
  // Botão "Trocar endereço" do resumo da cotação (o regex de texto não casa o
  // underscore do id de máquina).
  if (n === "trocar_endereco") return { kind: "change_address" };

  // "Quem é vc?", "com quem eu falo", "vc é um robô?" — pergunta de IDENTIDADE vira
  // apresentação (help), NUNCA busca de produto (teste real 24/08: "Quem é vc" virou
  // pendingRequest e depois casou com o blush "Quem Disse, Berenice?").
  if (
    /^(?:oi[,!\s]+)?(?:quem (?:e|eh) (?:vc|voce|tu)|com quem (?:eu )?(?:to|estou|tou) falando|(?:vc|voce) (?:e|eh) (?:um |uma )?(?:robo|bot|ia|maquina|pessoa|humano|atendente)|o que (?:e|eh) (?:isso|esse numero|a lia|aqui))[\s?!.]*$/.test(n)
  ) {
    return { kind: "help" };
  }

  // Identidade/segurança DENTRO de mensagem composta curta: "oi... quem é vc? isso é
  // golpe?" é apresentação, nunca extração de produto (teste 26/08, P1.5).
  if (
    n.length <= 90 &&
    (/(quem (e|eh) (vc|voce|tu)\b)|(\b(e|eh|isso e|isso eh) golpe\b)|(\bgolpe\b.*\?)|(\bconfiavel\b)/.test(n))
  ) {
    return { kind: "help" };
  }

  // Regateio: "faz por 10?", "tem desconto?" — resposta clara, nunca escolha nem busca.
  if (/^(faz|fazes|consegue|sai) por (r\$\s*)?\d+|^tem desconto|^(da|dá) (um )?desconto|^faz mais barato/.test(n)) {
    return { kind: "haggle" };
  }

  // Emoji sozinho: 👍/✅ = sim; 🙏/❤️/💚/😊/🙌 = obrigado; resto = um "oi" acenando.
  if (EMOJI_ONLY_RE.test(n)) {
    if (/[👍✅🆗]/u.test(n)) return { kind: "affirm" };
    if (/[🙏❤💚😊🙌✨😍🥰]/u.test(n)) return { kind: "thanks" };
    return { kind: "greeting" };
  }

  // Bare number ("1", "2") — the step decides what it selects. Leading zero ("08") is
  // a partial CEP/typo, NOT an option pick.
  const bareNumber = n.match(/^([1-9]\d?)[\s).]*$/);
  if (bareNumber) return { kind: "number", value: Number(bareNumber[1]) };

  const cep = extractCep(n);
  if (cep && isBareCep(n)) return { kind: "cep", cep, bare: true };

  if (THANKS_RE.test(n)) return { kind: "thanks" };
  if (GREETING_RE.test(n)) return { kind: "greeting" };
  if (HELP_RE.test(n)) return { kind: "help" };
  if (HUMAN_RE.test(n)) return { kind: "human" };
  if (COMPLAINT_RE.test(n)) return { kind: "complaint" };
  if (REFUSE_PAY_RE.test(n)) return { kind: "cancel" };
  if (RESEND_CODE_RE.test(n) || CODE_EXPIRED_RE.test(n)) {
    return { kind: "resend_code", expired: CODE_EXPIRED_RE.test(n) };
  }
  if (SWITCH_PAYMENT_RE.test(n)) return { kind: "switch_payment" };
  if (NOT_PAID_RE.test(n)) return { kind: "pay" };
  // "caiu?" / "já caiu?" é PERGUNTA sobre o pagamento (status), não afirmação de pago.
  if (PAID_RE.test(n)) return isQuestion(n) ? { kind: "status" } : { kind: "paid_claim" };
  // "pensando bem melhor não"/"deixa pra lá" = arrependimento seco → reject (26/08:
  // virava "item indisponível" e o item anterior ficava na cesta).
  if (/^pensando (bem|melhor)[,.\s]*(melhor\s+)?(nao|não)( quero| vou querer)?[\s!.]*$/.test(n)) return { kind: "reject" };
  // Risada/ack sem conteúdo ("kkkk", "kkkk beleza", "haha blz") → obrigado, nunca busca.
  if (/^(k{2,}|ha(ha)+|rs+)[\s!.]*(beleza|blz|valeu|ok|okay|show|top)?[\s!.]*$/.test(n)) return { kind: "thanks" };
  if (CHANGE_ADDRESS_RE.test(n)) return { kind: "change_address" };
  if (
    /^(quanto (ainda )?falta|falta quanto|falta muito)[\s?!.]*$/.test(n) ||
    /\b(que|quanto) (eu )?(posso|da pra|preciso|devo) (pedir|comprar|adicionar|por|colocar)( mais)? pra (completar|fechar|chegar)/.test(n) ||
    /\bcompletar o (valor|pedido|minimo|m[ií]nimo)\b/.test(n)
  ) {
    return { kind: "missing_question" };
  }
  if (
    /\b(salvou|salvo|anotou|anotado|guardou|registrou|pegou|recebeu|chegou|ta certo|esta certo)\b/.test(n) &&
    /\b(endereco|cep)\b/.test(n) &&
    !/\d{5}/.test(n)
  ) {
    return { kind: "address_question" };
  }

  // "troca o arroz por leite" — swap BEFORE remove/cancel so "troca" wins.
  const swap = n.match(SWAP_RE);
  if (swap) {
    const from = cleanItemPhrase(swap[1]);
    let to = cleanItemPhrase(swap[2]);
    if (/^(favor|gentileza)$/.test(to)) to = ""; // "troca o arroz por favor"
    if (from) return { kind: "swap_item", from, to };
  }
  // Comando nunca é lado de troca: "não quero mais nada, quero PAGAR" é fechamento,
  // não swap. Vale para os dois regexes novos abaixo.
  const swapSideIsCommand = (s: string) =>
    !s || /\b(nada|mais|pagar|pagamento|fechar|cancelar|finalizar|encerrar|parar|desistir|isso|so isso)\b/.test(s);
  // "coca zero em vez da normal": o TO vem primeiro. Exige cesta em contexto? Não —
  // o cérebro resolve o alvo; sem cesta cai no "não achei pra tirar" de sempre.
  const instead = n.match(SWAP_INSTEAD_RE);
  if (instead) {
    const to = cleanItemPhrase(instead[1]);
    const from = cleanItemPhrase(instead[2]);
    if (to && from && !swapSideIsCommand(to) && !swapSideIsCommand(from)) {
      return { kind: "swap_item", from, to };
    }
  }
  // "não quero de uva, quero de laranja" — attr quando os dois lados vêm com "de".
  const negSwap = n.match(SWAP_NEG_RE);
  if (negSwap) {
    const from = cleanItemPhrase(negSwap[2]);
    const to = cleanItemPhrase(negSwap[4]);
    const attr = Boolean(negSwap[1] && negSwap[3]);
    if (from && to && !swapSideIsCommand(to) && !swapSideIsCommand(from)) {
      return { kind: "swap_item", from, to, ...(attr ? { attr: true } : {}) };
    }
  }

  // "tira a esponja" / "cancela o guaraná" — remove of a SPECIFIC item beats order-cancel.
  // EXCEÇÃO: "sem remédio ..." é negação de categoria (rodada 9, 4º ciclo: virava
  // "não achei pra tirar" e o shampoo do resto da frase se perdia) — segue como pedido.
  if (REMOVE_START_RE.test(n) && !/^sem\s+(remedios?|medicamentos?)\b/.test(n)) {
    const rawTarget = n.replace(REMOVE_START_RE, "");
    // Multi-intenção: "tira o arroz E COLOCA feijão" / "tira o café, QUERO chá" —
    // corta no verbo de adicionar (com " e ", vírgula ou ponto-e-vírgula antes); a 1ª
    // parte é o remove, a 2ª volta pro fluxo como item novo. Sem isto o target sujo
    // casa com os DOIS itens na cesta e apaga o que o cliente quer comprar (o caso da
    // vírgula: rodada 27/08 S8 — "tira o café, quero café de centeio" só removia).
    const addSplit = rawTarget.split(
      /(?:\s+e\s+|\s*[,;]\s*(?:e\s+)?)(?:coloca|poe|bota|traz|adiciona|adicione|inclui|acrescenta|manda|me ve|quero|compra)\s+/
    );
    const target = cleanItemPhrase(addSplit[0]);
    const andAdd = addSplit[1] ? cleanItemPhrase(addSplit[1]) : undefined;
    const clearAll = !target || /\b(tudo|todos|todas)\b/.test(target);
    if (clearAll) return { kind: "clear_cart" };
    // "cancela o pedido" is an order cancel, not an item removal.
    if (/^(o\s+|a\s+|meu\s+)?(pedido|compra|entrega)$/.test(target)) return { kind: "cancel", explicitOrder: true };
    // "cancela o pagamento/pix" é desistir da cobrança, não tirar item da cesta.
    if (/^(o\s+|a\s+)?(pagamento|pix|cobranca|boleto)$/.test(target)) return { kind: "cancel", explicitOrder: true };
    return { kind: "remove_item", target, ...(andAdd ? { andAdd } : {}) };
  }

  // "não quero mais o guaraná" / "quero cancelar o arroz" — a remove verb buried
  // mid-sentence still targets ONE item, not the whole cart/order.
  const cancelItem = n.match(/\b(?:nao quero mais|quero (?:cancelar|tirar|remover)|pode (?:tirar|remover))\s+(?:o |a |os |as )?(.+)$/);
  if (cancelItem) {
    const target = cleanItemPhrase(cancelItem[1]);
    if (target && !/^(pedido|compra|entrega|tudo|nada)$/.test(target)) return { kind: "remove_item", target };
  }

  // "não quero mais nada" = fechou a LISTA (done), não "cancela tudo" — precisa vencer
  // o CANCEL_RE (que contém "nao quero mais").
  if (/^n(a|ã)o quero mais nada[\s!.]*$/.test(n)) return { kind: "done" };

  if (CLEAR_CART_RE.test(n)) return { kind: "clear_cart" };
  if (CANCEL_RE.test(n)) {
    // "posso cancelar?" é pergunta — explicar como cancelar, nunca EXECUTAR o cancelamento.
    if (isQuestion(n)) return { kind: "cancel_question" };
    return { kind: "cancel", explicitOrder: /\b(pedido|compra|entrega)\b/.test(n) };
  }
  if (REPEAT_RE.test(n)) return { kind: "repeat_last" };
  if (STATUS_RE.test(n)) return { kind: "status" };

  // "quero mais três (caixas) do mesmo (bombom)" / "mais 2 iguais" / "outra igual":
  // referência ao item que acabou de entrar — resolve pelo sku da cesta, sem nova
  // busca (a busca genérica podia devolver OUTRA marca; caso real da rodada 13).
  const moreSame = n.match(
    /^(?:(?:oi|ola|pode|coloca|poe|bota|adiciona|acrescenta|quero|queria|vou querer|me ve|manda|e|so|só|colocar|adicionar)\s+)*(?:mais|outr[ao]s?)\s+(\d+|uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)?\s*([a-z][a-z ]{2,30}?)?\s*(?:d[oa] mesm[oa]\b|iguais\b|igual\b|desses?(?: ai| mesmos?)?\b|dessas?(?: ai| mesmas?)?\b|dele\b|dela\b)\s*([a-z][a-z ]{2,30})?/
  );
  if (moreSame) {
    const rawQty = moreSame[1];
    const qty = rawQty ? (WORD_QTY[rawQty] ?? Math.min(MAX_QTY, Math.max(1, Number(rawQty) || 1))) : 1;
    // Substantivo antes OU depois do marcador ("mais um SACO DE LIXO desses" /
    // "mais três caixas do mesmo BOMBOM") — limpo de embalagem/cortesia.
    const rawNoun = (moreSame[2] ?? moreSame[3])
      ?.trim()
      .replace(/\b(por favor|pfv|ai|aqui|caixas?|unidades?|pacotes?|garrafas?|latas?|potes?|sacos?|rolos?|frascos?|un|de|do|da)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const noun = rawNoun || undefined;
    return { kind: "add_more_same", qty, ...(noun ? { noun } : {}) };
  }

  // Formas humanas do cartão salvo — ANTES do método genérico, senão "outro cartão"
  // viraria choose_payment(card) e cobraria de novo o cartão que o cliente quer trocar.
  if (/^(usar |pagar (com )?)?outro cart(a|ã)o[\s!.]*$/.test(n) || /^trocar (de |o )?cart(a|ã)o[\s!.]*$/.test(n)) {
    return { kind: "saved_card_other" };
  }
  if (/^(usar |pagar (com )?)?(o )?cart(a|ã)o salvo[\s!.]*$/.test(n) || /^usar (o |esse |este )?cart(a|ã)o[\s!.]*$/.test(n)) {
    return { kind: "saved_card_pay" };
  }

  const method = paymentMethodIn(n);
  // "Antes de pagar, quero entregar em Belo Horizonte" (rodada 15, 14/08): "pagar" em
  // oração subordinada NÃO é decisão de pagar — e "entregar em <lugar>" é troca de
  // destino, que precisa vencer o pagamento (o cliente quase pagou frete do endereço
  // velho). A subordinação desarma o PAY_RE; o destino cai no change_address abaixo.
  const paySubordinate = /\b(antes de|antes do|depois de|depois do|sem|quando|assim que|na hora de|apos|após)\s+(pagar|fechar|finalizar|o pagamento|pagamento)\b/.test(n);
  if (/\b(quero|queria|preciso|gostaria de|da pra|dá pra|pode|vou(?: querer)?)\s+(entregar|receber|mandar|enviar)\s+(em|para|pra|no|na)\s+\S/.test(n) && !PRODUCT_HINT_AFTER_DELIVER_RE.test(n)) {
    // "vou entregar em São Paulo, CEP 01310-100": o CEP JÁ VEIO — consumir direto em
    // vez de responder "me manda o CEP" (rodada 8, 4º ciclo).
    const embeddedCep = extractCep(n);
    if (embeddedCep) return { kind: "cep", cep: embeddedCep, bare: true };
    return { kind: "change_address" };
  }
  if (PAY_RE.test(n) && !isQuestion(n) && !paySubordinate) return { kind: "pay", ...(method ? { method } : {}) };
  // "pix" / "no cartão" as a short reply (not buried inside a shopping list). A
  // QUESTION about a method ("quanto fica no cartão?") is not a decision to charge.
  if (method && n.split(" ").length <= 4 && !isQuestion(n)) return { kind: "choose_payment", method };

  if (isAffirm(n)) return { kind: "affirm" };
  if (DONE_RE.test(n)) return { kind: "done" };
  if (REJECT_BARE_RE.test(n)) return { kind: "reject" };
  if (REJECT_RE.test(n)) return { kind: "reject" };

  // "quero" / "queria comprar" / "quero fazer um pedido" sozinho: vontade de comprar
  // sem dizer O QUÊ. Buscar isso vira "Não entendi seu pedido" — frio. Perguntamos.
  if (WANT_ITEMS_RE.test(n)) return { kind: "want_items" };

  // Pergunta operacional (frete/prazo/área/pagamento) SEM cara de produto — responder
  // com copy de serviço; cair em busca aqui gera "sabonete pra quem pergunta de frete".
  if (SERVICE_WORDS_RE.test(n) && (isQuestion(n) || /\b(vcs?|voces?)\b/.test(n)) && n.split(" ").length <= 10) {
    const topic = /\bfrete|taxa\b/.test(n) || /\b(quanto|qual( o)? valor|preco)\b.*\bentrega\b|\bentrega\b.*\b(quanto|custa|sai por)\b/.test(n)
      ? ("fee" as const)
      : /\bprazo|demora\w*|horario|que horas|tempo\b/.test(n)
        ? ("eta" as const)
        : /\bpagamento|pagar|parcel\w+|vale|vr\b|va\b|pix|cartao\b/.test(n)
          ? ("payment" as const)
          : /\bentreg\w+|atende\w*|cobertura|regiao|area|cidade|bairro\b/.test(n)
            ? ("area" as const)
            : ("generic" as const);
    return { kind: "service_question", topic };
  }

  if (cep) {
    // "meu cep é 01310-100, quero arroz e leite" — o CEP não pode engolir os itens.
    const rest = n
      .replace(/\b\d{5}-?\d{3}\b/, " ")
      .replace(/\b(meu|o|novo|cep|endereco|e|eh|é)\b/g, " ")
      .replace(/[:,.;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { kind: "cep", cep, bare: false, ...(rest.length > 3 ? { rest } : {}) };
  }

  return { kind: "free_text" };
}

function paymentMethodIn(n: string): "pix" | "card" | undefined {
  if (/\bpix\b/.test(n)) return "pix";
  if (/\b(cartao|credito|debito|cred)\b/.test(n)) return "card";
  return undefined;
}

// A pix/card mention ANYWHERE in the message ("pode ser no pix mesmo, obrigada") —
// for use when the conversation step already means "picking how to pay".
export function detectPaymentMethod(text: string): "pix" | "card" | undefined {
  return paymentMethodIn(normalizeMsg(text));
}

// "quanto fica no cartão?", "qual é a desnatada?" — a question, not a decision.
export function isQuestion(text: string): boolean {
  const n = normalizeMsg(text);
  return /\?\s*$/.test(n) || /^(quanto|quanta|qual|quais|como|quando|onde|por que|pq|sera que|tem como|voce tem|vcs tem|tem)\b/.test(n);
}

// Strip articles/politeness from an item phrase ("o arroz da cesta pff" -> "arroz").
function cleanItemPhrase(phrase: string): string {
  return phrase
    .replace(/\b(o|a|os|as|um|uma|uns|umas|da cesta|do pedido|da lista|do carrinho|por favor|pf+v?|pls|esse|essa|esses|essas|ai|dai)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- refinements while choosing ("tem essa em azul?", "tem de 2kg?", "quero uma maior") ----------

const COLOR_ATTRS = new Set([
  "azul", "preta", "preto", "branca", "branco", "rosa", "vermelha", "vermelho", "verde",
  "amarela", "amarelo", "roxa", "roxo", "cinza", "bege", "marrom", "dourada", "dourado",
  "prateada", "prateado", "lilas", "laranja"
]);
const SIZE_ATTRS = new Set(["grande", "pequena", "pequeno", "media", "medio", "gg", "pp", "xg", "mini", "gigante", "familia"]);
// Atributos de MERCADO — "desnatado" enquanto escolhe leite é REFINAMENTO do leite,
// não um item novo (sem isto a Lia adiciona um iogurte desnatado à cesta).
const GROCERY_ATTRS = new Set([
  "desnatado", "desnatada", "semidesnatado", "semidesnatada", "integral", "zero", "diet",
  "light", "lata", "vidro", "retornavel", "congelado", "congelada", "organico", "organica",
  "sem lactose", "sem acucar", "sem gluten", "descafeinado", "gelada", "gelado"
]);
// Público/fase de vida vale para QUALQUER categoria (perfume, roupa, higiene, pet...),
// não apenas para um caso como Arbo. Formas coloquiais são canonizadas para a palavra
// que costuma existir no catálogo.
const AUDIENCE_ATTR_MAP: Record<string, string> = {
  masculino: "masculino", masculina: "masculino", masc: "masculino", homem: "masculino", homens: "masculino",
  feminino: "feminino", feminina: "feminino", fem: "feminino", mulher: "feminino", mulheres: "feminino",
  unissex: "unissex", unisex: "unissex",
  infantil: "infantil", crianca: "infantil", criancas: "infantil", kids: "infantil",
  bebe: "bebe", baby: "bebe", adulto: "adulto", adulta: "adulto",
  filhote: "filhote", filhotes: "filhote", senior: "senior", castrado: "castrado", castrada: "castrado",
  // espécie durante a escolha de ração/petisco ("pra cachorro, ele é adulto") é
  // refinamento do item atual, nunca um item novo
  cachorro: "cachorro", cachorra: "cachorro", cao: "cachorro", dog: "cachorro",
  gato: "gato", gata: "gato", felino: "gato"
};
// Comparatives map to a searchable size word.
const SIZE_MAP: Record<string, string> = { maior: "grande", maiores: "grande", menor: "pequeno", menores: "pequeno" };
const REFINE_FILLER = new Set(
  "tem essa esse dessa desse de da do dela dele em uma um umas uns a o as os quero queria prefiro pode ser mas e na no pra para pro cor tamanho versao opcao so que seja por favor pfv vcs voces voce vc ai dai ne la ja tb tambem alguma algum outra outro mesmo mesma tipo dessa vez ele ela eles elas meu minha nosso nossa eh".split(" ")
);

// "acha outras", "tem mais?", "mostra outras opções" — the customer wants to SEE MORE
// options for the SAME item (not pick, not skip). The tail after "mais/outras" must be
// empty or pure filler: "manda mais 2 cocas" is ADDING an item, "tem mais barato?" is
// picking the cheapest — neither is paging.
// Lista encaminhada com NUMERAÇÃO ("1. coca ¶ 2) vodka ¶ 3- suco"): os números são
// índice, não quantidade — só com separador explícito (./)/-) depois do dígito; número
// nu ("2 vodka") continua sendo quantidade. Exige 3+ linhas todas numeradas.
export function stripListNumbering(text: string): string {
  const lines = text.split(/\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 3) return text;
  const marker = /^\s*\d{1,2}\s*[.)\-–]\s+/;
  if (!nonEmpty.every((l) => marker.test(l))) return text;
  return lines.map((l) => l.replace(marker, "")).join("\n");
}

export function wantsMoreOptions(text: string): boolean {
  const n = normalizeMsg(text).replace(/[?!.,]/g, " ").replace(/\s+/g, " ").trim();
  // Toque no botão "Outras opções" do card (id de máquina, não linguagem).
  if (n === "opt:outras") return true;
  if (/\b(mais|outras) opcoes\b/.test(n)) return true;
  if (/\boutra opcao\b/.test(n)) return true;
  // "outras"/"outros" seco: é o atalho que a própria Lia anuncia no choicesAsk
  // ("*outras* que eu mostro mais") — tem que funcionar sozinho.
  if (/^outr[ao]s?$/.test(n)) return true;
  if (/^e (as|os) outr[ao]s( opcoes)?$/.test(n)) return true;
  const m = n.match(/\b(?:tem|acha|ache|mostrar?|procura|busca|manda|me ve|quero ver|ver)\s+(?:mais|outr[ao]s?)\b(.*)$/);
  if (!m) return false;
  const tail = m[1]
    .replace(/\b(opcoes|opcao|marcas?|sabores?|tipos?|modelos?|delas|dessas|desses|deles|por|favor|pfv|ai|aqui|pra|mim|um|pouco|entao)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !tail;
}

// Canonical form of a number+unit attribute: "2 litros"/"2 lt"/"2l" -> "2l"; decimals
// survive ("1,5l"). Kept consistent with attrMatchesItem's name normalization.
function canonSize(num: string, unit: string): string {
  const u = unit.replace(/litros?|lts?$/, "l");
  return `${num}${u}`;
}

// If the WHOLE message is just attribute words (color/size/weight) plus filler, it's a
// refinement of the item being chosen — return the searchable attribute tokens.
// "quero fralda azul" is NOT a refinement (a real product word remains) — that's a new item.
export function parseRefinement(text: string): string[] | null {
  // Protect decimal sizes ("1,5l" / "1.5kg") before stripping punctuation.
  const n = normalizeMsg(text)
    .replace(/(\d)[.,](\d)/g, "$1§$2")
    .replace(/[?!.,]/g, " ")
    // bigramas de atributo viram token único pra passar pelo split
    .replace(/\bsem lactose\b/g, "sem·lactose")
    .replace(/\bsem acucar\b/g, "sem·acucar")
    .replace(/\bsem gluten\b/g, "sem·gluten")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const tokens = n.split(" ").map((t) => t.replace("·", " "));
  const attrs: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const sizeMatch = t.match(/^(\d+(?:§\d+)?)(kg|g|ml|l|lt|litros?)$/);
    if (SIZE_MAP[t]) {
      attrs.push(SIZE_MAP[t]);
    } else if (AUDIENCE_ATTR_MAP[t]) {
      attrs.push(AUDIENCE_ATTR_MAP[t]);
    } else if (COLOR_ATTRS.has(t) || SIZE_ATTRS.has(t) || GROCERY_ATTRS.has(t)) {
      attrs.push(t);
    } else if (sizeMatch) {
      attrs.push(canonSize(sizeMatch[1].replace("§", ","), sizeMatch[2])); // "2kg", "1,5l"
    } else if (/^\d+(?:§\d+)?$/.test(t) && /^(kg|g|ml|l|lt|litros?)$/.test(tokens[i + 1] ?? "")) {
      attrs.push(canonSize(t.replace("§", ","), tokens[i + 1])); // "2 kg" -> "2kg", "2 litros" -> "2l"
      i++;
    } else if (!REFINE_FILLER.has(t)) {
      rest.push(t);
    }
  }
  return attrs.length > 0 && rest.length === 0 ? attrs : null;
}

// ---------- choice reply parsing (customer looking at up to 3 options) ----------

export type ChoiceReply =
  | { type: "pick"; index: number }
  | { type: "any" }
  | { type: "cheapest" }
  // "mais barato"/"mais caro" SEM verbo de escolha: o cliente quer VER opções nessa
  // faixa, não comprar a mais barata da mesa (teste real 19/08: "Mais barata" pós-cards
  // colocou um produto no carrinho que o cliente não quis).
  | { type: "cheaper" }
  | { type: "pricier" }
  | { type: "skip" }
  | null;

// O que transforma preferência de preço em ESCOLHA: verbo de pegar ("quero o mais
// barato") OU artigo definido apontando pra mesa ("o mais barato" = escolha elíptica).
// "mais barato" seco, sem verbo nem artigo, só mostra opções mais baratas.
const CHOICE_PICK_VERB_RE =
  /\b(quero|prefiro|peg[ao]|pegue|manda|me ve|me da|vou (?:de|no|na|com)|fico com|pode ser|vai de|escolho|leva|levo|compra)\b|(^|\s)[oa] mais (barat|car)/;

const CHOICE_STOP = new Set(["pode", "ser", "quero", "essa", "esse", "dessa", "desse", "por", "favor", "mais", "com", "sem", "pra", "para", "das", "dos", "vou", "manda", "prefiro", "melhor", "acho", "que", "entao", "aquele", "aquela", "tem", "cor", "versao", "tamanho", "tipo", "ver", "acha", "ache", "mostra", "procura", "busca", "outra", "outro", "outras", "outros", "alguma", "algum", "opcoes", "opcao"]);

export function parseChoiceReply(text: string, options: { name: string; unitPrice: number }[]): ChoiceReply {
  const n = normalizeMsg(text);
  if (!n || !options.length) return null;

  const bare = n.match(/^(?:opcao\s*|op\s*|numero\s*|n[o°º]?\s*|a\s+|o\s+)?([1-9])[\s).!]*$/);
  if (bare) {
    const idx = Number(bare[1]) - 1;
    return idx < options.length ? { type: "pick", index: idx } : null;
  }
  if (/\b(primeir[ao])\b/.test(n)) return { type: "pick", index: 0 };
  if (/\b(segund[ao])\b/.test(n) && options.length > 1) return { type: "pick", index: 1 };
  if (/\b(terceir[ao])\b/.test(n) && options.length > 2) return { type: "pick", index: 2 };
  if (/\b(ultim[ao])\b/.test(n)) return { type: "pick", index: options.length - 1 };
  if (/\b(d[oe] meio)\b/.test(n) && options.length === 3) return { type: "pick", index: 1 };
  if (/\b(mais car[ao])\b/.test(n)) {
    if (!CHOICE_PICK_VERB_RE.test(n)) return { type: "pricier" };
    const idx = options.reduce((best, o, i) => (o.unitPrice > options[best].unitPrice ? i : best), 0);
    return { type: "pick", index: idx };
  }
  // "esse mesmo"/"essa mesma" só é inequívoco com UMA opção na mesa.
  if (/^(ess[ea]( mesm[oa])?|isso( mesmo)?)[\s!.]*$/.test(n) && options.length === 1) {
    return { type: "pick", index: 0 };
  }
  // "qual você recomenda?", "escolhe você", "me sugere" — confiança na Lia = any.
  if (/\b(recomenda|sugere|indica|escolhe (voce|vc|ai|pra mim)|o que (voce|vc) acha melhor)\b/.test(n)) {
    return { type: "any" };
  }

  if (/\b(nenhum[a]?|pula|deixa (pra la|esse|essa)|esquece (esse|essa|ess[ea]s)?|sem esse|nao quero (ess[ea]|nenhum))\b/.test(n)) {
    return { type: "skip" };
  }
  if (/\b(mais barat[ao]|mais em conta|menor preco|baratinh[ao]|economic[ao])\b/.test(n)) {
    return CHOICE_PICK_VERB_RE.test(n) ? { type: "cheapest" } : { type: "cheaper" };
  }

  // Digit surrounded only by filler ("quero o 2 por favor", "pode ser a 2") — a pick.
  // A digit next to real words ("2 cocas") is NOT: that's a new item with a quantity.
  const digitAnywhere = n.match(/\b([1-9])\b/);
  if (digitAnywhere) {
    const leftover = n
      .replace(/\b[1-9]\b/, " ")
      .replace(/\b(quero|prefiro|vou|de|do|da|querer|me|ve|manda|pode|ser|opcao|op|numero|n|o|a|esse|essa|essa ai|ai|por|favor|pf+v?|mesmo|entao|acho|que|vai|fico|com)\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const idx = Number(digitAnywhere[1]) - 1;
    if (!leftover && idx < options.length) return { type: "pick", index: idx };
  }

  // Brand/name match BEFORE "qualquer": "pode ser a colgate" names an option, so the
  // "pode ser" must not degrade it to "any". Filler words don't count as name tokens.
  const tokens = n.split(" ").filter((t) => t.length > 2 && !CHOICE_STOP.has(t));
  if (tokens.length) {
    const scores = options.map((o) => {
      const name = normalizeMsg(o.name);
      return tokens.reduce((acc, t) => (name.includes(t) ? acc + 1 : acc), 0);
    });
    const max = Math.max(...scores);
    if (max > 0 && scores.filter((s) => s === max).length === 1) {
      return { type: "pick", index: scores.indexOf(max) };
    }
  }

  // "qualquer"/"pode ser" only means "you pick" when NOTHING meaningful follows —
  // "pode ser a de 2 litros" is a refinement, not a carte blanche (auto-buying option 1
  // when the customer named an attribute would charge them for the wrong product).
  if (/\b(qualquer|qualqer|tanto faz|qq um|pode ser|indiferente|voce escolhe|vc escolhe)\b/.test(n)) {
    const leftover = n
      .replace(/\b(qualquer|qualqer|tanto faz|qq um|pode ser|indiferente|voce escolhe|vc escolhe)\b/g, " ")
      .replace(/\b(um|uma|o|a|os|as|de|do|da|entao|mesmo|mesma|ai|dai|por|favor|pfv|sim|ok|serve|qual|desses|dessas)\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!leftover) return { type: "any" };
  }
  return null;
}

// "coca" quando as opções são [Fanta, Coca Lata, Coca Pet]: não é escolha única
// (parseChoiceReply exige match único) nem item novo — DISCRIMINA entre as opções.
// Devolve os índices das opções cujo nome contém TODAS as palavras significativas
// do texto (com tolerância a plural). Vazio = o texto não fala das opções.
export function narrowChoiceByName(text: string, options: { name: string }[]): number[] {
  const n = normalizeMsg(text);
  if (!n || !options.length) return [];
  // "coca não"/"não quero coca" é negação — não é discriminação entre opções.
  if (/\bnao\b/.test(n)) return [];
  const tokens = n.split(" ").filter((t) => t.length > 2 && !CHOICE_STOP.has(t) && !/^\d+$/.test(t));
  if (!tokens.length) return [];
  const hits: number[] = [];
  options.forEach((o, i) => {
    const name = normalizeMsg(o.name);
    const all = tokens.every((t) => name.includes(t) || (t.endsWith("s") && name.includes(t.slice(0, -1))));
    if (all) hits.push(i);
  });
  return hits;
}

// "algum até 150 reais?", "tem por menos de R$ 50?" — teto de PREÇO durante a escolha.
// Exige marcador de dinheiro (r$ / reais / conto / pila), senão "até 2" viraria preço.
export function parsePriceCap(text: string): number | null {
  const n = normalizeMsg(text);
  const m = n.match(
    /\b(?:ate|abaixo de|menos de|no maximo|max(?:imo)?)\s*(?:uns\s+)?(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(reais|real|conto|contos|pila|pilas)?\b/
  );
  if (!m) return null;
  const hasCurrency = Boolean(m[2]) || /r\$/.test(n);
  if (!hasCurrency) return null;
  const value = Number(m[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// "vinho até 40 reais" no PEDIDO inicial: o teto sai da frase de busca (senão "ate 40
// reais" vira token de busca) e vira filtro de preço aplicado ao preço EXIBIDO.
export function splitPriceCap(phrase: string): { phrase: string; cap: number | null } {
  const cap = parsePriceCap(phrase);
  if (cap == null) return { phrase, cap: null };
  const cleaned = phrase
    .replace(/\b(?:de\s+)?(?:ate|até|abaixo de|menos de|no m[aá]ximo|max(?:imo)?)\s*(?:uns\s+)?(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:reais|real|conto|contos|pila|pilas)?\b/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { phrase: cleaned || phrase, cap };
}

// "quanto deu tudo?", "qual o total?", "resumo" — pergunta pelo PARCIAL da cesta,
// não é produto nem escolha. Usada nos steps de escolha/coleta.
const RUNNING_TOTAL_RE =
  /\b(quanto (deu|da|ta|esta|fica|ficou|foi|custou) ?(tudo|o total|o pedido|a compra)?|qual( e| o)? total|total (ate agora|parcial|do pedido)|resumo (do pedido|da compra|do carrinho)?|(o que|q) tem no (carrinho|pedido)|meu carrinho)\b|^total[\s?!.]*$|^resumo[\s?!.]*$/;
export function asksRunningTotal(text: string): boolean {
  return RUNNING_TOTAL_RE.test(normalizeMsg(text));
}
