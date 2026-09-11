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
