# Ticket ao suporte do Mercado Livre — DevCenter + endpoint de busca

_Preparado em 2026-08-20. Objetivo: destravar os DOIS cadeados da API oficial de busca —
(1) a conta não consegue criar aplicativo no DevCenter (erro `OPT02-EN1XAJYDKPNW`);
(2) o endpoint `GET /sites/MLB/search` devolve 403 até para apps registrados (relatos
públicos de jan–jun/2026), sem critério de habilitação documentado._

## Onde abrir

1. Entrar em <https://developers.mercadolivre.com.br> com a conta operacional da Lia
   (a mesma que tentou criar o app em 17/08).
2. Menu **Suporte** (ou "Ajuda para desenvolvedores") → abrir novo chamado.
   Se o DevCenter não abrir chamado por causa do próprio erro de elegibilidade, usar o
   canal geral: <https://www.mercadolivre.com.br/ajuda> → "Preciso de ajuda com outra
   coisa" → descrever que é sobre o **DevCenter/API para desenvolvedores**.
3. Ter à mão: CNPJ do MEI, e-mail da conta, e o código do erro (`OPT02-EN1XAJYDKPNW`).

## Texto do chamado (colar como está; preencher os ◻︎)

---

**Assunto:** DevCenter — erro OPT02 ao criar primeira aplicação + habilitação do
endpoint de busca `/sites/MLB/search`

Olá! Sou titular da conta ◻︎[login/e-mail da conta], pessoa jurídica (MEI, CNPJ
◻︎[CNPJ completo]), e preciso de ajuda com dois pontos ligados à API oficial:

**1) Não consigo criar minha primeira aplicação no DevCenter.**
Em 17/08/2026, ao concluir o formulário de criação de aplicativo em
developers.mercadolivre.com.br, recebi o erro **`OPT02-EN1XAJYDKPNW`** e o formulário
voltou ao início; tentei novamente e o comportamento se repetiu. A conta está ativa,
com dados completos. Peço que verifiquem a elegibilidade da conta para o DevCenter e o
que preciso regularizar para conseguir criar a aplicação.

**2) Habilitação do endpoint de busca por palavra-chave.**
Meu caso de uso é somente leitura: buscar anúncios por palavra-chave
(`GET /sites/MLB/search?q=...`) para exibir opções reais de produtos (título, preço,
link do anúncio) a clientes de um serviço de concierge de compras
(https://liadelivery.com.br). As compras são feitas manualmente por um operador,
como cliente comum, no site/app oficial do Mercado Livre — não há automação de
checkout, revenda de dados nem uso concorrente. Já uso hoje, sem autenticação, o
endpoint público de frete por anúncio (`/items/{id}/shipping_options`), que atende bem.

Vejo relatos recentes de desenvolvedores recebendo **403 Forbidden** nesse endpoint de
busca mesmo com aplicação registrada e token válido. Pergunto objetivamente:

- O `GET /sites/MLB/search` está disponível para aplicações comuns com token de
  aplicação (client_credentials)?
- Se não, existe processo de habilitação/allowlist? Quais requisitos e onde solicito?
- Se esse endpoint não for mais oferecido, qual é a alternativa oficial suportada para
  busca de anúncios por palavra-chave?

Redirect URI que usarei na aplicação: `https://liadelivery.com.br/api/mercadolivre/oauth/callback`.

Obrigado!

---

## Se o suporte responder pedindo detalhes técnicos

- **Volume estimado:** piloto com dezenas de buscas/dia; produção inicial < 2.000/dia —
  muito abaixo dos rate limits publicados.
- **Fluxo OAuth:** authorization code + refresh token já implementados no backend
  (callback acima); tokens guardados cifrados.
- **O que NUNCA fazemos:** compra automatizada, scraping do site, revenda de dados.
  A busca é exibida ao cliente final com link direto para o anúncio original.

## Estado no código (para quem pegar esta pendência)

- `src/lib/stores/mercadolivre.ts` → `searchMercadoLivreOfficial` já consome o endpoint
  com token e cai no Apify em qualquer falha (401/403/timeout ficam invisíveis pro
  cliente). Após um 401/403 a rota oficial fica 10 min sem ser tentada.
- `src/lib/mercadolivre-oauth.ts` → troca/refresh de token prontos; falta só o app real
  (client_id/secret novos — os envs `MERCADO_LIVRE_CLIENT_ID/SECRET` na Vercel são da
  era anterior e devem ser substituídos quando o app existir).
- Ganho esperado: busca fria de cauda longa de 20–75s (actor) para ~1s (API), custo zero.
