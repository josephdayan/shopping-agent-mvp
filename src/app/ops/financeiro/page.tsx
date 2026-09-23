import PnlBoard from "./PnlBoard";

export const dynamic = "force-dynamic";

// Financeiro por pedido (23/09/2026): a planilha do dono, gerada do banco. Só o papel
// "owner" recebe dados — a rota /api/ops/pnl devolve 403 ao operador contratado.
export default function FinanceiroPage() {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Lia · Financeiro</h1>
      <p style={{ color: "#667085", marginTop: 6 }}>
        Por pedido: o que o cliente pagou, a taxa do Mercado Pago, o que saiu na loja (produtos + frete) e o que
        sobrou. Tudo vem do banco; o CSV abre direto no Excel, Numbers ou Google Sheets.
      </p>
      <PnlBoard />
    </main>
  );
}
