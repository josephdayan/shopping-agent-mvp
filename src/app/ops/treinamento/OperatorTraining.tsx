"use client";

import { useMemo, useState } from "react";

const panel: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ddef",
  borderRadius: 18,
  boxShadow: "0 12px 36px rgba(58, 34, 94, 0.07)",
  padding: 22,
};

const warning: React.CSSProperties = {
  ...panel,
  borderColor: "#f0b429",
  background: "#fffaf0",
};

const choices = [
  {
    id: "limit",
    question: "Qual valor limita a compra na loja?",
    options: ["O total pago pelo cliente", "Custo dos itens + frete mostrados no painel", "Qualquer valor abaixo de R$500"],
    correct: 1,
  },
  {
    id: "substitution",
    question: "O produto exato acabou, mas existe um parecido. O que fazer?",
    options: ["Comprar o parecido", "Parar e pedir autorização pelo painel", "Comprar se for mais barato"],
    correct: 1,
  },
  {
    id: "uncertain",
    question: "A loja travou depois do clique final e não ficou claro se comprou. O que fazer?",
    options: ["Clicar novamente", "Conferir pedidos/e-mail e chamar o responsável", "Trocar de cartão e tentar"],
    correct: 1,
  },
  {
    id: "captcha",
    question: "A loja pediu CAPTCHA, reconhecimento ou código de segurança. O que fazer?",
    options: ["Tentar resolver", "Pedir ao cliente", "Parar e chamar o responsável"],
    correct: 2,
  },
  {
    id: "cancel",
    question: "O card mostra que o cliente pediu cancelamento. O que fazer?",
    options: ["Continuar se o carrinho estiver pronto", "Parar e avisar o responsável", "Comprar e cancelar depois"],
    correct: 1,
  },
];

export default function OperatorTraining() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [accepted, setAccepted] = useState(false);
  const [copied, setCopied] = useState(false);

  const allCorrect = useMemo(
    () => choices.every((question) => answers[question.id] === question.correct),
    [answers]
  );
  const complete = allCorrect && accepted;
  const confirmation = [
    "TREINAMENTO DO OPERADOR — LIA",
    "Li o material e acertei a conferência final.",
    "Entendi que:",
    "- só compro pedidos marcados como Pago — comprar na loja;",
    "- confiro produto, quantidade, endereço, frete, prazo e teto antes do clique final;",
    "- nunca substituo item nem aumento o gasto por conta própria;",
    "- não repito uma compra quando o resultado é incerto;",
    "- não uso dinheiro, conta, cartão ou benefícios pessoais;",
    "- protejo os dados do cliente e aviso o responsável nas exceções.",
    "Estou pronto para fazer o primeiro pedido real com aprovação antes da finalização.",
  ].join("\n");

  async function copyConfirmation() {
    await navigator.clipboard.writeText(confirmation);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: "30px 18px 64px", fontFamily: "system-ui, sans-serif", color: "#221633" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: "#6b4d91", fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Lia · treinamento escrito
        </div>
        <h1 style={{ margin: "7px 0 6px", fontSize: 28, color: "#3a225e" }}>Operação de compras</h1>
        <p style={{ margin: 0, color: "#667085", lineHeight: 1.6 }}>
          Leia até o fim. Este material explica o que fazer no painel, os limites da função e como agir quando uma loja falhar.
        </p>
      </header>

      <div style={{ display: "grid", gap: 16 }}>
        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>1. Seu papel</h2>
          <p style={{ lineHeight: 1.65 }}>
            A Lia conversa com o cliente, calcula a cobrança e recebe o pagamento. Você entra depois: confere a loja, monta o carrinho,
            compra com os recursos da operação e acompanha a entrega. Você não vende, não cobra o cliente e não usa dinheiro próprio.
          </p>
          <ul style={{ lineHeight: 1.7 }}>
            <li>Não há horário fixo nem exclusividade. A janela de atendimento é <strong>9h às 20h, horário de São Paulo</strong>.</li>
            <li>Meta: agir em até <strong>2 horas</strong> após o alerta, dentro dessa janela.</li>
            <li>Pedidos fora do horário ficam para o começo da janela seguinte.</li>
            <li>Remuneração do piloto: <strong>R$400 por mês trabalhado, pagos após o período</strong>.</li>
            <li>O volume atual de 5 a 15 pedidos é uma estimativa, não um limite. Não existe adicional automático de R$20 por pedido; crescimento relevante é renegociado antes.</li>
          </ul>
        </section>

        <section style={warning}>
          <h2 style={{ marginTop: 0, color: "#8a4b08" }}>2. As seis travas antes de comprar</h2>
          <ol style={{ lineHeight: 1.75, paddingLeft: 22 }}>
            <li>O status precisa ser <strong>“💳 Pago — comprar na loja”</strong>. “Aguardando pagamento” não autoriza compra.</li>
            <li>Não pode existir faixa de cancelamento, estorno pendente ou instrução para parar.</li>
            <li>Produto, marca, versão, tamanho e quantidade precisam ser exatamente os do card.</li>
            <li>Nome do destinatário e endereço precisam ser copiados do painel, sem completar ou corrigir por conta própria.</li>
            <li>A opção deve ser <strong>entrega da própria loja</strong>, no prazo indicado ao cliente.</li>
            <li>O total da loja não pode superar <strong>custo dos itens + frete</strong> mostrados no painel. “Cliente pagou” inclui a margem da Lia e não é orçamento de compra.</li>
          </ol>
          <p style={{ marginBottom: 0, lineHeight: 1.6 }}><strong>Se uma trava falhar, não finalize.</strong> Avise pelo painel ou chame o responsável no WhatsApp.</p>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>3. Fluxo no painel</h2>
          <ol style={{ lineHeight: 1.75, paddingLeft: 22 }}>
            <li><strong>🧮 Cotar:</strong> abra “🔎 ver”, confira produto, estoque, preço, frete e prazo. Digite o custo real e envie a cotação. Não compre.</li>
            <li><strong>⏳ Aguardando pagamento:</strong> não faça nada na loja. Espere o status mudar.</li>
            <li><strong>💳 Pago — comprar:</strong> use “Abrir itens”, “Copiar lista” e “Copiar endereço”; faça as seis conferências acima.</li>
            <li><strong>Primeiro pedido real:</strong> monte o carrinho e envie ao responsável produto, quantidade, total, frete e prazo. Só clique em finalizar após autorização escrita.</li>
            <li><strong>Compra concluída:</strong> copie o número do pedido e, se houver, o link HTTPS de acompanhamento. Registre imediatamente em “Confirmar compra na loja”.</li>
            <li><strong>Acompanhamento:</strong> quando a loja despachar, registre “Loja saiu para entrega” com o rastreio. Só marque “Entregue” quando houver confirmação real.</li>
          </ol>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>4. Conta e pagamento da loja</h2>
          <ul style={{ lineHeight: 1.7 }}>
            <li>Use somente a conta da loja e o cartão virtual enviados pelo responsável para aquele pedido pago. O cartão não fica dentro do painel e terá limite definido.</li>
            <li>Nunca use conta, cartão, Pix, dinheiro, cupom, pontos ou programa de fidelidade pessoais.</li>
            <li>Não salve o cartão no navegador nem na conta da loja. Não tire foto nem copie os dados para notas.</li>
            <li>Não aceite assinatura, compra recorrente, garantia adicional, seguro, doação ou item sugerido pela loja.</li>
            <li>Se o cartão não chegar, o limite for insuficiente ou a loja pedir CAPTCHA, reconhecimento, CVV adicional ou código de segurança, pare e chame o responsável.</li>
          </ul>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>5. Exceções</h2>
          <div style={{ display: "grid", gap: 12, lineHeight: 1.6 }}>
            <div><strong>Item diferente ou sem estoque:</strong> nunca substitua sozinho. Use “avisar cliente” para explicar objetivamente e aguarde a escolha.</div>
            <div><strong>Preço ou frete aumentou:</strong> não use a margem da Lia para cobrir. Pare e peça nova decisão.</div>
            <div><strong>Endereço rejeitado ou loja não entrega:</strong> confira uma vez o que foi copiado. Se persistir, pare e avise.</div>
            <div><strong>Resultado incerto depois do clique final:</strong> não clique novamente. Confira “Meus pedidos”, e-mail e cobrança; chame o responsável.</div>
            <div><strong>“Não consegui comprar → estornar”:</strong> essa ação devolve dinheiro real ao cliente. Use apenas quando a impossibilidade estiver confirmada (sem estoque, sem entrega no CEP ou mínimo da loja) e escreva o motivo verdadeiro.</div>
            <div><strong>Cancelamento:</strong> ao ver a faixa vermelha, pare imediatamente. O responsável decide o cancelamento e o estorno.</div>
          </div>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>6. Privacidade e comunicação</h2>
          <ul style={{ lineHeight: 1.7 }}>
            <li>Use nome, telefone e endereço do cliente somente para executar aquele pedido.</li>
            <li>Não faça prints, não salve contatos, não copie dados para planilhas e não compartilhe o link do painel.</li>
            <li>Não clique no atalho “WhatsApp” do cliente e não fale com ele pelo seu número. Use somente o campo “avisar cliente” do painel.</li>
            <li>Mensagens devem ser factuais: diga o que ocorreu e qual decisão precisa. Não prometa prazo, desconto, reembolso ou substituição por conta própria.</li>
            <li>Ao encerrar a função, apague dados temporários e avise para o acesso ser revogado.</li>
          </ul>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0, color: "#3a225e" }}>7. Conferência final</h2>
          <p style={{ color: "#667085", lineHeight: 1.55 }}>Marque uma resposta em cada situação. Todas precisam estar corretas.</p>
          <div style={{ display: "grid", gap: 18 }}>
            {choices.map((question) => (
              <fieldset key={question.id} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 800, marginBottom: 8 }}>{question.question}</legend>
                <div style={{ display: "grid", gap: 7 }}>
                  {question.options.map((option, index) => (
                    <label key={option} style={{ display: "flex", gap: 9, alignItems: "flex-start", lineHeight: 1.45 }}>
                      <input
                        type="radio"
                        name={question.id}
                        checked={answers[question.id] === index}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: index }))}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          {Object.keys(answers).length === choices.length && !allCorrect && (
            <p style={{ color: "#9b1c1c", fontWeight: 700 }}>Há resposta incorreta. Revise as seções acima antes de concluir.</p>
          )}

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 22, lineHeight: 1.5, fontWeight: 700 }}>
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            Li todo o material, entendi as regras e vou parar e chamar o responsável sempre que houver dúvida.
          </label>
        </section>

        {complete && (
          <section style={{ ...panel, borderColor: "#79a94b", background: "#f7fbf3" }}>
            <h2 style={{ marginTop: 0, color: "#315b22" }}>Treinamento concluído</h2>
            <p style={{ color: "#52644a", lineHeight: 1.55 }}>Copie a confirmação abaixo e envie ao responsável pelo WhatsApp.</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: 12, background: "#fff", padding: 14, color: "#221633", fontSize: 13, lineHeight: 1.55 }}>{confirmation}</pre>
            <button type="button" onClick={copyConfirmation} style={{ border: 0, borderRadius: 10, background: "#3a225e", color: "#fff", padding: "11px 15px", fontWeight: 800, cursor: "pointer" }}>
              {copied ? "Confirmação copiada" : "Copiar confirmação"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
