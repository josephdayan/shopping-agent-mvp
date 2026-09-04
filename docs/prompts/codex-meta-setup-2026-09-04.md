# Prompt para o Codex — configurar o número da Lia na Meta (04/09/2026)

Cole o texto abaixo no Codex. Ele usa só o navegador logado no WhatsApp Web e a rota
protegida do /ops; não precisa entrar no Meta Business Suite.

---

Tarefa: ativar no número oficial da Lia (WhatsApp) o perfil comercial, a foto, o Flow de
endereço e as boas-vindas com perguntas sugeridas. Tudo roda por uma rota do próprio
sistema; você só precisa de uma sessão logada no painel /ops e de abrir URLs. Ordem
obrigatória: 1 → 6. Não pule a ordem: as boas-vindas só podem ser ligadas depois que o Flow
estiver gravado na Vercel e o deploy estiver pronto.

CONTEXTO
- Projeto: /Users/joseph/Documents/mvp - wpp (Next.js na Vercel, projeto shopping-agent-mvp).
- Painel do operador: https://liadelivery.com.br/ops. O login é pelo WhatsApp: o operador
  manda "ops" para a Lia e recebe um link de 10 minutos. O número do operador é o que o
  Joseph usa para falar com a Lia.
- Rota de configuração: https://liadelivery.com.br/api/ops/meta-setup?action=<ação>
  Ações: status, profile, picture, flow, welcome. Cada uma devolve JSON. Usa a sessão do /ops.

PASSO 1 — Entrar no /ops neste navegador
1. No WhatsApp Web, abra a conversa com a Lia (número oficial da Lia) e envie a mensagem: ops
2. A Lia responde com um link https://liadelivery.com.br/api/ops/login?login=...
   Abra esse link NESTE navegador (não no celular). Ele redireciona para /ops já logado.
3. Confirme abrindo https://liadelivery.com.br/api/ops/meta-setup — tem de vir um JSON com
   "ok": true e o campo "profile". Se vier {"error":"unauthorized"}, o link não foi aberto
   neste navegador; repita o passo 1.

PASSO 2 — Perfil comercial
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=profile
Esperado: {"ok":true,"action":"profile","result":{"success":true}}.

PASSO 3 — Foto de perfil
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=picture
Esperado: "success": true. Se der erro de upload, anote a mensagem e siga; a foto pode ser
colocada depois pelo WhatsApp Manager (arquivo public/brand/lia-whatsapp-profile-hd.png).

PASSO 4 — Flow de endereço (criar e publicar)
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=flow
Esperado: um JSON com "id": "<número longo>" e "success": true. Copie o id.
Se vier "validation_errors", copie o JSON inteiro da resposta e me devolva sem tentar
consertar; não crie o Flow pela interface.

PASSO 5 — Gravar o id do Flow na Vercel e publicar
No terminal, dentro da pasta do projeto:
  vercel env add LIA_FLOW_ADDRESS_ID production
  (cole o id do Flow quando pedir o valor)
  vercel deploy --prod --yes
Espere terminar com "Ready". Confirme com:
  vercel env ls production | grep LIA_FLOW_ADDRESS_ID

PASSO 6 — Boas-vindas + perguntas sugeridas (por último)
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=welcome
Esperado: "success": true. Isso liga a mensagem de boas-vindas e as 4 perguntas sugeridas
("Quero um chá", "Ração pro meu cachorro", "Papel higiênico e sabão", "Um presente da
Boticário").

PASSO 7 — Verificação final
Abra: https://liadelivery.com.br/api/ops/meta-setup
Confira no JSON: profile.description preenchida, profile.profile_picture_url presente,
automation.enable_welcome_message true com 4 prompts, flows com um item "PUBLISHED", e
flowEnv igual ao id do Flow.

RELATÓRIO
Devolva: o JSON do passo 7, o id do Flow, e qualquer erro exato que apareceu. Não altere
nada no Meta Business Suite nem no WhatsApp Manager por conta própria.
