import assert from "node:assert/strict";
import test from "node:test";
import { withContextLease, type ContextLeaseStore } from "../src/lib/purchasing/context-lease";

type Lease = { accountKey: string; token: string; expiresAt: Date };

function conflict() {
  return Object.assign(new Error("unique constraint"), { code: "P2002" });
}

function memoryStore(initial: Lease[] = []): { store: ContextLeaseStore; leases: Map<string, Lease> } {
  const leases = new Map(initial.map((lease) => [lease.accountKey, lease]));
  return {
    leases,
    store: {
      async create(lease) {
        if (leases.has(lease.accountKey)) throw conflict();
        leases.set(lease.accountKey, lease);
      },
      async replaceExpired(lease, now) {
        const current = leases.get(lease.accountKey);
        if (!current || current.expiresAt >= now) return false;
        leases.set(lease.accountKey, lease);
        return true;
      },
      async release({ accountKey, token }) {
        if (leases.get(accountKey)?.token === token) leases.delete(accountKey);
      }
    }
  };
}

function busy() {
  return Object.assign(new Error("Context ocupado"), { code: "RETAILER_BUSY" });
}

test("Context lease serializes concurrent carts and releases after completion", async () => {
  const { store, leases } = memoryStore();
  let finishFirst!: () => void;
  let firstStarted!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  const firstCanFinish = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });

  const first = withContextLease({
    accountKey: "carrefour:context-a",
    token: "first",
    store,
    onBusy: busy,
    async work() {
      firstStarted();
      await firstCanFinish;
      return "first";
    }
  });
  await firstStartedPromise;

  await assert.rejects(
    () => withContextLease({ accountKey: "carrefour:context-a", token: "second", store, onBusy: busy, async work() { return "second"; } }),
    (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "RETAILER_BUSY")
  );

  finishFirst();
  assert.equal(await first, "first");
  assert.equal(leases.size, 0);
  assert.equal(
    await withContextLease({ accountKey: "carrefour:context-a", token: "third", store, onBusy: busy, async work() { return "third"; } }),
    "third"
  );
});

test("Context lease takes over only an expired lease and releases after work errors", async () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const { store, leases } = memoryStore([{ accountKey: "carrefour:context-a", token: "stale", expiresAt: new Date(now.getTime() - 1) }]);
  await assert.rejects(
    () => withContextLease({
      accountKey: "carrefour:context-a",
      token: "replacement",
      store,
      onBusy: busy,
      now: () => now,
      async work() {
        throw new Error("buyer failed");
      }
    }),
    /buyer failed/
  );
  assert.equal(leases.size, 0);
});

test("Context lease does not hide database failures as a busy cart", async () => {
  const { store } = memoryStore();
  store.create = async () => {
    throw new Error("database unavailable");
  };
  await assert.rejects(
    () => withContextLease({ accountKey: "carrefour:context-a", token: "first", store, onBusy: busy, async work() { return "never"; } }),
    /database unavailable/
  );
});
