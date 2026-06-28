import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDollarSign, FastForward, ListTodo, Users } from "lucide-react";
import { getAdminSnapshot } from "@/lib/admin-service";
import AdminActions from "@/components/admin-actions";
import ProductActions from "@/components/product-actions";
import LiaBrand from "@/components/lia-brand";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await getAdminSnapshot();
  const paid = data.orders.filter((order) => order.paymentStatus === "approved").length;
  const pending = data.orders.filter((order) => order.paymentStatus === "awaiting_payment").length;

  return (
    <main className="min-h-screen bg-lia-lavender/55 px-4 py-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-lia-line bg-lia-night px-4 py-4 text-lia-lavender shadow-brand">
          <div className="space-y-3">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-lia-lavender/65 hover:text-lia-aqua">
              <ArrowLeft size={16} />
              Voltar ao chat
            </Link>
            <LiaBrand variant="dark" showDescriptor />
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
          <div className="rounded-md border border-lia-line bg-white shadow-soft">
            <div className="border-b border-lia-line px-4 py-3">
              <h2 className="font-semibold">Pedidos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-lia-lavender font-mono text-[10px] uppercase tracking-[0.12em] text-lia-muted">
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
                    <tr key={order.id} className="border-t border-lia-line">
                      <td className="px-4 py-3">
                        <p className="font-medium">{order.product.title}</p>
                        <p className="text-xs text-lia-muted">{order.product.store} · {sourceLabel(order.product.source)}</p>
                      </td>
                      <td className="px-4 py-3">{order.user.name ?? order.user.phone}</td>
                      <td className="px-4 py-3">{order.paymentStatus}</td>
                      <td className="px-4 py-3">
                        <p>{order.fulfillmentStatus}</p>
                        <p className="text-xs text-lia-muted">{fulfillmentLabel(order.fulfillmentMode)}</p>
                      </td>
                      <td className="px-4 py-3">R$ {order.total.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <AdminActions orderId={order.id} canApprove={order.paymentStatus === "awaiting_payment"} canAdvance={order.paymentStatus === "approved"} />
                      </td>
                    </tr>
                  ))}
                  {!data.orders.length && (
                    <tr>
                      <td className="px-4 py-6 text-lia-muted" colSpan={6}>Nenhum pedido ainda.</td>
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
                  <div key={user.id} className="rounded-md border border-lia-line p-3 text-sm">
                    <p className="font-medium">{user.name ?? user.phone}</p>
                    <p className="text-lia-body">{user.defaultAddress ?? "Sem endereco"}</p>
                    {user.preferences.map((preference) => (
                      <p key={preference.id} className="mt-2 text-xs text-lia-green">
                        {preference.category}: {preference.preferredBrand ?? "sem marca"} · {preference.priceSensitivity}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Catalogo Lia">
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {data.products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-lia-line p-2 text-sm">
                    <div>
                      <p className="font-medium">{product.title}</p>
                      <p className="text-xs text-lia-muted">
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

        <section className="rounded-md border border-lia-line bg-white p-4 shadow-soft">
          <h2 className="mb-3 font-semibold">Fila operacional</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.opsTasks.map((task) => (
              <div key={task.id} className="rounded-md border border-lia-line p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{task.title}</span>
                  <span className="rounded-md bg-lia-aqua/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-lia-night">{task.status}</span>
                </div>
                <p className="text-lia-body">{task.notes}</p>
                <p className="mt-2 text-xs text-lia-muted">
                  {task.order.product.title} · {task.order.user.name ?? task.order.user.phone}
                </p>
              </div>
            ))}
            {!data.opsTasks.length && <p className="text-sm text-lia-muted">Nenhuma tarefa operacional aberta.</p>}
          </div>
        </section>

        <section className="rounded-md border border-lia-line bg-white p-4 shadow-soft">
          <h2 className="mb-3 font-semibold">Conversas</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.conversations.map((conversation) => (
              <div key={conversation.id} className="rounded-md border border-lia-line p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{conversation.user.name ?? conversation.user.phone}</span>
                  <span className="rounded-md bg-lia-aqua/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-lia-night">{conversation.currentStep}</span>
                </div>
                <div className="space-y-1 text-lia-body">
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
    <div className="rounded-md border border-lia-line bg-white p-4 shadow-soft">
      <div className="mb-3 text-lia-green">{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-lia-body">{label}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-lia-line bg-white p-4 shadow-soft">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
