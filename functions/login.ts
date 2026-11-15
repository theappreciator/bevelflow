import { authenticate } from "../server/auth";
import type { Env } from "../server/env";
import { withSecurityHeaders } from "../server/security";

/**
 * GET /login?next=<#/route> — the way back in after the sign-in session expires.
 *
 * The installed app keeps an offline copy of itself (service worker), so a plain
 * reload never reaches Cloudflare Access and its login page. /login is excluded from
 * that offline copy (see vite.config.ts), so the browser really asks the network:
 * Access shows its login page first if needed, then this sends the user back into the
 * app, to the screen they were on.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await authenticate(request, env);
  } catch {
    // Access normally signs the user in before we get here; if not, try again from the top.
    return withSecurityHeaders(Response.redirect(new URL("/", request.url).toString(), 302));
  }
  const next = new URL(request.url).searchParams.get("next") ?? "";
  // Only app routes like "#/records/<id>": never send the user to another site.
  const target = /^#\/[\w\-/]*$/.test(next) ? `/${next}` : "/";
  return withSecurityHeaders(
    new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } }),
  );
};
