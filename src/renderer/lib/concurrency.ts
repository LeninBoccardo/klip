/**
 * Run an async transform over `items` with a concurrency cap. Output preserves
 * input order. Errors are surfaced via the transform's return value (use a
 * discriminated union or a Result-like type) — this helper does not catch.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: ReadonlyArray<TIn>,
  limit: number,
  fn: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  if (limit <= 0) throw new Error('limit must be > 0')
  const results: TOut[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
