export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, cache-free release identity for verifying the production alias after deploy. */
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const commitSha = sha && /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : null;

  return Response.json({ commitSha }, {
    headers: { "Cache-Control": "no-store" },
  });
}
