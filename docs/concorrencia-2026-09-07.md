# Concorrência real da Lia — pesquisa de 07/09/2026

Pergunta do dono: "impossível que não existe uma Lia no Brasil ou no mundo". A frase do
CLAUDE.md ("não existe um Lia exato") estava desatualizada. Resultado da pesquisa web:

## O modelo da Lia JÁ EXISTIU e existe, em pedaços

| Quem | Onde | O que faz | Diferença pra Lia |
|---|---|---|---|
| **Magic** (YC 2015, Sequoia US$12M) | EUA, SMS | "Peça qualquer coisa por texto"; operadores humanos compram com o cartão da empresa e cobram o cartão do cliente + taxa (2,4% + US$0,30) | É a Lia por SMS, 10 anos antes. Virou serviço de assistente virtual premium (US$100/h); o "qualquer coisa por texto" pro consumidor comum não escalou |
| **Rappi "Qualquer Coisa" / RappiFavor** | Brasil, app, desde 2018 | Cliente diz o que quer e em qual loja; um entregador compra e traz | Mesmo "compra em qualquer loja"; é app, não WhatsApp, e entrega por courier próprio |
| **Amazon "Buy for Me"** | EUA, app da Amazon | Agente de IA (Nova + Claude) compra em ~400 mil sites de terceiros com o pagamento/endereço que a Amazon já tem; expandido em 03/2026 | Checkout automatizado em site alheio, em escala — exatamente o que a Lia faz à mão. Preso ao app da Amazon; polêmica por listar produtos sem permissão (01/2026) |
| **Google agentic checkout / UCP + "Buy for me" no Gemini** | EUA, desde 01/2026 | Compra em lojistas elegíveis (Wayfair, Chewy, Target, Shopify) dentro do Search/Gemini | Precisa de integração do lojista (protocolo); EUA |
| **Perplexity Instant Buy (PayPal)** | EUA, 11/2025 | Compra no chat em lojistas PayPal | Idem; Amazon mandou cease-and-desist quando o Comet comprava na Amazon |
| **OpenAI Instant Checkout / "Buy it in ChatGPT"** | EUA, 09/2025 → **morto em 03/2026** | Checkout no chat (Etsy, 1M+ lojas Shopify) | Retirado em ~6 meses: vendas perto de zero; as pessoas pesquisam no chat e **compram onde já têm conta, cartão e histórico** |

## Brasil, no WhatsApp

- **Lu do Magalu** (11/2025): jornada 100% no WhatsApp — busca, recomenda, carrinho, **Pix ou
  cartão no chat**, texto/voz/foto. Catálogo 1P + 300 mil sellers do marketplace = 37 milhões
  de anúncios. É o concorrente mais próximo: "jardim murado" de 37 milhões de itens não é
  tão murado assim.
- **Trela Concierge**: IA no WhatsApp que monta a compra de mercado ("lanche saudável pras
  crianças", lista da semana). Só no marketplace da Trela.
- **Renner "Rê"** (Yuno, 2026): agente que fecha a compra sozinho, no catálogo da Renner.
- **Zapia / Luzia**: assistentes gerais; Zapia compara preços e monta carrinho em apps de
  terceiros, **não paga nem compra**. Ambos ameaçados pela política da Meta (abaixo).
- **Trilhos de pagamento por agente**: Visa Intelligent Commerce (BB, primeira transação
  03/2026; piloto amplo fim de 2026 com OpenAI/Perplexity/Anthropic) e Mastercard Agent Pay
  (Itaú e Santander já processaram transações). Isso é infraestrutura pra "agente que compra
  com cartão tokenizado e limite" — o que a Lia faz hoje com operador e cartão próprio.

## O que NÃO achei

Um serviço no Brasil que junte as quatro coisas da Lia: WhatsApp + qualquer loja (cross-
varejista) + pagamento no chat + entrega do próprio varejista. As partes existem, cada uma
em um gigante; a combinação, não.

## Leitura honesta

1. A ideia não é única. Magic fez isso em 2015; Rappi faz desde 2018; Amazon e Google fazem
   o checkout em site alheio por agente em 2026.
2. O sinal mais importante é a **desistência da OpenAI**: checkout no chat com catálogo
   gigante e marca forte deu vendas perto de zero em 6 meses. Motivo declarado: o cliente
   compra onde já tem conta. A Lia só vence esse padrão se o cliente **não quer** abrir 5
   apps — o público certo é quem paga pela conveniência (pai do dono, não o caçador de
   preço).
3. O concorrente que mais dói é a **Lu do Magalu**: WhatsApp, Pix no chat, 37 milhões de
   itens, entrega própria e de sellers. A "largura" da Lia precisa ser o que a Magalu não
   tem: mercado do dia a dia, farmácia (não-remédio), pet, beleza, entrega hoje pela loja.
4. Risco regulatório novo: desde 15/01/2026 a Meta **proíbe chatbots de IA de uso geral**
   na WhatsApp Business API (Luzia, Poke, ChatGPT no WhatsApp). Bot de processo de negócio
   (atendimento, pedidos) continua permitido. A Lia é bot de compras — permitido — mas não
   pode virar "assistente que responde qualquer coisa". O roteador LLM que responde "não sei"
   a pergunta solta é, por acaso, a postura certa.

## Fontes

- Magic: https://bmtoolbox.net/stories/magic/ · https://straatosphere.com/magic-text-based-concierge-service/
- Rappi Qualquer Coisa: https://canaltech.com.br/apps/como-funciona-o-rappi-o-aplicativo-para-entrega-de-qualquer-coisa/
- Amazon Buy for Me: https://techcrunch.com/2026/03/11/amazon-expands-a-program-that-lets-customers-shop-from-other-retailers-sites/ · https://www.paz.ai/blog/amazons-buy-for-me-controversy-why-retailers-are-losing-control-of-their-catalogs
- Google UCP/checkout: https://9to5google.com/2026/01/11/gemini-ai-mode-checkout/ · https://corporate.target.com/press/fact-sheet/2026/01/google-gemini-2026
- Perplexity/PayPal: https://newsroom.paypal-corp.com/2025-11-PayPal-and-Perplexity-Launch-Instant-Buy
- OpenAI Instant Checkout morto: https://www.hypotenuse.ai/blog/chatgpts-instant-checkout-the-next-phase-of-agentic-commerce · https://www.earninglivingonline.com/ai-shopping-agents-checkout-stalled-buy-on-your-site-2026/
- Lu do Magalu: https://exame.com/inteligencia-artificial/lu-do-magalu-ganha-cerebro-com-ia-e-vira-vendedora-dentro-do-whatsapp/ · https://tiinside.com.br/05/11/2025/magalu-faz-100-do-processo-de-venda-pelo-whatsapp/
- Trela: https://consumidormoderno.com.br/ia-compras-whatsapp/
- Renner/Yuno: https://educaseo.com.br/blog/seo/yuno-e-renner-mostram-checkout-com-ia-agentica/
- Zapia: https://zapia.com/ · https://www.mobiletime.com.br/noticias/16/01/2026/zapia-funcionamento/
- Visa/BB e Mastercard no Brasil: https://thepaypers.com/payments/news/banco-do-brasil-and-visa-complete-first-ai-agent-payment-in-brazil · https://upnetix.com.br/mastercard-agent-pay-brasil-pagamentos-agentes-ia/
- Política Meta (bots gerais banidos): https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform · https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
