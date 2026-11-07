import { authenticate } from "../../server/auth";
import type { Env } from "../../server/env";
import { HttpError } from "../../server/http";
import { formatPublicId, normalizePublicId } from "../../shared/publicId";

/**
 * GET /q/:publicId — the link inside each record's QR code.
 *
 * This is deliberately a redirect we own rather than a direct link to the record
 * screen, so what a scan does can change later without reprinting codes. For now it
 * sends the person to the record screen.
 */
export const onRequestGet: PagesFunction<Env, "publicId"> = async ({ request, env, params }) => {
  try {
    await authenticate(request, env);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return page(status, "Please sign in", "Open Bevelflow to sign in, then scan the code again.");
  }

  const raw = typeof params.publicId === "string" ? params.publicId : "";
  const publicId = normalizePublicId(raw);
  const row = publicId
    ? await env.DB.prepare("SELECT id FROM records WHERE public_id = ?").bind(publicId).first<{ id: string }>()
    : null;
  if (!row) {
    return page(404, "Record not found", `There is no record with ID ${publicId ? formatPublicId(publicId) : raw}.`);
  }

  return new Response(null, {
    status: 302,
    headers: { location: `/#/records/${encodeURIComponent(row.id)}`, "cache-control": "no-store" },
  });
};

function page(status: number, title: string, message: string): Response {
  const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Bevelflow</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;padding:16px;text-align:center}a{color:#2563eb}</style>
</head><body><main><img src="/icon.svg" alt="" width="56" height="56"><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/">Open Bevelflow</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
