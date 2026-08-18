# Todas as mensagens automáticas da Lia — atual vs. proposta

Levantamento de 17/08/2026. Fonte: `src/lib/lia-copy.ts` (quase tudo),
`src/lib/delivery-service.ts` (3 strings soltas), `src/lib/adapters/whatsapp.ts`
(rótulos de botão e cards), `src/lib/payments/whatsapp-pay.ts` (1 string solta).

**HOJE** = o que está no ar. **NOVA** = proposta. Se aprovar em bloco eu aplico tudo;
se quiser mexer em alguma, escreve por cima da NOVA que eu uso a sua.

## Régua aplicada nas propostas

1. **Verbo na frente, resultado primeiro.** O cliente lê a primeira linha e já sabe o que aconteceu.
2. **Sem preâmbulo de simpatia.** Corta "Prontinho", "Opa", "Deixa comigo", "Poxa", "Claro!", "Boa!", "Fechado!", "Sem problema".
3. **Sem explicar a mecânica interna.** O cliente não quer saber quantas lojas parceiras existem, que o frete sai por distância, que o cartão é tokenizado pela Pagar.me, ou por que a cotação venceu.
4. **1 emoji no máximo, e só onde carrega informação** (📍 endereço, 🛵 entrega, ✅ confirmado). A maioria fica sem nenhum.
5. **Uma pergunta por mensagem.** Nunca oferecer 3 saídas quando 1 resolve.
6. **Não repetir o que já foi dito** na mensagem anterior nem o que o botão já diz.
7. **Não pedir desculpa duas vezes** nem justificar. Diz o que dá pra fazer.
8. **Sem lista de exemplos.** O `EXAMPLES` (`"arroz, ração do meu cachorro e um carregador de iPhone"`) sai de todas as 9 mensagens onde aparecia. A pergunta aberta basta.
9. **Sem "estado de São Paulo"** no texto de boas-vindas. Só continua onde a área É a resposta (pergunta "vocês entregam onde?" e as duas recusas de cobertura) — ver nota na seção 9.
10. **💚 de 8 → 2 ocorrências** (–75%): fica só na saudação e no agradecimento.
11. **Nunca prometer prazo antes de cotar.** Quem manda no prazo é o checkout da loja, e ele varia — às vezes é no mesmo dia, às vezes não. Então some "chega hoje", "entrego hoje", "no mesmo dia", "em ~1h" e "1 a 2 horas" de toda mensagem genérica. O prazo aparece **uma vez só**: no resumo do pedido, com o número real que a loja devolveu. Antes disso a Lia diz que *mostra* o prazo, não qual é.

Variáveis entre `{}` são preenchidas em runtime. `*texto*` = negrito no WhatsApp,
`_texto_` = itálico. `{areaLabel}` = hoje "o estado de São Paulo".

---

## 1. Social / abertura

### greeting — cliente manda "oi"
**HOJE**
> Oi! 💚 Sou a Lia — você me pede *qualquer coisa* por aqui (mercado, pet, farmácia sem remédio, papelaria, presente…), eu compro e chega na sua casa hoje mesmo, em qualquer endereço do estado de São Paulo.
>
> Me diz o que você precisa — ex.: {EXAMPLES}.

**NOVA** _(texto do dono, 17/08)_
> Oi! Sou a Lia 💚 Me pede qualquer coisa que eu compro e entrego para você.

---

### greetingMidOrder — "oi" no meio de um pedido
**HOJE**
> a) Oi de novo! 💚 Seu pedido está só esperando o pagamento — responde *pagar* se precisar do código de novo.
> b) Oi de novo! 💚 Sua cesta tem {n} itens — me diz o que mais precisa, ou responde *pagar* pra fechar.
> c) Oi de novo! 💚 Me diz o que você precisa hoje — ex.: {EXAMPLES}.

**NOVA**
> a) Oi! Seu pedido só falta pagar. Responde *pagar* que eu mando o código.
> b) Oi! Sua cesta tem {n} itens. Manda mais algum, ou responde *pagar* pra fechar.
> c) Oi! O que você precisa hoje?

---

### thanks — cliente agradece
**HOJE**
> Imagina! 💚 Qualquer coisa é só chamar.

**NOVA**
> Imagina! Qualquer coisa é só chamar 💚

---

### help — "como funciona?"
**HOJE**
> Eu compro *qualquer coisa* pra você — mercado, pet, beleza, farmácia (sem remédio), papelaria, eletrônicos, presente… — e entrego hoje dentro do estado de São Paulo. 💚 Funciona assim:
>
> 1. Me diz o que precisa — ex.: {EXAMPLES}
> 2. Eu mostro o total com frete
> 3. Você paga por Pix ou cartão
> 4. Chega na sua casa em ~1h 🛵
>
> Também entendo *status* (acompanhar o pedido), *trocar endereço*, *tira o item X* e *repete o de sempre*. Antes de pagar, você pode limpar a lista.

**NOVA**
> Funciona assim:
>
> 1. Você me diz o que precisa
> 2. Eu mostro o total, o frete e o prazo
> 3. Você paga por Pix ou cartão
> 4. Eu compro e acompanho até chegar 🛵
>
> Também entendo *status*, *trocar endereço*, *tira o item X* e *repete o de sempre*.
>
> O que você precisa?

_Nota: o passo 4 era "Chega em ~1h". Virou o que a Lia de fato garante. O prazo real entra no passo 2, junto do total._

---

### didNotUnderstand — mensagem sem intenção reconhecida
**HOJE**
> Não entendi seu pedido 🤔. Me diz os itens que você quer, ex.: {EXAMPLES}.

**NOVA**
> Não entendi. Me diz os itens que você quer.

---

### askWhatYouWant — "quero", "queria comprar" sem dizer o quê
**HOJE**
> Opa, deixa comigo! 🙂 Me diz o que você precisa — ex.: {EXAMPLES}.

**NOVA**
> Me diz o que você precisa.

---

### conciergeAskWhatYouWant — mesma coisa, fluxo concierge
**HOJE**
> Deixa comigo! 🙂 Me diz o que você precisa — pode ser de qualquer lugar, junto numa mensagem só. Ex.: {EXAMPLES}.

**NOVA**
> Me diz o que você precisa.

---

### genericError — erro interno
**HOJE**
> Tive um probleminha aqui agora 🙏. Pode mandar de novo em instantes?

**NOVA**
> Deu um erro aqui. Manda de novo em instantes?

---

## 2. Onboarding e endereço

### welcomeAskCep — primeira mensagem, pede CEP
**HOJE**
> Oi! 💚 Sou a Lia — faço suas compras do dia a dia e entrego em casa no estado de São Paulo. {Já anotei: • item} Pra começar, me manda seu *CEP*? Configuro uma vez só e uso em todos os pedidos. 📍

**NOVA**
> Oi! Sou a Lia. Me pede qualquer coisa que eu compro e entrego para você.
>
> {Já anotei: • item}
> Me manda seu *CEP*? Só peço uma vez. 📍

---

### welcomeAddressButton — abertura com botão "Cadastrar endereço"
**HOJE**
> Oi! 💚 Sou a Lia. Eu busco suas compras e entrego hoje mesmo no estado de São Paulo. Pra começar, vamos cadastrar e verificar seu endereço — você só faz isso uma vez.

**NOVA**
> Oi! Sou a Lia. Me pede qualquer coisa que eu compro e entrego para você.
>
> Cadastra seu endereço aí embaixo — só uma vez.

---

### welcomeAskFullDeliveryAddress — abertura pedindo endereço completo
**HOJE**
> Oi! 💚 Sou a Lia — faço suas compras do dia a dia e entrego em casa no estado de São Paulo. {Já anotei: …} Antes do primeiro pedido, me manda seu *endereço completo* (rua, número, bairro e cidade). Eu salvo uma vez e só confirmo no resumo dos próximos pedidos. 📍

**NOVA**
> Oi! Sou a Lia. Me pede qualquer coisa que eu compro e entrego para você.
>
> {Já anotei: • item}
> Me manda seu *endereço completo* com CEP — rua, número, bairro e cidade. Só peço uma vez. 📍

---

### askCepAgain — 2ª+ vez pedindo endereço
**HOJE**
> Só falta o *endereço completo com o CEP* pra eu calcular a entrega — ex.: _Rua Beta, 221, ap 13, Pinheiros, São Paulo - SP, 01233-020_. 📍

**NOVA**
> Falta seu *endereço completo com CEP* — rua, número, complemento, bairro, cidade e CEP 📍

---

### askNewCep — "trocar endereço"
**HOJE**
> Claro! Me manda o *endereço completo com o CEP* — ex.: _Rua Beta, 221, ap 13, Pinheiros, São Paulo - SP, 01233-020_. 📍

**NOVA**
> Manda o *endereço novo com CEP* — rua, número, complemento, bairro, cidade e CEP 📍

---

### askFullDeliveryAddress — tem CEP, falta rua/número
**HOJE**
> Perfeito! Só falta o resto do endereço pro entregador achar você: *rua, número e complemento* (ex.: _Rua Beta, 221, ap 13_). 📍

**NOVA**
> Falta o *endereço*: rua, número e complemento 📍

_Nota: a palavra "endereço" voltou depois do eval. A mensagem chega logo após o cliente mandar um produto em vez do endereço — sem o substantivo, a frase não diz de que assunto ela é._

---

### addressSavedAskCep — tem endereço, falta CEP
**HOJE**
> 📍 Endereço salvo! Só falta o *CEP* (ex.: 01310-100) — é com ele que eu calculo o frete. Depois não peço mais nada disso: uso o mesmo em todos os pedidos. 🙂

**NOVA**
> 📍 Endereço salvo. Falta o *CEP*.

---

### notedAskCep — anotou itens, falta CEP
**HOJE**
> ✅ Anotei:
> • {item}
>
> Agora só falta seu *CEP* (ex.: 01310-100) 📍 que eu busco tudo.

**NOVA**
> ✅ Anotei:
> • {item}
>
> Falta seu *CEP* 📍

---

### askCepForQuote — itens na mão, pedindo CEP
**HOJE**
> Anotei:
> • {item}
>
> Qual seu *CEP*? Assim calculo o frete e o prazo certinhos. 📦

**NOVA**
> Anotei:
> • {item}
>
> Qual seu *CEP*? 📍

---

### addressSavedAskItems — endereço salvo, pede itens
**HOJE**
> 📍 Endereço salvo: {endereço}. Vou usar ele em todos os seus pedidos (se mudar, é só dizer "trocar endereço").
>
> Agora me diz o que você quer — ex.: {EXAMPLES}.

**NOVA**
> 📍 Endereço salvo: {endereço}
> _Pra mudar depois, é só dizer "trocar endereço"._
>
> O que você quer?

---

### addressSavedPrefix — prefixo curto
**HOJE**
> 📍 Endereço salvo: {endereço} — CEP {cep}.

**NOVA**
> 📍 Endereço salvo: {endereço} — CEP {cep}

---

### addressUpdated — endereço trocado
**HOJE**
> 📍 Prontinho, endereço atualizado: {endereço} — CEP {cep}.

**NOVA**
> 📍 Endereço atualizado: {endereço} — CEP {cep}

---

### addressUpdatedQuoteContinues — trocou com cotação em andamento
**HOJE**
> 📍 Prontinho, endereço atualizado: {endereço}. Sua cotação continua valendo — já avisei aqui e o total vem calculado pro endereço novo.

**NOVA**
> 📍 Endereço atualizado: {endereço}
> Sua cotação continua valendo — o total já sai pro endereço novo.

---

### quoteDroppedForNewAddress — cotação caiu por troca de endereço
**HOJE**
> Beleza! Como o frete depende do endereço, cancelei essa cotação (não cobrei nada) e refaço com o endereço novo. 📍

**NOVA**
> Cancelei a cotação anterior — nada foi cobrado. Já refaço com o endereço novo 📍

---

### addressChangeNeedsCancel — trocar endereço com pagamento gerado
**HOJE**
> Seu pedido já está com o pagamento gerado pra esse endereço 😅 Me manda *cancelar* primeiro (não foi cobrado nada) e aí refazemos com o endereço novo.

**NOVA**
> O pagamento já foi gerado pro endereço antigo. Responde *cancelar* (nada foi cobrado) que eu refaço com o novo.

---

### cepNotFound — CEP inválido
**HOJE**
> Hmm, não achei o CEP {cep} 🤔. Confere se está certinho (ex.: 01310-100) e me manda de novo?

**NOVA**
> Não achei o CEP {cep}. Confere e manda de novo.

---

### outsideCoverage — fora da área
**HOJE**
> Ah, que pena — a Lia ainda não chega em {cidade} 😔.
> Por enquanto eu entrego só em *{areaLabel}*.
>
> Mas já anotei seu contato aqui 📍 — assim que a gente chegar na sua região, te chamo na hora! 💚

**NOVA**
> Ainda não chego em {cidade} — hoje entrego só em *{areaLabel}* 😔
>
> Anotei seu contato: quando eu chegar na sua região, te chamo.

---

### tooFarForDelivery — cidade atendida, endereço longe
**HOJE**
> Eu até atendo em {cidade}, mas ele ficou longe demais das lojas parceiras que eu tenho por perto 😔.
> Assim eu não conseguiria te entregar hoje sem te cobrar um frete que não vale a pena.
>
> Já anotei seu contato 📍 — assim que abrir uma loja mais pertinho de você, te chamo na hora! 💚

**NOVA**
> Atendo {cidade}, mas seu endereço ficou longe demais das lojas que tenho por perto — o frete não valeria a pena 😔
>
> Anotei seu contato: quando abrir uma loja mais perto, te chamo.

---

## 3. Busca / montagem da cesta

### searching — começou a buscar
**HOJE**
> 🔎 Procurando aqui, um instante…

**NOVA**
> 🔎 Procurando…

---

### searchingWider — busca passou de ~2,5s
**HOJE**
> 🔎 Procurando as melhores opções pra você…

**NOVA**
> 🔎 Procurando as melhores opções…

---

### itemsNotFound — não achou no catálogo
**HOJE**
> Não achei {itens} no catálogo de hoje 🤔. Se quiser, me manda uma marca, tamanho ou versão específica que eu tento de novo.

**NOVA**
> Não achei {itens}. Me diz uma marca ou tamanho que eu tento de novo.

---

### itemsNotAvailable (1 item) — não tem em nenhuma loja
**HOJE**
> Procurei *{item}* nas lojas parceiras e hoje eu não tenho como trazer 🙏 Se quiser, me diz uma marca ou versão diferente que eu tento de novo — ou me pede outra coisa!

**NOVA**
> *{item}* eu não consigo trazer hoje. Me diz outra marca ou versão que eu tento de novo.

---

### itemsNotAvailable (vários)
**HOJE**
> Esses eu procurei nas lojas parceiras e hoje não tenho como trazer 🙏
> • {item}
>
> Se quiser, me diz marcas ou versões diferentes que eu tento de novo — ou me pede outra coisa!

**NOVA**
> Esses eu não consigo trazer hoje:
> • {item}
>
> Me diz outras marcas ou versões que eu tento de novo.

---

### notFoundNote — rodapé do resumo
**HOJE**
> _Não achei: {itens} — me fala de outro jeito que eu procuro._

**NOVA**
> _Não achei: {itens}. Me fala de outro jeito que eu procuro._

---

### noMedicine — pediu remédio
**HOJE**
> Remédio eu não consigo trazer (por lei, só farmácia pode vender) 🙏. Mas fora isso eu busco de tudo: mercado, higiene, beleza, pet, papelaria, eletrônicos, presente, bebida… — o que você precisa?

**NOVA**
> Remédio eu não posso vender — por lei, só farmácia pode. Fora isso eu trago de tudo. O que mais você precisa?

---

### medicineSkippedNote — remédio no meio da lista
**HOJE**
> _Só não consigo trazer remédio (por lei, só farmácia vende) — deixei ele de fora._

**NOVA**
> _Remédio eu não posso vender, então deixei ele de fora._

---

### autoAddedNote — itens entraram sem escolha
**HOJE**
> ✅ Já anotei: {itens}.

**NOVA**
> ✅ Anotei: {itens}

---

### askMoreItems — cliente quer somar mais
**HOJE**
> Claro! Sua cesta continua salva. Me diz o que mais você quer adicionar. 🙂

**NOVA**
> Sua cesta está salva. O que mais você quer?

---

### conciergeKeepAdding — lista segue aberta
**HOJE**
> Quer mais alguma coisa? Manda que eu somo. Quando fechar a lista, é só dizer *"só isso"* que eu coto o total com a entrega. 🙂

**NOVA**
> Quer mais alguma coisa? Quando fechar, diz *"só isso"* que eu mando o total.

---

### conciergeChooseNext — mesma coisa com botões
**HOJE**
> Quer fechar e pagar, somar mais itens ou cancelar? É só tocar embaixo — ou mandar o próximo item direto. 🙂

**NOVA**
> Escolhe aí embaixo — ou manda o próximo item direto.

---

### cartCleared — limpou o carrinho
**HOJE**
> Prontinho, limpei seu carrinho! 🧹 Me diz o que você quer agora.

**NOVA**
> Carrinho limpo. O que você quer agora?

---

### removedItems — tirou item
**HOJE**
> a) Pronto, tirei {itens}. Sua cesta ficou vazia — me diz o que você quer. 🙂
> b) Pronto, tirei {itens}.

**NOVA**
> a) Tirei {itens}. Sua cesta ficou vazia — o que você quer?
> b) Tirei {itens}.

---

### removeNotFound — item não está na cesta
**HOJE**
> Não achei esse item na sua cesta 🤔. Me diz o nome como está na lista que eu tiro pra você.

**NOVA**
> Não achei esse item na sua cesta. Me diz o nome como está na lista.

---

### swapAskWhat — "troca o X"
**HOJE**
> Trocar {X} por qual produto? Me diz que eu busco. 🙂

**NOVA**
> Trocar {X} por qual?

---

### swapRemovedPrefix
**HOJE**
> Troquei: tirei {X}.

**NOVA**
> Tirei {X}.

---

### swappedFor
**HOJE**
> Troquei {X} por {Y}. ✅

**NOVA**
> ✅ Troquei {X} por {Y}.

---

### moreOfSameAdded — "mais três do mesmo"
**HOJE**
> ✅ Adicionei mais {n} — agora são {total}x {item}. Quer mais alguma coisa? Quando fechar, é só dizer *"só isso"*. 🙂

**NOVA**
> ✅ Agora são {total}x {item}. Quer mais alguma coisa? Quando fechar, diz *"só isso"*.

---

### qtyAdjusted — número solto ajusta a quantidade
**HOJE**
> ✅ Ajustei: {n}x {item}. Quer mais alguma coisa? Quando fechar, é só dizer *"só isso"*. 🙂

**NOVA**
> ✅ Ajustei: {n}x {item}. Quer mais alguma coisa? Quando fechar, diz *"só isso"*.

_Nota: o "Ajustei" voltou depois do eval. Sem ele a mensagem vira sósia do `choiceConfirmed` ("✅ 5x Bombom") e o cliente não distingue **correção de quantidade** de **item novo**._

---

### quantityAsk — pergunta quantidade (fallback sem botão)
**HOJE**
> Quantas unidades de *{item}*? Responde *1*, *2*, *3* ou digita outra quantidade.

**NOVA**
> Quantas unidades de *{item}*? Responde o número.

---

### quantityAskFree — tocou em "Outra quantidade"
**HOJE**
> Me diz quantas unidades de *{item}* você quer (de 1 a 50) 🙂

**NOVA**
> Quantas unidades de *{item}*? (de 1 a 50)

---

### hardcoded (delivery-service.ts:1134) — quantidade fora do intervalo
**HOJE**
> Me diz uma quantidade entre 1 e 50 🙂

**NOVA**
> Só consigo de 1 a 50 unidades. Quantas?

---

### cartExpired — lista antiga expirou
**HOJE**
> _Sua lista anterior expirou, então comecei uma nova pra evitar erro. Seu endereço continua salvo._

**NOVA**
> _Sua lista anterior expirou — comecei uma nova. Seu endereço continua salvo._

---

### queuedItemsNote — item anotado enquanto escolhe outro
**HOJE**
> Anotei *{item}*, *{item}* pra gente escolher já já 😉

**NOVA**
> Anotei *{item}*, *{item}* — a gente escolhe em seguida.

---

### addedToPendingQuote — item pedido durante a cotação
**HOJE**
> Anotei e já incluí na cotação: 📝
> • {item}
>
> Te mando o total com tudo junto em instantes! 🙂

**NOVA**
> Incluí na cotação:
> • {item}
>
> Mando o total com tudo junto em instantes.

---

## 4. Escolha de opções

### choicesHeader
**HOJE**
> Achei essas opções de *{busca}*:

**NOVA**
> Opções de *{busca}*:

---

### choiceLine — cada linha
**HOJE**
> *1)* {produto} — R$ 00,00 · _{prazo}_

**NOVA**
> *1)* {produto} — R$ 00,00 · _{prazo}_

---

### choicesAsk (1 opção)
**HOJE**
> Responde *1* pra confirmar — ou *qualquer* que eu escolho, *outras* que eu mostro mais, ou *pula* pra deixar de fora. 🙂

**NOVA**
> Responde *1* pra confirmar, *outras* pra ver mais, ou *pula* pra deixar de fora.

---

### choicesAsk (várias)
**HOJE**
> Responde *1*, *2* ou *3* — ou *qualquer* que eu escolho, *outras* que eu mostro mais, ou *pula* pra deixar de fora. 🙂

**NOVA**
> Responde *1*, *2* ou *3* — ou *outras* pra ver mais, *pula* pra deixar de fora.

_Nota: cortei o "*qualquer*" da instrução. O comando continua funcionando pra quem digitar; só sai da mensagem, que estava oferecendo 4 saídas de uma vez._

---

### choiceSequence — vários itens em fila
**HOJE**
> Encontrei os {n} itens. Vou te mostrar um de cada vez pra ficar fácil — primeiro *{item1}* e depois *{item2}*, *{item3}*.

**NOVA**
> Achei os {n} itens. Vamos um de cada vez: *{item1}*, depois *{item2}* e *{item3}*.

---

### nextChoiceHeader — próximo da fila
**HOJE**
> Agora vamos escolher *{item}*. Depois ainda falta escolher {n}.

**NOVA**
> Agora *{item}* — depois faltam {n}.

---

### moreChoicesHeader — "mostra outras"
**HOJE**
> Claro! Mais opções de *{busca}*:

**NOVA**
> Mais opções de *{busca}*:

---

### noMoreOptions — acabaram as opções
**HOJE**
> Essas são todas as opções de *{busca}* que eu tenho por aqui 🙏 Se alguma servir, responde o número — ou *pula* que eu sigo sem esse item.

**NOVA**
> Essas são todas as opções de *{busca}* que eu tenho. Responde o número, ou *pula* pra seguir sem esse item.

---

### refineNoResult — refinou e não achou
**HOJE**
> Procurei *{refinado}* e não achei por aqui 🙏 O que eu tenho são essas:

**NOVA**
> Não achei *{refinado}*. O que eu tenho é isso:

---

### narrowedChoices — estreitou as opções
**HOJE**
> Boa, ficou entre essas de *{busca}*:

**NOVA**
> Ficou entre essas de *{busca}*:

---

### nonePriceCap — nada cabe no teto
**HOJE**
> Dessas aqui, nenhuma sai por até R$ {teto} 😕 Responde *mais barato* que eu pego a mais em conta, ou *mais opções* que eu procuro outras.

**NOVA**
> Nenhuma dessas sai por até R$ {teto}. Responde *mais barato* ou *mais opções*.

---

### choiceConfirmed — escolheu
**HOJE**
> a) ✅ {n}x {produto}.
> b) ✅ {produto}.

**NOVA**
> a) ✅ {n}x {produto}
> b) ✅ {produto}

---

### choiceSkipped — "pula"
**HOJE**
> Tranquilo, deixei *{busca}* de fora. Se quiser, me diz de outro jeito que eu procuro de novo.

**NOVA**
> Deixei *{busca}* de fora. Se quiser, me diz de outro jeito que eu procuro.

---

### choiceNotUnderstood — resposta ambígua
**HOJE**
> Não peguei qual você quer 🤔.

**NOVA**
> Não peguei qual você quer. Responde o número.

_Nota: aqui eu ADICIONEI, não cortei — a mensagem atual não diz o que fazer._

---

### rejectedAskAgain — "não era isso"
**HOJE**
> Sem problema! Me diz de outro jeito o que você procura (marca, tamanho…) que eu acho a opção certa. 🙂

**NOVA**
> Me diz de outro jeito — marca, tamanho — que eu procuro.

---

### finishChoiceFirst — mandou fechar com escolha pendente
**HOJE**
> Só me confirma esse item primeiro que aí eu fecho tudo. 🙂

**NOVA**
> Confirma esse item primeiro que aí eu fecho.

---

### donePickPayment — "só isso" com pedido fechado
**HOJE**
> Fechado, pedido completo! 🙌

**NOVA**
> Pedido completo. Escolhe abaixo como quer pagar.

_Nota: também é adição — a atual encerra sem dizer o próximo passo._

---

## 5. Resumo e cotação

### summary — resumo com preço por linha
**HOJE**
> 🛒 *Seu pedido:*
> • 2x {produto} — R$ 00,00
>
> Produtos: R$ 00,00
> 📦 Entrega: R$ 00,00 · chega em ~40 min
> *Total: R$ 00,00*
>
> _Não achei: {itens} — me fala de outro jeito que eu procuro._
>
> _Este pedido usa {n} lojas. O frete acima já soma as {n} retiradas._
>
> 📍 *Entrega em:* {endereço}
> _Confere este endereço? Para mudar, diga "trocar endereço"._
>
> Se estiver tudo certo, escolha abaixo como prefere pagar. 💚
> _Quer mudar algo antes? "tira o arroz", "troca X por Y" ou simplesmente manda mais itens._

**NOVA**
> 🛒 *Seu pedido:*
> • 2x {produto} — R$ 00,00
>
> Produtos: R$ 00,00
> Entrega: R$ 00,00 · {prazo real da loja}
> *Total: R$ 00,00*
>
> _Não achei: {itens}. Me fala de outro jeito que eu procuro._
>
> _Frete de {n} lojas já somado._
>
> 📍 {endereço}
> _Pra mudar, diz "trocar endereço"._
>
> Escolhe abaixo como quer pagar.
> _Quer ajustar? "tira o arroz", "troca X por Y", ou manda mais itens._

---

### manualQuoteSummary — cotação manual (sem preço por linha)
**HOJE**
> 🛒 *Seu pedido:*
> • 2x {produto}
>
> Produtos: R$ 00,00
> 📦 Entrega: R$ 00,00 · chega em ~90 min 🛵
> *Total: R$ 00,00*
>
> 📍 *Entrega em:* {endereço}
> _Confere o endereço? Para mudar, diga "trocar endereço"._
>
> Se estiver tudo certo, escolha abaixo como prefere pagar. 💚

**NOVA**
> 🛒 *Seu pedido:*
> • 2x {produto}
>
> Produtos: R$ 00,00
> Entrega: R$ 00,00 · {prazo real da loja}
> *Total: R$ 00,00*
>
> 📍 {endereço}
> _Pra mudar, diz "trocar endereço"._
>
> Escolhe abaixo como quer pagar.

---

### ⚠️ Problema no CÓDIGO, não na copy — o prazo inventado

As duas mensagens acima montam o prazo assim, hoje:

- `summary`: `chega em ~${etaMinutes ?? 40} min`
- `manualQuoteSummary`: `chega em ~${etaMinutes ?? 90} min`

Quando a loja **não** devolve prazo, esse `?? 40` e `?? 90` fazem a Lia escrever
"chega em ~40 min" sem ter nenhuma base pra isso. É o número inventado que o cliente lê
como promessa — e é o que vira reclamação quando não chega.

Pior: na cotação instantânea o `deliveryPromise` que sai hoje é literalmente
`"pela própria loja"` ([delivery-service.ts:3263](src/lib/delivery-service.ts:3263)) — ou
seja, o cliente recebe *quem* entrega e nenhum prazo.

**Proposta:** cortar os fallbacks `?? 40` e `?? 90`. Sem prazo real da loja, a linha vira só

> Entrega: R$ 00,00

e o prazo entra depois, quando a loja confirmar:

> 📦 Prazo confirmado pela loja: {prazo}

Isso é mudança de comportamento, não só de texto — por isso está separado aqui. Me diz se
aplico junto ou deixo pra um segundo passo.

---

### partialTotal — "quanto deu até agora?"
**HOJE**
> 🛒 *Até agora:*
> • 2x {produto} — R$ 00,00
>
> Produtos: R$ 00,00
> _Falta escolher 2 itens — aí te passo o total com a entrega._
>
> (sem pendências) _Te passo o total com a entrega quando você fechar — é só dizer *"só isso"*._
>
> (cesta vazia) Ainda não fechamos nenhum item 🙂 Me responde as opções que eu te passo o total certinho, com a entrega.

**NOVA**
> 🛒 *Até agora:*
> • 2x {produto} — R$ 00,00
>
> Produtos: R$ 00,00
> _Faltam 2 itens pra escolher. Aí sai o total com a entrega._
>
> (sem pendências) _Diz *"só isso"* que eu mando o total com a entrega._
>
> (cesta vazia) Nenhum item fechado ainda. Responde as opções que eu mando o total.

---

### totalAwaitingPayment — "quanto deu?" com cobrança aberta
**HOJE**
> O total ficou em *R$ 00,00* — só falta o pagamento 🙂 Quer o código de novo? Responde *pix* (ou *cartão*, se preferir o link).

**NOVA**
> Total: *R$ 00,00* — só falta pagar. Responde *pix* ou *cartão* que eu mando de novo.

---

### currentFee — "vai mudar o frete?"
**HOJE**
> No seu pedido atual a entrega tá em *R$ 00,00* 🛵 Se mudar o endereço ou a cesta, eu recalculo e te mostro de novo.

**NOVA**
> A entrega do seu pedido está em *R$ 00,00*. Se mudar endereço ou cesta, eu recalculo.

---

### freteChoice — escolha de frete
**HOJE**
> Como prefere a entrega? 🛵
> *1)* Mais barata — R$ 00,00 · chega em ~{n} min
> *2)* Mais rápida — R$ 00,00 · chega em ~{n} min
>
> Responde *1* ou *2*.

**NOVA**
> Como prefere a entrega?
> *1)* Mais barata — R$ 00,00 · ~{n} min
> *2)* Mais rápida — R$ 00,00 · ~{n} min

_Nota: o "Responde 1 ou 2" some porque a numeração já diz. Se for fallback sem botão, mantenho a linha._

---

### minimumOrder — cesta abaixo do mínimo
**HOJE**
> 🛒 *Itens de {loja}:*
> • 2x {produto} — R$ 00,00
>
> Produtos ({loja}): R$ 00,00
>
> Essa loja pede um mínimo de *R$ 00,00* em produtos — falta só *R$ 00,00*. Me manda mais um itenzinho de lá que eu fecho pra você! 🙂
>
> _O resto da sua cesta continua guardado:_
> • 1x {produto} — R$ 00,00

**NOVA**
> 🛒 *Itens de {loja}:*
> • 2x {produto} — R$ 00,00
>
> Produtos ({loja}): R$ 00,00
>
> A {loja} tem pedido mínimo de *R$ 00,00* — faltam *R$ 00,00*. Manda mais um item de lá que eu fecho.
>
> _O resto da sua cesta continua guardado:_
> • 1x {produto} — R$ 00,00

---

### minimumDeadEnd — "só isso" abaixo do mínimo
**HOJE**
> Entendi! Só que a loja não fecha pedido abaixo de *R$ 00,00* em produtos — falta *R$ 00,00* 😕
>
> Me manda mais um itenzinho barato (um sal, um fósforo, um biscoito…) que eu fecho — ou responde *cancelar* se preferir deixar pra depois. 🙂

**NOVA**
> A loja não fecha abaixo de *R$ 00,00* — faltam *R$ 00,00*.
>
> Manda mais um item barato que eu fecho, ou responde *cancelar*.

---

### deliveryQuoteUnavailable — não conseguiu cotar o frete
**HOJE**
> Não consegui confirmar o valor da entrega agora 🙏. Não vou te mostrar um frete estimado. Tenta de novo em instantes que eu faço uma nova cotação em tempo real.

**NOVA**
> Não consegui confirmar o valor da entrega agora — e não quero te passar um valor chutado. Tenta de novo em instantes.

---

### quoteValidFor — validade
**HOJE**
> Essa cotação fica válida por {n} min. Se estiver tudo certo, escolhe Pix ou cartão para eu gerar o pagamento. 💚

**NOVA**
> Cotação válida por {n} min. Escolhe Pix ou cartão pra eu gerar o pagamento.

---

### quoteExpired — cotação venceu
**HOJE**
> Essa cotação venceu porque preço, estoque e prazo da loja podem mudar rápido. Vou montar uma nova antes de cobrar qualquer valor. 🙂

**NOVA**
> Essa cotação venceu. Monto uma nova antes de cobrar qualquer coisa.

---

### staleQuoteRestart — pedido parado 1h+
**HOJE**
> Aquele pedido *#{id}* ficou um tempão parado, então cancelei pra não te atrapalhar (não cobrei nada) 👍 Bora recomeçar!

**NOVA**
> Cancelei o pedido *#{id}* por inatividade — nada foi cobrado. Bora recomeçar.

---

### orderReopened — item novo depois do total
**HOJE**
> Deixa comigo! Atualizei seu pedido com o item novo — o total anterior não vale mais, segue o novo resumo 👇

**NOVA**
> Atualizei seu pedido. O total anterior não vale mais — segue o novo 👇

---

### operatorQuoteRequested — foi pra cotação manual
**HOJE**
> Fechado! Recebi seu pedido:
> • {item}
>
> Um dos itens precisa de uma conferência rápida de estoque/entrega na loja, então o total não sai automático desta vez — nossa equipe confere agora e te mando preço, entrega e prazo por aqui pra você aprovar. Não cobro nada antes disso. 💚

**NOVA**
> Recebi seu pedido:
> • {item}
>
> Um dos itens precisa de conferência na loja, então o total não sai automático. Mando preço, entrega e prazo em instantes pra você aprovar — nada é cobrado antes disso.

---

### operatorQuoteStillWorking — cliente escreve durante a cotação
**HOJE**
> Ainda estou cotando seu pedido 🙂 Já te mando o total com a entrega e o prazo em instantes — segura aí!

**NOVA**
> Ainda estou cotando. Mando o total com entrega e prazo em instantes.

---

### supplierValidationStarted — validando o carrinho
**HOJE**
> Perfeito — estou confirmando agora itens, frete, prazo e total direto na loja. Assim que o carrinho estiver validado, te mostro a cotação final antes do pagamento. 🛒

**NOVA**
> Confirmando itens, frete e prazo na loja. Te mostro o total final antes do pagamento.

---

### supplierValidationPending
**HOJE**
> Ainda estou confirmando o carrinho na loja. Não precisa pagar nada agora — te aviso assim que estiver pronto. 🛒

**NOVA**
> Ainda confirmando na loja. Não precisa pagar nada agora — te aviso quando estiver pronto.

---

## 6. Pagamento

### paymentMethod — forma de pagamento (fallback texto)
**HOJE**
> Como prefere pagar? 💳
> *1)* Pix — R$ 00,00 _(sem taxa, cai na hora)_
> *2)* Cartão — R$ 00,00 _(com a taxa da maquininha)_
>
> Responde *pix* ou *cartão* (ou 1/2).

**NOVA**
> Como prefere pagar?
> *1)* Pix — R$ 00,00 _(sem taxa)_
> *2)* Cartão — R$ 00,00 _(com taxa da maquininha)_
>
> Responde *pix* ou *cartão*.

---

### pixInstructions — Pix escolhido
**HOJE**
> Fechado! Total *R$ 00,00* no Pix.
>
> Vou te mandar o código na próxima mensagem — é só segurar nela, copiar e colar no *Pix copia e cola* do seu banco. 👇
>
> Assim que o Pix cair eu já começo a separar tudo e te aviso por aqui. 💚

**NOVA**
> Total *R$ 00,00* no Pix.
>
> O código vem na próxima mensagem — copia ela inteira e cola no *Pix copia e cola* do seu banco 👇
>
> Assim que cair, eu começo a separar.

---

### cardInstructions — cartão escolhido
**HOJE**
> Fechado! Total *R$ 00,00* no cartão _(taxa da maquininha já incluída)_.
>
> Paga com cartão por este link seguro 👇
> {link}
>
> Assim que o pagamento aprovar eu já começo a separar tudo e te aviso por aqui. 💚

**NOVA**
> Total *R$ 00,00* no cartão _(taxa da maquininha incluída)_.
>
> Paga por este link 👇
> {link}
>
> Assim que aprovar, eu começo a separar.

---

### cardEnrollmentInstructions — primeiro cartão
**HOJE**
> Fechado! Total *R$ 00,00* no cartão _(taxa da maquininha já incluída)_.
>
> Na primeira vez preciso cadastrar seu cartão num link seguro. Depois as próximas compras você confirma aqui mesmo no WhatsApp. 👇
> {link}
>
> O cartão é tokenizado pelo Pagar.me; a Lia não recebe número nem CVV.

**NOVA**
> Total *R$ 00,00* no cartão _(taxa da maquininha incluída)_.
>
> Na primeira compra você cadastra o cartão neste link. Nas próximas, confirma aqui mesmo 👇
> {link}
>
> _Eu não recebo o número nem o CVV do seu cartão._

---

### sandboxHint — só em sandbox
**HOJE**
> _(sandbox: responda *paguei* pra simular o pagamento)_

**NOVA**
> _(sandbox: responda *paguei* pra simular)_

---

### resendPix — "manda o pix de novo"
**HOJE**
> Claro! Segue seu código Pix na próxima mensagem 👇 É só copiar ela inteira e colar no *Pix copia e cola* do banco. 💚

**NOVA**
> Segue o código na próxima mensagem — copia ela inteira e cola no *Pix copia e cola* 👇

---

### resendCard
**HOJE**
> Claro! Seu link de pagamento é este 👇
> {link}

**NOVA**
> Seu link de pagamento 👇
> {link}

---

### paymentSwitched — trocou a forma
**HOJE**
> a) Sem problema, troquei pra Pix — o total fica *R$ 00,00* (sem taxa). Segue o código 👇
> b) Sem problema, troquei pro cartão — o total fica *R$ 00,00* (com a taxa da maquininha). Segue o link 👇

**NOVA**
> a) Troquei pra Pix — total *R$ 00,00*, sem taxa. Segue o código 👇
> b) Troquei pro cartão — total *R$ 00,00*, com taxa da maquininha. Segue o link 👇

---

### orderDetailsBody — bolha nativa de pagamento
**HOJE**
> Confira seu pedido de *R$ 00,00*. Para pagar com o cartão final *1234*, toque em *Revisar e pagar* abaixo. 💳

**NOVA**
> Seu pedido: *R$ 00,00*. Toque em *Revisar e pagar* pra cobrar no cartão final *1234*.

---

### savedCardOffer — cartão salvo (fallback texto)
**HOJE**
> Pagar *R$ 00,00* com o cartão salvo final *1234*? 💳
>
> Responde *usar cartão* que eu cobro nele, ou *outro cartão* para cadastrar um novo.
> _Cobrança segura via Pagar.me — seus dados não passam pelo chat._

**NOVA**
> Pagar *R$ 00,00* no cartão final *1234*?
>
> Responde *usar cartão*, ou *outro cartão* pra cadastrar outro.

---

### savedCardCharging
**HOJE**
> Cobrando no cartão final *1234*… te confirmo aqui em instantes. 💳

**NOVA**
> Cobrando no cartão final *1234*. Te confirmo em instantes.

---

### savedCardNothingPending
**HOJE**
> Não achei uma cobrança de cartão em aberto. Me diz *pagar* que eu gero uma nova. 🙂

**NOVA**
> Não tem cobrança em aberto. Responde *pagar* que eu gero uma nova.

---

### cardChargeFailed — cartão recusado
**HOJE**
> Não consegui aprovar o cartão final *1234* agora. Posso seguir por Pix ou te mandar um link seguro de cartão. 💳

**NOVA**
> O cartão final *1234* não aprovou. Responde *pix*, ou *cartão* que eu mando um link novo.

---

### cardAttemptExpired
**HOJE**
> Esse pedido de cartão venceu antes da confirmação. Me pede para pagar de novo que eu gero uma cobrança nova. 💳

**NOVA**
> Essa cobrança venceu. Responde *pagar* que eu gero uma nova.

---

### cardPaymentProcessing
**HOJE**
> Seu pagamento por cartão já está sendo processado. Assim que confirmar eu te aviso aqui. 💚

**NOVA**
> Pagamento em processamento. Te aviso assim que confirmar.

---

### cardPending — "já aprovou?"
**HOJE**
> A aprovação do cartão chega automática pra mim — assim que confirmar, te aviso na hora por aqui. 🙂

**NOVA**
> Ainda não aprovou. Assim que confirmar, te aviso na hora.

---

### pixNotSeenYet — "já paguei" e o Pix não caiu
**HOJE**
> Ainda não apareceu aqui — o Pix costuma cair em segundos. 🙂 Assim que confirmar eu te aviso na hora. Se demorar mais de 5 min, me chama!

**NOVA**
> O Pix ainda não caiu aqui. Assim que cair, te aviso na hora. Se passar de 5 min, me chama.

---

### paymentConfirmed — aprovado
**HOJE**
> Pagamento confirmado! ✅ Já estou separando seu pedido — te aviso assim que sair pra entrega. 🛵

**NOVA**
> ✅ Pagamento confirmado. Já estou separando — te aviso quando sair pra entrega.

---

### paymentConfirmedSupplierCheck — aprovado, confirmando na loja
**HOJE**
> Pagamento confirmado! ✅ Agora estou confirmando os itens na loja e preparando seu pedido. Te aviso assim que ele avançar. 🛒

**NOVA**
> ✅ Pagamento confirmado. Confirmando os itens na loja agora — te aviso quando avançar.

---

### hardcoded (whatsapp-pay.ts:285) — bolha de pagamento aprovado
**HOJE**
> Pagamento aprovado. Já estamos preparando seu pedido.

**NOVA**
> Pagamento aprovado. Preparando seu pedido.

---

### alreadyPaid — "paguei" com pagamento confirmado
**HOJE**
> Pode ficar tranquilo, seu pagamento já está confirmado por aqui! ✅ Estou cuidando do seu pedido — quer saber como está, é só perguntar *status*.

**NOVA**
> ✅ Seu pagamento já está confirmado. Pra acompanhar, responde *status*.

---

### finishOrderFirst — "status" sem ter fechado
**HOJE**
> Você ainda não fechou esse pedido 🙂 Responde *pagar* que eu te passo o código na hora.

**NOVA**
> Esse pedido ainda não foi fechado. Responde *pagar* que eu mando o código.

---

### emptyCartPay — "pagar" com cesta vazia
**HOJE**
> Sua cesta ainda está vazia 🙂. Me diz o que você quer — ex.: {EXAMPLES} — e eu já te passo o total.

**NOVA**
> Sua cesta está vazia. Me diz o que você quer.

---

### hardcoded (delivery-service.ts:1370) — mandou algo enquanto gera o pagamento
**HOJE**
> O carrinho já foi confirmado e estou gerando seu pagamento agora. Só um instante. 💳

**NOVA**
> Gerando seu pagamento agora. Um instante.

---

## 7. Ciclo do pedido (status e avisos)

### orderStatusLine — resposta a "status"
**HOJE**
> a) Seu pedido *#{id}* está sendo cotado agora. 🧮 Já te mando o total com a entrega pra você aprovar — sem cobrar nada antes.
> b) Seu pedido *#{id}* está sendo confirmado na loja antes do pagamento. 🛒 Te aviso assim que o carrinho estiver pronto.
> c) Seu pedido *#{id}* está só esperando o pagamento. 💳 Se precisar do código de novo, responde *pagar*.
> d) Seu pedido *#{id}* está confirmado e já estou separando os itens. 🛒 Te aviso quando sair pra entrega!
> e) Seu pedido *#{id}* já foi comprado e está sendo preparado pela loja. 📦 Te aviso quando sair pra entrega!
> f) Seu pedido *#{id}* saiu para entrega pela loja! 🚚 / Acompanha por aqui: {link}
> g) Seu pedido *#{id}* já foi comprado e está sendo preparado. 📦 Te aviso quando sair pra entrega!
> h) Seu pedido *#{id}* está pronto para retirada pelo parceiro autorizado. 📦
> i) Seu pedido *#{id}* saiu pra entrega! 🛵 / Acompanha por aqui: {link}
> j) Seu pedido *#{id}* foi entregue! 🎉 Se precisar de mais alguma coisa é só chamar.
> k) Seu pedido *#{id}* foi cancelado e o estorno ainda está pendente de confirmação. Te aviso assim que for concluído.
> l) Seu pedido *#{id}* foi cancelado e o estorno já foi confirmado. ✅
> m) Seu pedido *#{id}* foi cancelado. Se pagou algo, o estorno já está a caminho. Quer pedir de novo? 💚
> n) Seu pedido *#{id}* está em andamento. Qualquer novidade eu te aviso por aqui!

**NOVA**
> a) *#{id}* em cotação. Mando o total com a entrega pra você aprovar — nada é cobrado antes.
> b) *#{id}* em confirmação na loja. Te aviso quando o carrinho estiver pronto.
> c) *#{id}* aguardando pagamento. Responde *pagar* que eu mando o código de novo.
> d) *#{id}* confirmado, separando os itens. Te aviso quando sair pra entrega.
> e) *#{id}* comprado, a loja está preparando. Te aviso quando sair pra entrega.
> f) *#{id}* saiu pra entrega pela loja 🚚 / Acompanha: {link}
> g) *#{id}* comprado e em preparação. Te aviso quando sair pra entrega.
> h) *#{id}* pronto pra retirada.
> i) *#{id}* saiu pra entrega 🛵 / Acompanha: {link}
> j) *#{id}* entregue ✅ Precisando de algo, é só chamar.
> k) *#{id}* cancelado. O estorno ainda está pendente — te aviso quando concluir.
> l) *#{id}* cancelado e estornado ✅
> m) *#{id}* cancelado. Se pagou, o estorno está a caminho. Quer pedir de novo?
> n) *#{id}* em andamento. Qualquer novidade eu aviso.

_Nota: tirei o "Seu pedido" repetido 14 vezes — o `#id` em negrito já abre a linha e economiza uma linha inteira no celular._

---

### dispatched — aviso de saída (courier)
**HOJE**
> 🛵 Saiu pra entrega!
> Acompanha em tempo real: {link} Te aviso quando chegar.

**NOVA**
> 🛵 Saiu pra entrega. Te aviso quando chegar.
> Acompanha: {link}

---

### retailerOutForDelivery — aviso de saída (loja)
**HOJE**
> 🚚 Seu pedido saiu para entrega pela loja!
> Acompanha por aqui: {link} Te aviso quando chegar.

**NOVA**
> 🚚 Seu pedido saiu pra entrega. Te aviso quando chegar.
> Acompanha: {link}

---

### delivered — aviso de entrega
**HOJE**
> Entregue! 🎉 Espero que esteja tudo certinho. Da próxima é só mandar *repete o de sempre*. 💚

**NOVA**
> Entregue ✅ Da próxima, é só mandar *repete o de sempre*.

---

### noOrdersYet — "status" sem pedidos
**HOJE**
> Você ainda não tem pedidos por aqui. 🙂 Me diz o que precisa que eu monto o primeiro!

**NOVA**
> Você ainda não tem pedidos. Me diz o que precisa que eu monto o primeiro.

---

### noPreviousOrder — "repete o de sempre" sem histórico
**HOJE**
> Ainda não tenho um pedido anterior seu pra repetir. Me diz o que você quer que eu monto rapidinho. 🙂

**NOVA**
> Você ainda não tem um pedido pra repetir. Me diz o que quer que eu monto.

---

## 8. Cancelamento, estorno e atendimento

### canceledUnpaid — cancelou antes de pagar
**HOJE**
> Prontinho, cancelei — como o pagamento não tinha caído, não foi cobrado nada. 🙂 Quando quiser, é só pedir de novo!

**NOVA**
> Cancelado. Nada foi cobrado. Quando quiser, é só pedir de novo.

---

### cancelRequestedPaid — pediu cancelamento depois de pagar
**HOJE**
> Depois do pagamento, não oferecemos cancelamento. Se faltar item, estornamos o valor dele; se houver atraso, eu aviso. 🙏

**NOVA**
> Depois do pagamento não dá pra cancelar. Se faltar item, estorno o valor dele; se atrasar, eu aviso.

---

### cancelTooLate
**HOJE**
> Depois do pagamento, não oferecemos cancelamento. Se faltar item, estornamos o valor dele; se houver atraso, eu aviso.

**NOVA**
> Depois do pagamento não dá pra cancelar. Se faltar item, estorno o valor dele; se atrasar, eu aviso.

---

### cancelHowTo — "como cancelo?"
**HOJE**
> a) *com pedido pago:* Depois do pagamento, não oferecemos cancelamento. Se faltar item, estornamos o valor dele; se atrasar, eu aviso.
> b) *sem pedido pago:* Antes do pagamento, você pode limpar a lista a qualquer momento. Depois que pagar, não oferecemos cancelamento. 🙂

**NOVA**
> a) Depois do pagamento não dá pra cancelar. Se faltar item, estorno o valor dele; se atrasar, eu aviso.
> b) Antes de pagar, você pode limpar a lista quando quiser. Depois do pagamento não dá pra cancelar.

---

### nothingToCancel
**HOJE**
> Não achei nenhum pedido em andamento pra cancelar 🙂. Se quiser começar um novo, me diz o que precisa!

**NOVA**
> Não tem pedido em andamento pra cancelar. Quer começar um novo?

---

### refundRequested
**HOJE**
> O estorno ficou pendente de processamento pela equipe — eu te aviso quando for confirmado. 🙏

**NOVA**
> Estorno solicitado. Te aviso quando for confirmado.

---

### refundConfirmed
**HOJE**
> Seu estorno foi confirmado. ✅ Se precisar de ajuda com o prazo do banco, me chama por aqui.

**NOVA**
> ✅ Estorno confirmado. Qualquer dúvida sobre o prazo do banco, me chama.

---

### humanHandoff — "quero falar com um humano"
**HOJE**
> Claro! Já chamei alguém da equipe pra falar com você por aqui mesmo — pode escrever o que precisa que a mensagem chega. 💚 Enquanto isso, se for sobre um pedido, me pergunta *status* que eu te adianto.

**NOVA**
> Chamei alguém da equipe — pode escrever aqui mesmo que a mensagem chega. Se for sobre um pedido, responde *status* que eu já adianto.

---

### complaintAck — reclamação
**HOJE**
> Poxa, sinto muito por isso 😔 Já passei sua mensagem pra equipe. Se faltar algum item, estornamos o valor dele; se houver atraso, eu te aviso. Por enquanto não fazemos substituições.

**NOVA**
> Sinto muito. Já passei pra equipe. Se faltou item, estorno o valor dele; se atrasou, eu aviso.

_Nota: tirei o "não fazemos substituições" — é regra interna que só aparece se o cliente pedir substituição._

---

## 9. Perguntas sobre o serviço

> **Sobre tirar "estado de São Paulo":** saiu de todo o texto de boas-vindas (greeting,
> welcome*, help). Mantive nas 3 mensagens abaixo/adiante em que a área **é** a resposta:
> `serviceAnswer — area` (o cliente perguntou onde você entrega), `outsideCoverage` e
> `tooFarForDelivery` (as duas recusas — sem dizer até onde você vai, viram só um "não").
> Se quiser tirar dessas 3 também, me fala que eu removo.

### serviceAnswer — area
**HOJE**
> a) *com CEP:* A Lia atende {areaLabel} 📍 Seu endereço já tá salvo e coberto — e se quiser conferir outro lugar, me manda o CEP que eu confirmo na hora!
> b) *sem CEP:* A Lia atende {areaLabel} 📍 Me manda seu *CEP* que eu confirmo na hora se chego até você!

**NOVA**
> a) Atendo {areaLabel} 📍 Seu endereço já está salvo e coberto. Pra conferir outro, me manda o CEP.
> b) Atendo {areaLabel} 📍 Me manda seu *CEP* que eu confirmo se chego até você.

---

### serviceAnswer — fee
**HOJE**
> a) *com cesta:* A entrega é por motoboy e o frete sai pela distância até você 🛵 Te mostro o valor certinho junto com o total, assim que a gente fechar a cesta — sem surpresa.
> b) *com CEP:* A entrega é por motoboy e o frete sai pela distância até você 🛵 Me diz o que precisa que eu já te mostro o total certinho, sem surpresa.
> c) *sem nada:* A entrega é feita por motoboy e o frete é calculado na hora, pela distância até você 🛵 Me diz o que precisa + seu CEP que eu já te mostro o total certinho, sem surpresa.

**NOVA**
> a) O frete depende da distância até você 🛵 Te mostro o valor exato junto com o total quando fechar a cesta.
> b) O frete depende da distância até você 🛵 Me diz o que precisa que eu mando o total exato.
> c) O frete depende da distância até você 🛵 Me diz o que precisa e seu CEP que eu mando o total exato.

---

### serviceAnswer — eta
**HOJE**
> A entrega é no mesmo dia — normalmente em 1 a 2 horas depois do pagamento, dependendo da distância 🛵 Quando você fizer o pedido eu te mostro a previsão certinha.

**NOVA**
> O prazo depende da loja e do seu endereço — tem item que chega em horas, tem item que leva alguns dias. Me diz o que você precisa que eu mostro o prazo exato junto com o total, antes de você pagar.

---

### serviceAnswer — payment
**HOJE**
> Você paga *Pix* (copia-e-cola, sem taxa) ou *cartão* (link seguro do Mercado Pago) — tudo aqui pelo chat mesmo. 💳 Vale-refeição por enquanto não consigo aceitar. 🙏

**NOVA**
> *Pix* (sem taxa) ou *cartão* (link seguro) — tudo aqui pelo chat. Vale-refeição ainda não aceito.

---

### serviceAnswer — generic
**HOJE**
> Boa pergunta! Eu faço suas compras do dia a dia e entrego no mesmo dia por motoboy — você paga por Pix ou cartão aqui no chat. Me diz o que você precisa que eu resolvo. 💚

**NOVA**
> Eu compro o que você precisar e entrego no seu endereço. Você paga por Pix ou cartão aqui no chat, e eu mostro o prazo antes. O que você precisa?

---

## 10. Botões e cards (limite de 20 caracteres no rótulo)

### Cards de produto
**HOJE** corpo: `{produto}` / `*R$ 00,00*` / `Entrega: {prazo}` — botões **Escolher esse** · **Outras opções**
**NOVA** sem mudança. Os rótulos já são os mais curtos possíveis e o corpo é dado puro.

---

### Quantidade
**HOJE** corpo: `Quantas unidades de *{produto}*?` — botões **1 unidade** · **2 unidades** · **Outra quantidade**
**NOVA** sem mudança.

---

### Pagamento
**HOJE** corpo: `Escolha como prefere pagar:` — botões **Pagar com Pix** · **Pagar com cartão** · **Cancelar**
**NOVA** corpo: `Como prefere pagar?` — botões **Pix** · **Cartão** · **Cancelar**

_Os rótulos ficam mais legíveis curtos; o corpo já diz que é pagamento._

---

### Cartão salvo
**HOJE** botões: **Pagar •••• 1234** · **Usar outro cartão**
**NOVA** botões: **Pagar •••• 1234** · **Outro cartão**

---

### Depois de escolher um item
**HOJE** botões: **Fechar e ver total** · **Adicionar mais itens** · **Cancelar**
**NOVA** botões: **Ver total** · **Adicionar mais** · **Cancelar**

---

### Ajustar antes de pagar
**HOJE** corpo: `Quer ajustar o pedido antes de pagar?` — botões **Adicionar mais** · **Cancelar pedido**
**NOVA** corpo: `Quer ajustar antes de pagar?` — botões sem mudança
**HOJE** fallback texto: `Quer ajustar? Manda mais itens ou responde *cancelar*.`
**NOVA** fallback: sem mudança — já é curto.

---

### Outros botões
**HOJE** **Trocar endereço** · **Cancelar pedido** · **Cadastrar endereço**
**NOVA** sem mudança.

---

## 11. Alertas ao OPERADOR (não vão pro cliente)

Estes são pra você, não pro cliente — mantive como estão. Se quiser encurtar também, é só dizer.

### operatorQuoteAlert
> 🛎️ [operador] Pedido #{id} aguardando SUA cotação no /ops:
> • {item}

### operatorItemAddedAlert
> ➕ [operador] Pedido #{id} ganhou item durante a cotação: {itens}

### operatorPaidAlert
> 💰 [operador] Pedido #{id} PAGO (R$ 00,00) — hora de comprar e acionar a entrega. Detalhes no /ops.

### operatorAddressChangedAlert
> 📍 [operador] Pedido #{id} trocou de endereço ANTES da cotação: {endereço}. Cote com o frete do endereço novo.
