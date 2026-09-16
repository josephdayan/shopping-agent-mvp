import { timingSafeEqual } from "node:crypto";
import OperatorTraining from "./OperatorTraining";

export const dynamic = "force-dynamic";
export const metadata = { title: "Treinamento do operador · Lia" };

function tokenMatches(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default function OperatorTrainingPage({ searchParams }: { searchParams: { key?: string } }) {
  if (!tokenMatches(searchParams.key, process.env.OPS_TEST_TOKEN)) {
    return (
      <main style={{ maxWidth: 620, margin: "0 auto", padding: "64px 24px", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Acesso ao treinamento</h1>
        <p style={{ color: "#667085", lineHeight: 1.6 }}>
          Este link não é válido. Peça um novo acesso ao responsável pela operação.
        </p>
      </main>
    );
  }

  return <OperatorTraining />;
}
