## 13/09/2026 — E8 bloqueado pelo limite de tentativas do Mercado Livre

Captura enviada pelo dono mostra: “Você alcançou o limite de tentativas. Por favor,
tente novamente mais tarde.” A página não informa prazo, causa nem alcance do bloqueio.
Não interpretar como senha incorreta ou desativação permanente da conta. Setup local
interrompido para encerrar a janela de configuração; perfil preservado. Não repetir login,
sondagem ou trocar perfil/rede para contornar a restrição. Retomar pelo fluxo normal após
liberação do ML; se persistir, usar recuperação/suporte oficial. E8 continua não homologado,
sem carrinho preparado ou compra nesta sessão. Gmail E0 validado permanece concluído.

## 13/09/2026 — E8 iniciado: perfil ML reaberto

Primeira abertura falhou porque o processo setup anterior ainda mantinha o perfil ML.
Processo anterior encerrado; `purchase-worker:setup -- mercadolivre` reabriu o perfil
persistente com sucesso. Leitura da janela Chrome pela ferramenta de UI falhou por timeout
em duas tentativas. Solicitado ao dono confirmar login/2FA e fechar a janela para liberar
perfil à sondagem. Autenticação ainda não homologada; nenhum item adicionado ou compra.
Gmail E0 continua validado. Seletores/limpeza/frete/endereço ML ainda sem prova real.

## 13/09/2026 — E0 concluído: Gmail readonly validado ao vivo

Consentimento Google concluído para a caixa operacional confirmada. Script retornou
`{"mailbox":"gmail","authorization":"stored"}` e gravou refresh token no Chaves.
`npm run purchase-worker:mailbox-check` terminou com exit code 0 e
`{"mailbox":"gmail","status":"ready"}`. Client ID, Secret e Refresh Token ficam no
Chaves; valores não registrados em Markdown. A leitura via `security` foi liberada pelo
dono. Isso valida autenticação/API, não uma mensagem real de login/rastreio de loja.
App continua externo/Testando. Próximo: E8, sessão do ML e sondagem; não ativar serviço
ou allowlist por inferência deste teste. Nenhuma compra ou mensagem enviada.

## 13/09/2026 — Chaves liberado; autorização chegou ao login Google

**Avanço:** login Google concluído; tela final do app pede somente “Ver suas configurações e mensagens de e-mail” (`gmail.readonly`). Aguardando o dono clicar Permitir, por ser concessão nova de acesso à caixa. Refresh token ainda pendente.


`mailbox-authorize` leu as credenciais e emitiu URL OAuth com escopo único
`gmail.readonly`, PKCE e callback local. URL aberta no navegador interno; conta operacional
selecionada, Google solicitou senha novamente. Aguarda login do dono e consentimento.
Refresh token ainda não confirmado; processo tem prazo de cinco minutos após emitir URL.

## 13/09/2026 — leitura das duas credenciais confirmada

Checagens isoladas com `security find-generic-password -w` leram Client ID e Client
Secret com exit code 0, sem exibir valores. Logo não há evidência de senha incorreta;
as tentativas anteriores de autorização falharam na leitura, com erro genérico do script.
Fluxo `purchase-worker:mailbox-authorize` reiniciado; nova leitura aguarda o Chaves.
Permitir uma vez nas checagens não autoriza automaticamente o processo seguinte.
OAuth/refresh token e `mailbox-check: ready` ainda não concluídos.

## 13/09/2026 — retomada do OAuth

Dono esclareceu que a janela reaparece sem mensagem explícita de senha incorreta.
Processo identificado aguardando `Lia Gmail Client Secret`; leitor solicita ID e Secret
em sequência, portanto repetição visual pode ser o segundo item. Isso ainda não comprova
sucesso na leitura do primeiro. Orientado liberar o item Secret e acompanhar resultado.


Client ID e Client Secret continuam presentes no Chaves; refresh token ausente.
Nova execução de `purchase-worker:mailbox-authorize` aguarda leitura pelo `security`,
ainda sem URL de consentimento. Solicitado texto exato da janela ao dono para diagnosticar
a recusa anterior. Nenhuma alteração de senha/ACL, leitura de e-mail ou ativação realizada.

## 11/09/2026 — OAuth criado, Gmail API ativa; liberação do Chaves pendente
**Diagnóstico seguinte (11/09):** dono relatou que a senha do Mac não liberou o acesso.
A autorização encerrou sem URL/refresh token. Itens Gmail existem no chaveiro login;
controle de acesso inspecionado sem alteração: confirmar acesso, aplicativo confiável
`swift-frontend` (gravador), enquanto leitor usa `security`. Motivo exato da recusa ainda
não confirmado; solicitar texto do diálogo antes de nova tentativa. Não redefinir
chaveiro nem ampliar acesso para todos os aplicativos.



Com aceite do dono, configuração OAuth criada no projeto `alpine-anvil-497620-p3`:
app “Lia Comprador — leitura de e-mails”, externo/Testando; conta operacional confirmada
adicionada como único usuário de teste. Cliente Desktop “Lia Purchase Worker Mac” criado.
Client ID e Client Secret importados para os serviços correspondentes no Chaves; presença
verificada sem revelar valores. Gmail API mostrou status Ativado no console.
`purchase-worker:mailbox-authorize` iniciado, mas aguarda `security` ler o Chaves; nenhuma
URL de consentimento emitida ainda. Diálogo SecurityAgent indisponível para automação:
dono deve liberar acesso local com a senha do Mac. Refresh token e `mailbox-check: ready`
ainda pendentes. Nenhuma leitura de e-mail ou ativação do comprador realizada.

## 11/09/2026 — Google Cloud autenticado; cadastro OAuth preparado

Dono confirmou que a conta conectada no Google Cloud é a caixa operacional das lojas.
No projeto `alpine-anvil-497620-p3` (My First Project), a plataforma OAuth ainda não
estava configurada. Formulário preparado: “Lia Comprador — leitura de e-mails”, público
externo/teste, suporte/contato na conta confirmada. Parado antes do aceite da política
de dados das APIs Google, aguardando confirmação do dono. Nenhum OAuth client, segredo,
escopo, consentimento de leitura ou refresh token criado nesta etapa.

## 11/09/2026 — endereço de sondagem salvo; criação OAuth ainda pendente

Dono forneceu endereço operacional, CEP e destinatário. Dados salvos somente no
`probe` do `.retail-buyer/config.json` privado (0600, fora do git); bairro/cidade/UF
conferidos pelo CEP. Não copiar endereço completo para documentação versionada.
Dono confirmou que ainda não criou o cliente OAuth Gmail. Google Cloud aberto no
navegador interno do Codex, parado na tela de login; aguarda entrada do dono na conta
que recebe e-mails das lojas. Nenhum cliente OAuth, consentimento ou token novo criado.
Sondagem ML ainda não executada; login no perfil comprador não confirmado.

## 11/09/2026 — conferência local de E0/E8 e abertura do perfil ML

Conferido no Mac: `config.json` privado contém Mercado Livre; bloco `probe` ausente.
`mailbox-check` falhou por ausência de Client ID, Client Secret e refresh token Gmail.
No Chaves, conta `lia-purchase-worker`: **Lia Purchase Worker presente** (validade no
servidor não testada); **Lia Tracking Worker ausente**. Os nomes corretos não têm o
sufixo “Token”. Serviço `com.liadelivery.purchase-worker` ainda não instalado.
Executado `purchase-worker:setup -- mercadolivre`: perfil criado e janela aberta para
login/2FA do dono; autenticação ainda não confirmada. Aguardando endereço operacional e
estado da criação do OAuth. Nenhum carrinho preparado, compra, mensagem ou ativação.

O commit documental `001593c`/STATUS já registra o deploy zero de `398217b` e 23/23
migrations; o cabeçalho anterior que dizia “nada publicado” ficou histórico. Produção
não foi revalidada nesta conferência. Não repetir deploy por esse cabeçalho antigo.
Atenção à sondagem atual: `mercadolivre.ts` lê itens/preços, mas `snapshot` usa endereço,
e-mail e frete fornecidos pelo job (no probe, frete zero); não comprova frete real,
endereço ou identidade da conta. Esses dados continuam exigindo conferência no app.

## 10/09/2026 — Cobasi e Swift pararam no código de acesso por e-mail

As duas lojas foram testadas com carrinhos mínimos, sem criar pedido. Na Cobasi, o carrinho real tinha uma unidade de produto útil de R$2,80; o cadastro enviou código ao e-mail operacional. Na Swift, uma unidade de R$4,50 somou R$22,40 com o frete, e o acesso rápido também enviou uma chave ao e-mail operacional antes do pagamento. A caixa não estava autenticada nos perfis do comprador. Os fluxos foram encerrados, os carrinhos esvaziados e nenhum pedido, Pix, pagamento ou cobrança foi criado.

As duas lojas anunciam Pix, mas o ensaio não alcançou a tela de pagamento. Permanecem fora da allowlist. Antes de novo teste, o comprador precisa de acesso programático e auditável ao e-mail operacional ou de uma sessão homologada que não exija código por compra. Não montar outra cesta até resolver esse gate.

## 10/09/2026 — Oba reprovada: checkout online não oferece Pix

Como alternativa após a reprovação da Pague Menos, a Oba foi testada até a tela real de pagamento. O site abriu o checkout sem CAPTCHA e exige pedido mínimo de R$89,90. O cadastro obrigatório no Programa Cliente Bem Querer foi autorizado e concluído uma vez, com marketing desmarcado. Foi usada uma cesta temporária de itens úteis, no menor total prático encontrado acima do mínimo: R$97,76.

O endereço operacional autorizado foi salvo, embora o site tenha apresentado inconsistência ao selecionar a unidade de entrega. Para isolar o pagamento, o checkout foi aberto com retirada em loja. As únicas formas exibidas foram cartão de crédito e Google Pay; Pix não estava disponível. Nenhum pedido, pagamento ou cobrança foi criado, e a cesta foi esvaziada ao final. Oba permanece fora da allowlist e está reprovada para a rota de pagamento automatizado por QR Pix.

Há ainda um bloqueio econômico para o piloto definido: cinco pedidos no mínimo da loja custariam ao menos R$449,50 em produtos; com o frete agendado mínimo observado de R$9,90 por pedido, o piso é R$499,00. Isso praticamente consumiria todo o teto de R$500 da prova. O teto é limite, não meta; não usar a Oba para fabricar uma amostra cara.

## 10/09/2026 — Pague Menos reprovada também no checkout Pix

Na cesta já preparada, a opção Pix foi selecionada sem finalizar. O checkout informou que o QR seria gerado após “Finalizar compra”, mas continuou mostrando a verificação “Não sou um robô” e manteve o botão de finalização desabilitado. Nenhum CAPTCHA foi resolvido, pedido criado, pagamento ou compra realizada. Pix remove o CVV, porém não removeu a intervenção antes da emissão da cobrança nesta sessão. Pague Menos permanece fora da allowlist e está reprovada como primeira rota de compra automática por Pix. Evidência e próximo gate em [validação Pix](evidencias-validacao-compra-pix-2026-09-10.md).

## 09/09/2026 — Pague Menos validada em compra real; recompra exige CVV

No perfil Chrome dedicado `paguemenos`, sessão `lia-paguemenos`, a conta ficou autenticada e os dados obrigatórios foram salvos. Com autorização explícita do dono, um checkout real foi concluído: pedido `#1660399032770`, total R$24,39. O site apresentou verificação de robô antes da confirmação e o dono a concluiu manualmente. A página de sucesso exibiu número, data, total e forma de entrega. O cartão passou a constar como salvo em “Meus cartões”.

Uma segunda cesta foi levada até pagamento sem finalizar. O checkout reutilizou cadastro e endereço sem pedir novamente os dados, reconheceu o cartão salvo, mas mostrou campo obrigatório de código de segurança. Não armazenar o CVV. O CAPTCHA recorrente ainda não pode ser concluído sem preencher esse campo e autorizar uma segunda cobrança real. Pague Menos permanece fora da allowlist: no formato atual, exige intervenção por compra e ainda faltam seletores homologados de envio, recibo e rastreio. Drogaria São Paulo segue sem confirmação de cadastro/login/código e não é candidata pronta.

## 08/09/2026 — senha fornecida; autenticação da primeira loja sem confirmação

O dono forneceu explicitamente a senha para uso nas lojas. A senha foi preenchida na Drogaria São Paulo (não foi gerada outra, não foi gravada no Chaves nem em arquivo). Portanto NÃO pedir autorização para gerar senha novamente: esse caminho foi abandonado em favor da senha definida pelo dono. Não transcrever senha, CPF ou celular nesta documentação.

Cadastro completo apresentou campos válidos, incluindo senhas iguais; cliques em CADASTRAR CONTA não confirmaram criação nem mostraram motivo. Teste de login também não confirmou acesso. Caminho CHAVE ACESSO POR E-MAIL → CONFIRMAR permaneceu no campo de e-mail, inclusive após clique normal de mouse; envio de código NÃO confirmado. Não repetir em loop. Nenhuma conta autenticada, cartão salvo ou compra. Pague Menos retomada como alternativa para primeira loja operacional; não é liberação automática nem expansão indiscriminada.

## 08/09/2026 — CPF e celular recebidos e preenchidos

O dono informou CPF e celular no chat, autorizando preenchimento. Ambos foram preenchidos na Drogaria São Paulo e passaram na validação local do formulário. E-mail e sobrenome também válidos. O campo Nome rejeita espaço (pattern do site `[A-zÀ-ÿs]{3,}`); foi ajustado para Joseph, sobrenome Dayan. Não copiar CPF/telefone para documentação pública. A resposta do dono NÃO confirmou a autorização pendente para gerar/persistir senha no Chaves; não executar essa operação até confirmação explícita. Senha e confirmação vazias, cadastro não enviado e cartão ainda não alcançado. Perfil operacional aberto; após reinício do controlador, formulário precisou ser reaberto e preenchido novamente.

## 08/09/2026 — cadastro da Drogaria São Paulo retomado

Perfil persistente `.retail-buyer/profiles/drogariasp` aberto com sucesso pelo agent-browser (sessão `lia-drogariasp`). Formulário “Cadastrar Nova Conta”: e-mail informado pelo dono, nome Joseph Carlos e sobrenome Dayan preenchidos e verificados. Campos restantes observados: CPF, telefone, senha e confirmação; este formulário não pede nascimento. Marketing ficou desmarcado. Nenhum cadastro enviado, login confirmado, cartão cadastrado ou compra feita. A janela permanece no formulário.

Solicitados CPF/celular (pergunta inicial incluía nascimento para outras lojas). A tentativa de criar senha exclusiva e guardar no Chaves foi REJEITADA pela revisão automática antes da execução: exigiu autorização específica para gerar/persistir a credencial. Não contornar por arquivo ou outro mecanismo; obter autorização explícita ou dono definir diretamente. Serviço planejado, ainda não criado: “Lia Retail Onboarding - drogariasp”. Uso de cartão salvo ainda não alcançado/validado. A retomada automática da sessão antiga da Pague Menos devolveu página sem elementos; não foi preenchida nem considerada autenticada.

# Preparação das contas de compra

## Configuração das lojas no Chrome — 07/09/2026

O dono pediu preparar todas as lojas e confirmou usar o mesmo Chrome/perfis das compras futuras. Foram abertos perfis dedicados; isso não habilita automaticamente o executor. E-mail informado preenchido em Swift, Cacau Show, Kalunga, Pague Menos, Cobasi, Imigrantes, Decathlon, Oba, Carrefour e Giuliana Flores. Nome também preenchido em Swift, Imigrantes e Giuliana. Petz também teve nome e e-mail preenchidos e verificados no formulário completo: 11 lojas com dados preenchidos, sem submissão final.

Faltam dados pessoais não confirmados (CPF, nascimento, telefones), senhas e validações. Boticário e Droga Raia responderam acesso negado. Ri Happy exige localização; Divvino mostra confirmação de idade. Natural da Terra e Kopenhagen não disponibilizaram formulário utilizável nesta tentativa. Mercado Livre não apresentou conteúdo interativo. Drogaria São Paulo segue na janela original de setup, sem sessão autenticada confirmada. Nenhuma compra realizada, cartão cadastrado ou conta habilitada; salvar cartão e checkout ainda precisam de verificação real. Manter as janelas para participação do dono.
