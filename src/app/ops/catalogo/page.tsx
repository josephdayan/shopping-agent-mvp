import CatalogBoard from "./CatalogBoard";

export const dynamic = "force-dynamic";

export default function CatalogPage() {
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Lia · Catálogo</h1>
      <p style={{ color: "#667085", marginTop: 6 }}>
        Todos os produtos que a Lia oferece (Carrefour + Petz). O preço mostrado já inclui a margem de 10%; o custo é o que pagamos na loja.
      </p>
      <CatalogBoard />
    </main>
  );
}
