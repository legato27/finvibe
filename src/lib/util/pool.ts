// Run an async fn over items with bounded concurrency, preserving result order.
// Never rejects — each item's promise is awaited independently so one failure
// doesn't abort the rest (like Promise.allSettled, but capped in flight).
//
// Used to throttle enrichment kicks: the watchlist sweep and bulk adds would
// otherwise fire one HTTP request per ticker all at once. The DGX backend
// dedupes per ticker, but capping in-flight requests keeps the burst sane.
export async function pooledMap<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = undefined; // isolated; caller treats undefined as a miss
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
