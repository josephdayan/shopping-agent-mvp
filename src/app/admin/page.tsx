import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDollarSign, FastForward, ListTodo, Users } from "lucide-react";
import { getAdminSnapshot } from "@/lib/admin-service";
import AdminActions from "@/components/admin-actions";
import ProductActions from "@/components/product-actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await getAdminSnapshot();
  const paid = data.orders.filter((order) => order.paymentStatus === "approved").length;
  const pending = data.orders.filter((order) => order.paymentStatus === "awaiting_payment").length;

  return (
    <main className="min-h-screen px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/" className="mb-2 inline-flex items-center gap-2 text-sm text-ink/65 hover:text-leaf">
              <ArrowLeft size={16} />
              Voltar ao chat
            </Link>
            <h1 className="text-2xl font-semibold">Admin dashboard</h1>
          </div>
          <AdminActions />
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric icon={<Users size={18} />} label="Usuarios" value={data.users.length} />
          <Metric icon={<CircleDollarSign size={18} />} label="Pagamentos pendentes" value={pending} />
          <Metric icon={<CheckCircle2 size={18} />} label="Pagos" value={paid} />
          <Metric icon={<ListTodo size={18} />} label="Tarefas ops" value={data.opsTasks.filter((task) => task.status === "open").length} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-md border border-ink/10 bg-white shadow-soft">
            <div className="border-b border-ink/10 px-4 py-3">
              <h2 className="font-semibold">Pedidos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-mist text-xs uppercase text-ink/55">
                  <tr>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Pagamento</th>
                    <th className="px-4 py-3">Fulfillment</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order) => (
                    <tr key={order.id} className="border-t border-ink/10">
                      <td className="px-4 py-3">
                        <p className="font-medium">{order.product.title}</p>
                        <p className="text-xs text-ink/55">{order.product.store} · {sourceLabel(order.product.source)}</p>
                      </td>
                      <td className="px-4 py-3">{order.user.name ?? order.user.phone}</td>
                      <td className="px-4 py-3">{order.paymentStatus}</td>
                      <td className="px-4 py-3">
                        <p>{order.fulfillmentStatus}</p>
                        <p className="text-xs text-ink/55">{fulfillmentLabel(order.fulfillmentMode)}</p>
                      </td>
                      <td className="px-4 py-3">R$ {order.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <AdminActions orderId={order.id} canApprove={order.paymentStatus === "awaiting_payment"} canAdvance={order.paymentStatus === "approved"} />
                      </td>
                    </tr>
                  ))}
                  {!data.orders.length && (
                    <tr>
                      <td className="px-4 py-6 text-ink/55" colSpan={6}>Nenhum pedido ainda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <Panel title="Usuarios">
              <div className="space-y-3">
                {data.users.map((user) => (
                  <div key={user.id} className="rounded-md border border-ink/10 p-3 text-sm">
                    <p className="font-medium">{user.name ?? user.phone}</p>
                    <p className="text-ink/60">{user.defaultAddress ?? "Sem endereco"}</p>
                    {user.preferences.map((preference) => (
                      <p key={preference.id} className="mt-2 text-xs text-leaf">
                        {preference.category}: {preference.preferredBrand ?? "sem marca"} · {preference.priceSensitivity}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Catalogo mockado">
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {data.products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-ink/10 p-2 text-sm">
                    <div>
                      <p className="font-medium">{product.title}</p>
                      <p className="text-xs text-ink/55">
                        {product.category} · {sourceLabel(product.source)} · {fulfillmentLabel(product.fulfillmentMode)}
                      </p>
                      <ProductActions productId={product.id} available={product.availability} />
                    </div>
                    <span className="font-semibold">R$ {product.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <section className="rounded-md border border-ink/10 bg-white p-4 shadow-soft">
          <h2 className="mb-3 font-semibold">Fila operacional</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.opsTasks.map((task) => (
              <div key={task.id} className="rounded-md border border-ink/10 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{task.title}</span>
                  <span className="rounded-md bg-mist px-2 py-1 text-xs text-leaf">{task.status}</span>
                </div>
                <p className="text-ink/65">{task.notes}</p>
                <p className="mt-2 text-xs text-ink/50">
                  {task.order.product.title} · {task.order.user.name ?? task.order.user.phone}
                </p>
              </div>
            ))}
            {!data.opsTasks.length && <p className="text-sm text-ink/55">Nenhuma tarefa operacional aberta.</p>}
          </div>
        </section>

        <section className="rounded-md border border-ink/10 bg-white p-4 shadow-soft">
          <h2 className="mb-3 font-semibold">Conversas</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.conversations.map((conversation) => (
              <div key={conversation.id} className="rounded-md border border-ink/10 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{conversation.user.name ?? conversation.user.phone}</span>
                  <span className="rounded-md bg-mist px-2 py-1 text-xs text-leaf">{conversation.currentStep}</span>
                </div>
                <div className="space-y-1 text-ink/65">
                  {conversation.messages.slice(-3).map((message) => (
                    <p key={message.id} className="truncate">
                      <strong>{message.sender}:</strong> {message.text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    mercado_livre: "Mercado Livre",
    rappi: "Rappi",
    farmacia: "Farmacia",
    loja_local: "Loja local"
  };
  return labels[source] ?? source;
}

function fulfillmentLabel(mode: string) {
  const labels: Record<string, string> = {
    marketplace_native: "entrega nativa",
    local_courier: "courier",
    manual_operator: "manual"
  };
  return labels[mode] ?? mode;
}


function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white p-4 shadow-soft">
      <div className="mb-3 text-leaf">{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-ink/60">{label}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
