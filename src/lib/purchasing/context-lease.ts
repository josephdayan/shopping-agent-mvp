export const CONTEXT_LEASE_TTL_MS = 15 * 60_000;

type ContextLease = {
  accountKey: string;
  token: string;
  expiresAt: Date;
};

export type ContextLeaseStore = {
  create(lease: ContextLease): Promise<void>;
  replaceExpired(lease: ContextLease, now: Date): Promise<boolean>;
  release(lease: Pick<ContextLease, "accountKey" | "token">): Promise<void>;
};

type ContextLeaseOptions<T> = {
  accountKey: string;
  token: string;
  store: ContextLeaseStore;
  work(): Promise<T>;
  onBusy(): Error;
  now?: () => Date;
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

// A retailer Context represents one persisted cart. This coordinator is deliberately
// independent from Prisma so the serialization and crash-recovery contract can be
// tested without touching a live retailer or database.
export async function withContextLease<T>({ accountKey, token, store, work, onBusy, now = () => new Date() }: ContextLeaseOptions<T>): Promise<T> {
  const startedAt = now();
  const lease: ContextLease = {
    accountKey,
    token,
    expiresAt: new Date(startedAt.getTime() + CONTEXT_LEASE_TTL_MS)
  };
  let acquired = false;

  try {
    try {
      await store.create(lease);
      acquired = true;
    } catch (error) {
      // Only a unique-key conflict can mean a different worker owns this Context.
      // Configuration and database failures must surface as such, never be retried
      // forever as though the cart were merely occupied.
      if (!isUniqueConstraintError(error)) throw error;
      acquired = await store.replaceExpired(lease, startedAt);
    }
    if (!acquired) throw onBusy();
    return await work();
  } finally {
    if (acquired) await store.release({ accountKey, token });
  }
}
