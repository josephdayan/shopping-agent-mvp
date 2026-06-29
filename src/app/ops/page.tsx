import OpsBoard from "./OpsBoard";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Lia · Operação</h1>
      <p style={{ color: "#667085", marginTop: 6 }}>
        Fila de pedidos pagos — comprar no Carrefour (clique-e-retire) e despachar o motoboy.
      </p>
      <OpsBoard />
    </main>
  );
}
