# Evidências da validação de compra por Pix — 10/09/2026

## Resultado atual

**Decisão: nenhuma das quatro lojas inspecionadas passou o gate autônomo. Etapa bancária ainda inconclusiva.**

Nenhuma compra, pedido novo, cobrança, pagamento, contratação ou mensagem externa foi realizada nesta execução.

## Checkout real da Swift

Fonte: perfil Chrome persistente `swift`, inspecionado em 10/09/2026.

- O endereço operacional autorizado foi selecionado sem transcrever seus dados nesta documentação.
- Foi usado o item útil mais barato disponível no momento: uma unidade de R$4,50.
- O carrinho confirmou subtotal de R$4,50, frete de R$17,90 e total de R$22,40.
- Antes da etapa de pagamento, o checkout exigiu identificação. O caminho “Acesso Rápido” enviou uma chave ao e-mail operacional.
- A caixa de e-mail não estava autenticada no perfil do comprador. Sem acesso automatizável a essa caixa, o percurso não é autônomo.
- Nenhum pedido, cobrança ou pagamento foi criado. O item foi removido e o carrinho terminou vazio.

A página e o FAQ da loja anunciam Pix entre as formas de pagamento, mas o ensaio não chegou à tela de pagamento. A Swift é, portanto, inconclusiva quanto à emissão do QR e reprovada no gate autônomo atual por depender de código enviado por e-mail.

Depois do ensaio, foi implementado suporte local para retomar esse gate: OAuth Gmail somente leitura, filtro por mensagens recentes de remetentes `swift.com.br`, extração de um único código e preenchimento do “Acesso Rápido”. O leitor não marca, move, apaga ou registra mensagens e não envia o código ao backend. O comportamento foi validado com respostas simuladas; nenhuma credencial OAuth real foi criada ou usada.

Fonte pública complementar: [Swift — dúvidas frequentes](https://www.swift.com.br/institucional/faq).

## Checkout real da Cobasi

Fonte: perfil Chrome persistente `cobasi`, inspecionado em 10/09/2026.

- Um estado visual intermediário exibiu subtotal antigo e quantidade incorreta; a página real do carrinho confirmou somente uma unidade de um produto útil de R$2,80. O valor antigo não foi usado.
- Ao avançar, a loja exigiu login ou cadastro. O cadastro enviou um código de validação ao e-mail operacional.
- A caixa de e-mail não estava autenticada no perfil do comprador; o cadastro foi cancelado sem validar o código.
- A página de acesso carregou um reCAPTCHA invisível. Isso registra uma dependência potencial, mas não prova que um desafio seria apresentado em toda autenticação.
- Nenhum pedido, cobrança ou pagamento foi criado. O carrinho foi esvaziado e o perfil foi fechado.

A Cobasi informa publicamente que aceita Pix no site e aplicativo, mas o ensaio não alcançou o pagamento. A loja é inconclusiva quanto à emissão autônoma do QR e reprovada no gate atual por depender de código de e-mail antes do checkout.

Fonte pública complementar: [Cobasi — formas de pagamento no site](https://atendimento.cobasi.com.br/hc/pt-br/articles/27830169130011-Quais-as-formas-de-pagamento-aceitas-no-site-Aceita-Pix).

## Checkout real da Oba

Fonte: perfil Chrome persistente `oba`, inspecionado em 10/09/2026 no checkout público da loja.

- O CEP público de teste 01310-100 foi aceito para entrega em casa.
- A loja mostrou entrega agendada a partir de R$9,90 e Express por R$14,90 em até 2h.
- O carrinho e o checkout abriram sem CAPTCHA.
- A loja exige pedido mínimo de R$89,90. Para alcançar a próxima etapa sem criar pedido, foi montada uma cesta temporária apenas com itens úteis, no menor total prático encontrado acima do mínimo: R$97,76.
- O checkout exigiu e-mail e depois dados pessoais. O e-mail operacional não estava cadastrado; nome, CPF e telefone já autorizados foram preenchidos e o recebimento de marketing foi recusado.
- A adesão obrigatória ao Programa Cliente Bem Querer foi autorizada pelo dono e concluída uma vez, com marketing desmarcado.
- O endereço operacional autorizado foi preenchido e salvo. O site apresentou inconsistência ao selecionar a unidade de entrega. Para isolar o gate de pagamento sem criar pedido, o checkout foi aberto com retirada em loja.
- Na tela real de pagamento, após carregamento completo, as únicas opções apresentadas foram **Cartão de crédito** e **Google Pay**. Não havia Pix.
- Nenhum botão final foi acionado. Nenhum pedido, Pix, pagamento ou cobrança foi criado. A cesta temporária foi esvaziada ao final.

O checkout online observado não oferece Pix, portanto a Oba reprova o gate dessa arquitetura mesmo sem o CAPTCHA encontrado na Pague Menos. A página oficial localizada sobre Pix descreve o QR nos caixas das lojas físicas e é compatível com a observação de que esse meio não está disponível no delivery online. A loja continua fora da allowlist.

Fonte pública complementar: [Oba — Pix nos caixas das lojas](https://blog.obahortifruti.com.br/pague-suas-compras-no-oba-com-pix-2/). A fonte não deve ser usada como prova de Pix no delivery online.

## Checkout real da Pague Menos

Fonte: perfil Chrome persistente `paguemenos`, inspecionado em 10/09/2026 na página `/checkout/#/payment`.

Estado observado antes da mudança de pagamento:

- Conta autenticada e dados pessoais exibidos pelo checkout.
- Um Fio Dental Reach Essencial Expansion Plus 100 m, vendido e entregue por Farmácias Pague Menos.
- Quantidade 1; subtotal R$19,49; frete econômico R$4,90; total R$24,39.
- Destino igual ao da preparação anterior. Nenhum teste de outro destinatário foi feito, porque o gate anterior já falhou.
- Cartão salvo selecionado e campo obrigatório de código de segurança presente. O código não foi registrado neste documento.

Após selecionar Pix:

- O checkout mostrou “Aperte em Finalizar compra para gerar o código QR”.
- A seção “Verificação de segurança” e a caixa “Não sou um robô” continuaram presentes.
- A caixa permaneceu desmarcada e o botão de finalização permaneceu desabilitado.
- Nenhuma tentativa de resolver o CAPTCHA ou finalizar foi feita.

Interpretação limitada: esta observação prova que **o checkout real atual da Pague Menos exige intervenção antes de emitir o Pix nesta cesta e sessão**. Não prova que todas as lojas VTEX façam o mesmo. Também não permite afirmar se a exigência é permanente para toda compra na Pague Menos; uma rota que depende de obter comportamento diferente sem controle da Lia não satisfaz o gate de automação.

## Conta de pagamento por API

Estado local:

- Nenhuma variável ou credencial Asaas, Efí/Gerencianet foi encontrada nos arquivos de ambiente inspecionados.
- A configuração privada do comprador contém Drogaria São Paulo, Pague Menos, Oba, Cobasi e Swift; não contém um provedor de pagamento Pix.

O que as fontes públicas sustentam:

- O Asaas documenta `POST /v3/pix/qrCodes/pay`, usando o saldo da conta, e orienta guardar o ID retornado e consultar o estado; a resposta inicial não é confirmação definitiva.
- O Asaas documenta autorização de saídas por webhook, inclusive para pagamento de QR Pix.
- O próprio Asaas informa que uma ação crítica adicional depende da operação, do endpoint e da configuração da conta. O webhook é um mecanismo complementar; não há garantia pública de ausência de código humano em toda conta de produção.
- Na referência pública consultada, o pagamento de QR recebe QR, valor, descrição e data opcional. Não foi encontrada uma chave de idempotência ou referência externa que resolva inequivocamente um timeout anterior ao retorno do ID.

Por isso, existência do endpoint não aprova o gate bancário. Antes de integração, o fornecedor precisa responder por escrito ou demonstrar em conta de produção: operação sem confirmação por transação, limites suficientes e recuperação inequívoca de resultado incerto.

Fontes:

- [Asaas — pagar QR Code](https://docs.asaas.com/reference/pagar-um-qrcode)
- [Asaas — autorização de saídas por webhook](https://docs.asaas.com/docs/mecanismo-para-validacao-de-saque-via-webhooks)
- [Asaas — ações críticas](https://docs.asaas.com/docs/como-testar-a%C3%A7%C3%B5es-cr%C3%ADticas)
- [VTEX — casos de aplicação do reCAPTCHA](https://developers.vtex.com/docs/guides/applicable-cases)

## Próximo gate

O próximo gate é autenticação operacional, não outra cesta. O componente de leitura já existe; falta autorizar o OAuth somente leitura da caixa operacional, guardar as três credenciais no Chaves e validar com `npm run purchase-worker:mailbox-check`. Depois, retomar somente a Swift, com a cesta mínima, até a tela de pagamento. A candidata precisa permitir chegar ao QR sem desafio humano, usar destinatários diferentes numa conta operacional e oferecer consulta posterior inequívoca do pedido.

Somente depois de uma loja passar esse gate deve-se retomar a diligência bancária e construir o protótipo financeiro. Pague Menos, Oba, Cobasi e Swift não devem receber adaptadores Pix nem entrar na allowlist no estado atual.
