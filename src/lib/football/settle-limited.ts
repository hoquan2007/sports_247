/** Run independent upstream calls with a concurrency cap, preserving input order and failures. */
export async function settleLimited<T>(
  requests: ReadonlyArray<() => Promise<T>>,
  maxConcurrent = 16,
): Promise<PromiseSettledResult<T>[]> {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError("maxConcurrent must be a positive integer");
  const results: PromiseSettledResult<T>[] = new Array(requests.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, requests.length) }, async () => {
    while (nextIndex < requests.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await requests[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}
