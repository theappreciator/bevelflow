import type { Handler } from "../../../../../server/env";
import { errorResponse, HttpError, json, param } from "../../../../../server/http";
import { loadDetail } from "../../../../../server/records";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_RECORD } from "../../../../../shared/types";

/**
 * POST /api/records/:id/photos — body is the JPEG itself (already resized by the app).
 * Returns the updated record.
 */
export const onRequestPost: Handler<"id"> = async ({ env, params, request, data }) => {
  try {
    const recordId = param(params, "id");
    if (request.headers.get("content-type") !== "image/jpeg") {
      throw new HttpError(415, "Photos must be uploaded as image/jpeg");
    }
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) throw new HttpError(400, "Empty photo");
    if (body.byteLength > MAX_PHOTO_BYTES) throw new HttpError(413, "Photo is too large");

    const photoId = crypto.randomUUID();
    const key = `records/${recordId}/${photoId}.jpg`;
    await env.PHOTOS.put(key, body, { httpMetadata: { contentType: "image/jpeg" } });

    // Insert only if the record exists and has room. One statement, so two uploads
    // at the same moment can't both squeeze past the limit.
    const now = Date.now();
    const [insert] = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO photos (id, record_id, r2_key, bytes, created_at, created_by)
         SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM records WHERE id = ?)
            AND (SELECT COUNT(*) FROM photos WHERE record_id = ?) < ?`,
      ).bind(photoId, recordId, key, body.byteLength, now, data.userEmail, recordId, recordId, MAX_PHOTOS_PER_RECORD),
      env.DB.prepare(
        `UPDATE records SET updated_at = ?, updated_by = ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM photos WHERE id = ?)`,
      ).bind(now, data.userEmail, recordId, photoId),
    ]);

    if (!insert || insert.meta.changes === 0) {
      await env.PHOTOS.delete(key);
      const exists = await env.DB.prepare("SELECT 1 FROM records WHERE id = ?").bind(recordId).first();
      if (!exists) throw new HttpError(404, "Record not found");
      throw new HttpError(409, `A record can have at most ${MAX_PHOTOS_PER_RECORD} photos`);
    }
    return json(await loadDetail(env.DB, recordId), 201);
  } catch (err) {
    return errorResponse(err);
  }
};
