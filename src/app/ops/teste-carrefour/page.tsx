import CarrefourPreflightTest from "./CarrefourPreflightTest";

export const dynamic = "force-dynamic";

export default function CarrefourPreflightTestPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Teste de cotação Carrefour</h1>
      <CarrefourPreflightTest />
    </main>
  );
}
