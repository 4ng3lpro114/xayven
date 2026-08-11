import "server-only";

/**
 * Next.js can bundle different routes (a page's RSC bundle vs. a Route
 * Handler's bundle) as separate module instances even though they run in
 * the same Node.js process — so a plain `const store = new Map()` at
 * module scope in e.g. paymentsStore.ts is NOT guaranteed to be the same
 * Map when read from a page and written from an API route. (This is the
 * same reason singletons like a Prisma Client are conventionally attached
 * to `globalThis` in Next.js apps.)
 *
 * Attaching the in-memory fallback stores to `globalThis` instead makes
 * them genuinely process-wide, which is what "in-memory fallback for local
 * dev" is supposed to mean. Still explicitly NOT for production — see
 * docs/payments.md and the README's Database section.
 */
const GLOBAL_KEY = "__xayvenMemoryStores__";

type StoreRegistry = Record<string, unknown>;

function getRegistry(): StoreRegistry {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: StoreRegistry };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = {};
  return g[GLOBAL_KEY];
}

export function getGlobalMap<K, V>(name: string): Map<K, V> {
  const registry = getRegistry();
  if (!registry[name]) registry[name] = new Map<K, V>();
  return registry[name] as Map<K, V>;
}

export function getGlobalSet<T>(name: string): Set<T> {
  const registry = getRegistry();
  if (!registry[name]) registry[name] = new Set<T>();
  return registry[name] as Set<T>;
}

export function getGlobalArray<T>(name: string): T[] {
  const registry = getRegistry();
  if (!registry[name]) registry[name] = [] as T[];
  return registry[name] as T[];
}
