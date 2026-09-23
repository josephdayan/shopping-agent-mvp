# Piloto Meta Ads → WhatsApp — 18/09/2026

## Configuração da campanha

- Nome: `Lia | WhatsApp | SP Capital | Piloto SP01`
- Objetivo Meta: engajamento/mensagens, com destino WhatsApp.
- Orçamento: R$ 30 por dia, contínuo, no conjunto de anúncios.
- Local: município de São Paulo. Não restringir idade, gênero ou interesses; usar
  Advantage+ para o restante da audiência.
- Otimização: conversas iniciadas/messaging conversations started.
- Categoria especial: nenhuma.
- Mensagem pré-preenchida: `Oi Lia! Quero fazer um pedido. [AD:SP01]`

O marcador `SP01` é fallback. O webhook também grava o `referral.source_id` e o
`ctwa_clid` enviados pela Meta, que são a evidência principal da origem.

## Criativos

1. Vídeo vertical curto mostrando uma conversa real com a Lia. Pendente: o arquivo do Reel
   não está no repositório nem entre os vídeos recentes utilizáveis no Mac.
2. Imagem estática final 4:5: `public/ads/lia-acabou-em-casa-sp01-4x5.png`.
   - Texto na arte: **Acabou em casa? Manda um zap**
   - CTA na arte: **Falar com a Lia**
3. Variação automática do Advantage+ a partir dos ativos aprovados. Ativar somente depois
   de conferir a prévia e garantir que a Meta não inventou preço, desconto ou prazo.

Texto principal sugerido:

> Acabou alguma coisa em casa? Manda sua lista no WhatsApp. A Lia pesquisa em lojas
> oficiais, mostra o total antes do pagamento e acompanha seu pedido.

Título: `Pediu no WhatsApp. A Lia resolve.`

## Gates antes de ativar gasto

1. Migration `20260917120000_ads_acquisition_attribution` aplicada em produção.
2. Teste real do link do anúncio cria uma conversa no `/ops` com origem `SP01`.
3. Página, conta de anúncios, forma de pagamento e número WhatsApp conferidos no AdPlane.
4. Prévias de feed, stories e reels sem texto cortado ou promessa não autorizada.
5. Campanha, conjunto e anúncios permanecem pausados até essa conferência.

## Primeira semana

Não alterar público ou criativos durante os primeiros sete dias, exceto por erro ou risco.
Registrar diariamente gasto, conversas iniciadas, pedidos criados, pedidos pagos, estornos e
receita retida. A decisão de continuar usa custo por pedido pago e custo por receita retida;
custo por conversa é apenas diagnóstico do anúncio.
