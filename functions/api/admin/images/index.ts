import type { Handler } from "../../../../server/env";
import { checkImageKey } from "../../../../server/admin";
import { errorResponse, json } from "../../../../server/http";
import type { AdminImage, AdminImagesResponse } from "../../../../shared/types";

interface PhotoJoin {
  photo_id: string;
  record_id: string;
  r2_key: string;
  public_id: string;
  first_name: string;
  last_name: string;
  deleted_at: number | null;
}

/**
 * GET /api/admin/images — every stored photo file, matched to the record that shows it.
 * Files no record shows are "orphaned" (photoId null); entries whose file is gone are
 * listed separately as missingFiles.
 */
export const onRequestGet: Handler = async ({ env }) => {
  try {
    const objects: R2Object[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.PHOTOS.list({ prefix: "records/", cursor, limit: 1000 });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    const { results } = await env.DB.prepare(
      `SELECT p.id AS photo_id, p.record_id, p.r2_key, r.public_id, r.first_name, r.last_name, r.deleted_at
         FROM photos p JOIN records r ON r.id = p.record_id`,
    ).all<PhotoJoin>();
    const byKey = new Map(results.map((p) => [p.r2_key, p]));

    const images: AdminImage[] = objects
      .map((o): AdminImage => {
        const p = byKey.get(o.key);
        return {
          key: o.key,
          bytes: o.size,
          uploadedAt: o.uploaded.getTime(),
          photoId: p?.photo_id ?? null,
          recordId: p?.record_id ?? null,
          recordPublicId: p?.public_id ?? null,
          recordName: p ? [p.last_name, p.first_name].filter(Boolean).join(", ") || "(no name)" : null,
          recordDeleted: p ? p.deleted_at !== null : false,
        };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);

    const stored = new Set(objects.map((o) => o.key));
    const body: AdminImagesResponse = {
      images,
      missingFiles: results
        .filter((p) => !stored.has(p.r2_key))
        .map((p) => ({ photoId: p.photo_id, recordId: p.record_id, recordPublicId: p.public_id, key: p.r2_key })),
    };
    return json(body);
  } catch (err) {
    return errorResponse(err);
  }
};

/**
 * DELETE /api/admin/images?key=<storage key> — deletes the file, and the photo entry
 * that points at it (if any), which also frees a photo slot on that record.
 */
export const onRequestDelete: Handler = async ({ env, request, data }) => {
  try {
    const key = checkImageKey(new URL(request.url).searchParams.get("key"));
    const row = await env.DB.prepare("DELETE FROM photos WHERE r2_key = ? RETURNING record_id")
      .bind(key)
      .first<{ record_id: string }>();
    if (row) {
      await env.DB.prepare("UPDATE records SET updated_at = ?, updated_by = ? WHERE id = ?")
        .bind(Date.now(), data.userEmail, row.record_id)
        .run();
    }
    await env.PHOTOS.delete(key);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
