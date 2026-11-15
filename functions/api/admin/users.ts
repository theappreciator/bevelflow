import type { Handler } from "../../../server/env";
import { errorResponse, json } from "../../../server/http";
import type { AccessRule, AdminUsersResponse } from "../../../shared/types";

interface AccessPolicy {
  name: string;
  decision: string;
  include?: Record<string, Record<string, unknown>>[];
}

/** Turns an Access "include" rule into something readable, e.g. {email:{email:"a@b"}} -> email a@b. */
function describe(rule: Record<string, Record<string, unknown>>): { type: string; value: string } {
  const [type = "unknown", detail = {}] = Object.entries(rule)[0] ?? [];
  const value =
    type === "email" ? String(detail.email ?? "")
    : type === "email_domain" ? `@${String(detail.domain ?? "")}`
    : type === "everyone" ? "Everyone"
    : JSON.stringify(detail);
  return { type, value };
}

/**
 * GET /api/admin/users — who can sign in, read live from the Cloudflare Access app's
 * policies (the real source of truth). Needs the CF_API_TOKEN secret (Access read-only).
 */
export const onRequestGet: Handler = async ({ env }) => {
  try {
    if (!env.CF_API_TOKEN) {
      const body: AdminUsersResponse = {
        configured: false,
        rules: [],
        message: "Not connected yet: a read-only Cloudflare API token (CF_API_TOKEN) is needed to read the Access policy.",
      };
      return json(body);
    }
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}`,
      { headers: { authorization: `Bearer ${env.CF_API_TOKEN}` } },
    );
    const data = (await res.json()) as { success: boolean; result?: { policies?: AccessPolicy[] } };
    if (!res.ok || !data.success) {
      return json({ configured: true, rules: [], message: `Cloudflare API error (${res.status}).` } satisfies AdminUsersResponse);
    }
    const rules: AccessRule[] = (data.result?.policies ?? []).flatMap((p) =>
      (p.include ?? []).map((r) => ({ policy: p.name, decision: p.decision, ...describe(r) })),
    );
    return json({ configured: true, rules } satisfies AdminUsersResponse);
  } catch (err) {
    return errorResponse(err);
  }
};
