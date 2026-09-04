# Prompt para o Codex — parte 2: publicar o Flow de endereço e ligar as boas-vindas

Continuação do passo 4. O JSON do Flow foi corrigido (rótulo "Complemento" com 31 caracteres
passava do limite de 20 da Meta) e a rota ganhou ações para atualizar o Flow já criado e ler
erros de validação. Cole no Codex:

---

Tarefa: terminar a configuração do número da Lia na Meta. O Flow 1048998724594022 já existe
como rascunho; agora ele deve ser ATUALIZADO e publicado (não crie outro). Depois: gravar o id
na Vercel, publicar e ligar as boas-vindas. Use a mesma sessão do /ops de antes; se
https://liadelivery.com.br/api/ops/meta-setup devolver {"error":"unauthorized"}, refaça o
login (mande "ops" para a Lia no WhatsApp Web e abra o link neste navegador).

PASSO 1 — Atualizar e publicar o Flow existente
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=flow_update&flow_id=1048998724594022
Esperado: JSON com "published": {"success": true} e "status" contendo "status": "PUBLISHED".
Se vier "validation_errors" com itens, copie o JSON inteiro e me devolva sem tentar
consertar. Não crie o Flow pela interface nem edite o JSON.

PASSO 2 — Gravar o id na Vercel e publicar
No terminal, na pasta do projeto:
  vercel env add LIA_FLOW_ADDRESS_ID production
  (valor: 1048998724594022)
  vercel deploy --prod --yes
Espere "Ready". Confirme: vercel env ls production | grep LIA_FLOW_ADDRESS_ID

PASSO 3 — Boas-vindas + perguntas sugeridas (por último)
Abra: https://liadelivery.com.br/api/ops/meta-setup?action=welcome
Esperado: "success": true.

PASSO 4 — Verificação final
Abra: https://liadelivery.com.br/api/ops/meta-setup
Confira: automation.enable_welcome_message true com 4 prompts, flows com o item
1048998724594022 em "PUBLISHED", e flowEnv igual a 1048998724594022.

RELATÓRIO
Devolva o JSON do passo 4 e qualquer erro exato. Não altere nada no Meta Business Suite nem
no WhatsApp Manager por conta própria.
