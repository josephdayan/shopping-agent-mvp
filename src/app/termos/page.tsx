import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Termos de uso da Lia Delivery."
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f3f2ed] px-6 py-12 text-[#0b2128] sm:px-10">
      <article className="mx-auto max-w-3xl rounded-lg bg-white p-8 shadow-sm sm:p-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#0f3d3a]">Lia Delivery</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Termos de uso</h1>
        <p className="mt-3 text-sm text-slate-600">Última atualização: 9 de julho de 2026</p>

        <div className="mt-10 space-y-8 text-base leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-[#0b2128]">1. Aceitação</h2>
            <p className="mt-2">
              Ao iniciar um atendimento com a Lia Delivery, serviço operado por 67.742.955 JOSEPH CARLOS DAYAN,
              CNPJ 67.742.955/0001-95, você concorda com estes termos e com a Política de privacidade. A empresa
              pode atualizar os termos quando necessário, mantendo a versão vigente nesta página.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0b2128]">2. Atendimento e pedidos</h2>
            <p className="mt-2">
              A Lia ajuda a encontrar produtos, montar uma cesta, calcular a entrega e acompanhar o pedido. O pedido
              só é confirmado depois que os itens, o valor e as condições de entrega forem apresentados e o pagamento
              for aprovado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0b2128]">3. Preços, pagamento e entrega</h2>
            <p className="mt-2">
              Preços, disponibilidade, prazo e taxa de entrega podem variar até a confirmação. O pagamento é processado
              por um provedor de pagamento indicado no atendimento. A entrega depende da disponibilidade do fornecedor e
              da área atendida.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0b2128]">4. Uso responsável</h2>
            <p className="mt-2">
              Você deve fornecer informações verdadeiras, usar o serviço de forma legal e não tentar comprometer o
              atendimento, os sistemas ou os meios de pagamento. Podemos interromper atendimentos que apresentem risco,
              fraude ou abuso.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#0b2128]">5. Suporte</h2>
            <p className="mt-2">
              Para dúvidas sobre um pedido, cancelamento ou estes termos, envie uma mensagem pelo WhatsApp da Lia no
              número (11) 97844-4813.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
