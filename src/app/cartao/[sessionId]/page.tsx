import { notFound } from "next/navigation";
import { getCardEnrollmentSession, isCardEnrollmentAvailable } from "@/lib/payments/card-enrollment";
import { pagarmeAdapter } from "@/lib/payments/pagarme";
import { CardEnrollmentForm } from "./CardEnrollmentForm";

export const dynamic = "force-dynamic";

export default async function CardEnrollmentPage({
  params,
  searchParams
}: {
  params: { sessionId: string };
  searchParams: { token?: string | string[] };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const session = token ? await getCardEnrollmentSession(params.sessionId, token) : null;
  if (!session || !isCardEnrollmentAvailable()) notFound();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <p className="text-sm font-medium text-emerald-400">Lia · pagamento seguro</p>
        <h1 className="mt-2 text-2xl font-semibold">Cadastre e pague com cartão</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Esta é a única vez que você preenche o cartão. Nas próximas compras, você confirma tudo no WhatsApp.
        </p>
        <CardEnrollmentForm
          sessionId={session.id}
          sessionToken={token}
          total={session.deliveryOrder.total}
          initialName={session.user.name ?? ""}
          initialEmail={session.user.email ?? ""}
          initialZipCode={session.deliveryOrder.cep ?? ""}
          publicKey={pagarmeAdapter.publicKey()}
        />
      </section>
    </main>
  );
}
