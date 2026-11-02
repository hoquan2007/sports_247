/**
 * Optional shared ScoreBat credit reservation across serverless instances.
 * Each ScoreBat feed lookup reserves 5 credits (even if Next serves it from
 * cache), and each ready embed reserves 1 more. This is intentionally
 * conservative; actual provider billing must still be reconciled separately.
 */

type Reservation =
  | { status: "unlimited" }
  | { status: "allowed"; used: number; limit: number }
  | { status: "exhausted"; used: number; limit: number }
  | { status: "unavailable" };

const RESERVE_LUA = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local cost = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
if used + cost > limit then return {0, used} end
local total = redis.call('INCRBY', KEYS[1], cost)
redis.call('EXPIREAT', KEYS[1], ARGV[3])
return {1, total}
`;

type BudgetFailure = "invalid_settings" | "invalid_redis_url" | "invalid_clock" |
  "redis_http_error" | "redis_invalid_json" | "redis_invalid_result" | "redis_connection_error";

/** Machine-readable failure reasons; never log credentials, URLs or response bodies. */
function unavailable(cost: 1 | 5, reason: BudgetFailure): Reservation {
  console.warn(JSON.stringify({ event: "sports247_scorebat_budget", status: "unavailable",
    reason, requestedCredits: cost, reservedCredits: 0, at: new Date().toISOString() }));
  return { status: "unavailable" };
}

function restOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") ||
        url.hostname === ".upstash.io" || url.port || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export async function reserveScorebatCredits(
  cost: 1 | 5,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<Reservation> {
  const limitText = env.SCOREBAT_MONTHLY_CREDIT_LIMIT?.trim() ?? "";
  const rawUrl = env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const restToken = env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  // No budget configuration retains the existing optional ScoreBat integration.
  if (!limitText && !rawUrl && !restToken) return { status: "unlimited" };

  // Once the operator opts in, incomplete/invalid settings block paid playback.
  if (!/^[1-9]\d{0,7}$/.test(limitText) || !restToken || !Number.isFinite(now))
    return unavailable(cost, "invalid_settings");
  const origin = restOrigin(rawUrl);
  if (!origin) return unavailable(cost, "invalid_redis_url");

  const limit = Number(limitText);
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return unavailable(cost, "invalid_clock");
  const month = date.toISOString().slice(0, 7);
  const expiry = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000);
  const key = `sports247:scorebat:credits:${month}`;

  try {
    // An atomic script prevents two regions from passing a check then both
    // exceeding the limit. The monthly key expires at the next UTC month.
    const response = await fetch(origin, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(2500),
      headers: { Authorization: `Bearer ${restToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", RESERVE_LUA, 1, key, cost, limit, expiry]),
    });
    if (!response.ok) return unavailable(cost, "redis_http_error");
    let data: { result?: unknown };
    try { data = (await response.json()) as { result?: unknown }; }
    catch { return unavailable(cost, "redis_invalid_json"); }
    if (!data || !Array.isArray(data.result) || data.result.length !== 2)
      return unavailable(cost, "redis_invalid_result");
    const [accepted, credits] = data.result;
    const used = Number(credits);
    if ((Number(accepted) !== 0 && Number(accepted) !== 1) ||
        !Number.isSafeInteger(used) || used < 0 || used > limit)
      return unavailable(cost, "redis_invalid_result");

    const status = Number(accepted) === 1 ? "allowed" : "exhausted";
    // The log is suitable for usage dashboards without storing provider keys.
    const record = { event: "sports247_scorebat_budget", status, reservedCredits: cost,
      usedCredits: used, limitCredits: limit, month, at: new Date().toISOString() };
    if (status === "exhausted" || used * 5 >= limit * 4) console.warn(JSON.stringify(record));
    else console.info(JSON.stringify(record));
    return { status, used, limit };
  } catch {
    // A failed credit store must never turn into an unmetered paid API call.
    return unavailable(cost, "redis_connection_error");
  }
}
