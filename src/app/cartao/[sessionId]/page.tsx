import { notFound } from "next/navigation";
import { getCardEnrollmentSession, isCardEnrollmentAvailable } from "@/lib/payments/card-enrollment";
import { pagarmeAdapter } from "@/lib/payments/pagarme";
import LiaBrand from "@/components/lia-brand";
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
    <main className="min-h-screen bg-papel px-4 py-8 text-tinta">
      <section className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <LiaBrand />
          <span className="rounded-full bg-poster px-3 py-1 text-xs font-semibold text-acento">
            🔒 pagamento seguro
          </span>
        </div>
        <div className="mt-5 rounded-3xl border border-poster/10 bg-white p-6 shadow-[0_24px_60px_rgba(58,34,94,0.12)]">
          <h1 className="text-2xl font-bold tracking-tight text-poster">Pague com cartão</h1>
          <p className="mt-2 text-sm leading-6 text-tinta/75">
            Você só preenche o cartão <strong>uma vez</strong>. Nas próximas compras, confirma tudo
            direto no WhatsApp, com um toque.
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
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-tinta/60">
          Os dados do cartão vão direto para o Pagar.me (certificado PCI). A Lia não vê nem guarda o
          número do seu cartão.
        </p>
      </section>
    </main>
  );
}
