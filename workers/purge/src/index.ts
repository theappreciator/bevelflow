import { formatPublicId } from "../../../shared/publicId";
import { workflowLabel, type WorkflowState } from "../../../shared/types";

interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  EMAIL: SendEmail;
  PURGE_AFTER_DAYS: string;
  APP_NAME: string;
  MAIL_FROM: string;
}

interface Row {
  id: string;
  public_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  estimated_cost_cents: number | null;
  workflow_state: WorkflowState;
  notes: string;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

/** Records handled per run; anything left over is picked up the next day. */
const BATCH = 50;
const DAY_MS = 86_400_000;

export default {
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(purge(env));
  },
} satisfies ExportedHandler<Env>;

export async function purge(env: Env, now = Date.now()): Promise<{ purged: number; skipped: number }> {
  const days = Number(env.PURGE_AFTER_DAYS) || 30;
  if (!env.MAIL_FROM) {
    console.warn("MAIL_FROM is not set: no notices can be sent, so nothing is purged.");
    return { purged: 0, skipped: 0 };
  }

  const cutoff = now - days * DAY_MS;
  const { results } = await env.DB.prepare(
    "SELECT * FROM records WHERE updated_at < ? ORDER BY updated_at LIMIT ?",
  )
    .bind(cutoff, BATCH)
    .all<Row>();

  let purged = 0;
  let skipped = 0;
  for (const r of results) {
    const photos = await env.DB.prepare("SELECT r2_key FROM photos WHERE record_id = ?")
      .bind(r.id)
      .all<{ r2_key: string }>();

    // 1. Tell the creator. If this fails, keep the record and try again next run.
    try {
      if (!r.created_by) throw new Error("record has no creator email");
      await env.EMAIL.send({
        from: env.MAIL_FROM,
        to: r.created_by,
        subject: `${env.APP_NAME}: record ${formatPublicId(r.public_id)} was removed after ${days} days`,
        text: noticeText(r, days, photos.results.length, env.APP_NAME),
        html: noticeHtml(r, days, photos.results.length, env.APP_NAME),
      });
    } catch (err) {
      skipped++;
      console.error(`Not purging ${r.id}: notice email failed`, err);
      continue;
    }

    // 2. Delete photos, then the record and its history rows, in one transaction.
    const keys = photos.results.map((p) => p.r2_key);
    if (keys.length) await env.PHOTOS.delete(keys);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM photos WHERE record_id = ?").bind(r.id),
      env.DB.prepare("DELETE FROM contact_events WHERE record_id = ?").bind(r.id),
      env.DB.prepare("DELETE FROM workflow_events WHERE record_id = ?").bind(r.id),
      env.DB.prepare("DELETE FROM records WHERE id = ?").bind(r.id),
    ]);
    purged++;
    console.log(`Purged ${formatPublicId(r.public_id)} (${r.id}); notified ${r.created_by}`);
  }
  console.log(`Purge done: ${purged} purged, ${skipped} skipped, cutoff ${new Date(cutoff).toISOString()}`);
  return { purged, skipped };
}

// ---- email content -----------------------------------------------------------

function details(r: Row, photoCount: number): [string, string][] {
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "(no name)";
  const cost =
    r.estimated_cost_cents === null
      ? "—"
      : `$${(r.estimated_cost_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = (ms: number): string => new Date(ms).toUTCString();
  return [
    ["Record ID", formatPublicId(r.public_id)],
    ["Name", name],
    ["Email", r.email || "—"],
    ["Phone", r.phone || "—"],
    ["Estimated cost", cost],
    ["Workflow state", workflowLabel(r.workflow_state)],
    ["Photos", String(photoCount)],
    ["Created", date(r.created_at)],
    ["Last modified", `${date(r.updated_at)}${r.updated_by ? ` by ${r.updated_by}` : ""}`],
    ["Notes", r.notes || "—"],
  ];
}

function noticeText(r: Row, days: number, photoCount: number, app: string): string {
  const lines = details(r, photoCount).map(([k, v]) => `${k}: ${v}`);
  return [
    `This ${app} record you created was removed because it hadn't been changed in ${days} days.`,
    "Its photos and history were removed too. This is the last copy of its details:",
    "",
    ...lines,
  ].join("\n");
}

function noticeHtml(r: Row, days: number, photoCount: number, app: string): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/\n/g, "<br>");
  const rows = details(r, photoCount)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#111827">
<p>This ${esc(app)} record you created was removed because it hadn't been changed in ${days} days.</p>
<p>Its photos and history were removed too. This is the last copy of its details:</p>
<table style="border-collapse:collapse">${rows}</table>
</div>`;
}
