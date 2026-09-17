"use client";

import { useMemo, useState } from "react";

const PRODUCT = "Ração Pedigree Nutrição Essencial Carne para cães adultos — 900 g";
const STORE_SEARCH = "https://www.petz.com.br/busca?q=racao%20pedigree%20900g";

const panel: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ddef",
  borderRadius: 18,
  boxShadow: "0 12px 36px rgba(58, 34, 94, 0.08)",
  padding: 22,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#3a225e",
  fontSize: 14,
  fontWeight: 700,
};

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cfc5dc",
  borderRadius: 10,
  background: "#fff",
  color: "#221633",
  padding: "11px 12px",
};

function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function OperatorTestBoard() {
  const [match, setMatch] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");
  const [startedAt] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const total = useMemo(() => {
    const price = Number(unitPrice.replace(",", "."));
    const freight = Number(deliveryFee.replace(",", "."));
    if (!Number.isFinite(price) || !Number.isFinite(freight)) return 0;
    return price * 2 + freight;
  }, [unitPrice, deliveryFee]);

  const elapsedMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  const summary = [
    "TESTE DE OPERADOR — Lia",
    `Produto: ${PRODUCT}`,
    `Correspondência: ${match}`,
    `Preço unitário observado: ${money(Number(unitPrice.replace(",", ".")) || 0)}`,
    `Frete observado: ${money(Number(deliveryFee.replace(",", ".")) || 0)}`,
    `Total da loja: ${money(total)}`,
    `Prazo mostrado: ${deadline}`,
    `Decisão: ${decision}`,
    `Observações: ${notes.trim() || "Nenhuma"}`,
    `Tempo aproximado: ${elapsedMinutes} min`,
  ].join("\n");

  function finish() {
    if (!match || !unitPrice || !deliveryFee || !deadline.trim() || !decision) {
      setError("Preencha todos os campos obrigatórios antes de concluir.");
      return;
    }
    setError("");
    setFinished(true);
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "30px 18px 64px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: "#6b4d91", fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Lia · ambiente de demonstração
        </div>
        <h1 style={{ margin: "7px 0 6px", fontSize: 28, color: "#3a225e" }}>Teste do operador</h1>
        <p style={{ margin: 0, color: "#667085", lineHeight: 1.55 }}>
          Pedido fictício para avaliar conferência, atenção e comunicação. Nenhum dado abaixo pertence a um cliente real.
        </p>
      </header>

      <section style={{ ...panel, marginBottom: 16, borderColor: "#f0b429", background: "#fffaf0" }}>
        <strong style={{ color: "#8a4b08" }}>Não finalize nenhuma compra.</strong>
        <p style={{ margin: "7px 0 0", color: "#704214", lineHeight: 1.5 }}>
          Você pode pesquisar e montar o carrinho, mas deve parar antes de entrar dados de pagamento ou clicar no botão final da loja.
        </p>
      </section>

      <section style={{ ...panel, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#667085", fontSize: 13 }}>Pedido</div>
            <strong style={{ color: "#3a225e", fontSize: 18 }}>#TESTE-CARLOS</strong>
          </div>
          <span style={{ alignSelf: "flex-start", borderRadius: 999, background: "#f2eaff", color: "#5b3387", padding: "7px 11px", fontSize: 13, fontWeight: 800 }}>
            SIMULADO
          </span>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.35fr) 1fr", gap: "11px 16px", margin: "22px 0 0", lineHeight: 1.45 }}>
          <dt style={{ color: "#667085" }}>Loja indicada</dt><dd style={{ margin: 0, fontWeight: 700 }}>Petz</dd>
          <dt style={{ color: "#667085" }}>Itens</dt><dd style={{ margin: 0, fontWeight: 700 }}>2 × {PRODUCT}</dd>
          <dt style={{ color: "#667085" }}>Endereço fictício</dt><dd style={{ margin: 0 }}>Av. Paulista, 1000 — Bela Vista — São Paulo/SP — 01310-100</dd>
          <dt style={{ color: "#667085" }}>Teto autorizado</dt><dd style={{ margin: 0, fontWeight: 800, color: "#3a225e" }}>R$ 80,00, incluindo frete</dd>
        </dl>

        <a href={STORE_SEARCH} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 20, borderRadius: 10, background: "#3a225e", color: "#fff", padding: "11px 15px", textDecoration: "none", fontWeight: 800 }}>
          Abrir busca na loja ↗
        </a>
      </section>

      <section style={panel}>
        <h2 style={{ margin: "0 0 5px", color: "#3a225e", fontSize: 20 }}>Registre sua conferência</h2>
        <p style={{ margin: "0 0 20px", color: "#667085", lineHeight: 1.5 }}>
          Use exatamente o que estiver visível na loja. Não ajuste números para caber no teto.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <label style={label}>
            O produto encontrado corresponde ao pedido? *
            <select value={match} onChange={(event) => setMatch(event.target.value)} style={field}>
              <option value="">Selecione</option>
              <option value="Exato">Sim, produto exato</option>
              <option value="Divergente">Não, encontrei apenas outra variação</option>
              <option value="Sem estoque">Não encontrei / sem estoque</option>
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <label style={label}>
              Preço unitário na loja (R$) *
              <input inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="Ex.: 24,90" style={field} />
            </label>
            <label style={label}>
              Frete mostrado (R$) *
              <input inputMode="decimal" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} placeholder="Ex.: 12,00" style={field} />
            </label>
          </div>

          <div style={{ borderRadius: 12, background: total > 80 ? "#fff0f0" : "#f2f7ed", color: total > 80 ? "#9b1c1c" : "#315b22", padding: "12px 14px", fontWeight: 800 }}>
            Total calculado: {money(total)} {total > 80 ? "— acima do teto: deve escalar" : total > 0 ? "— dentro do teto" : ""}
          </div>

          <label style={label}>
            Prazo de entrega mostrado pela loja *
            <input value={deadline} onChange={(event) => setDeadline(event.target.value)} placeholder="Ex.: amanhã, entre 10h e 18h" style={field} />
          </label>

          <label style={label}>
            Qual seria sua decisão? *
            <select value={decision} onChange={(event) => setDecision(event.target.value)} style={field}>
              <option value="">Selecione</option>
              <option value="Pronto para comprar">Pronto para comprar</option>
              <option value="Pausar e chamar o responsável">Pausar e chamar o responsável</option>
            </select>
          </label>

          <label style={label}>
            Observações ou divergências
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Explique qualquer diferença de produto, estoque, preço, frete ou prazo." rows={4} style={{ ...field, resize: "vertical" }} />
          </label>

          {error && <div style={{ color: "#9b1c1c", fontWeight: 700 }}>{error}</div>}

          <button type="button" onClick={finish} style={{ border: 0, borderRadius: 11, background: "#d9ff5b", color: "#3a225e", padding: "13px 16px", fontWeight: 900, cursor: "pointer" }}>
            Concluir teste sem comprar
          </button>
        </div>
      </section>

      {finished && (
        <section style={{ ...panel, marginTop: 16, borderColor: "#79a94b" }}>
          <h2 style={{ margin: "0 0 6px", color: "#315b22" }}>Teste concluído</h2>
          <p style={{ margin: "0 0 14px", color: "#52644a" }}>Copie o resumo e envie ao responsável pela operação no WhatsApp.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderRadius: 12, background: "#f7f7f4", padding: 14, color: "#221633", fontSize: 13, lineHeight: 1.55 }}>{summary}</pre>
          <button type="button" onClick={copySummary} style={{ border: 0, borderRadius: 10, background: "#3a225e", color: "#fff", padding: "11px 15px", fontWeight: 800, cursor: "pointer" }}>
            {copied ? "Resumo copiado" : "Copiar resumo"}
          </button>
        </section>
      )}
    </main>
  );
}
