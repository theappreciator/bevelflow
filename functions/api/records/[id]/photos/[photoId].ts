import type { Handler } from "../../../../../server/env";
import { errorResponse, HttpError, json, param } from "../../../../../server/http";
import { loadDetail, type PhotoRow } from "../../../../../server/records";

/** GET /api/records/:id/photos/:photoId — the JPEG. Photos never change, so cache hard. */
export const onRequestGet: Handler<"id" | "photoId"> = async ({ env, params, request }) => {
  try {
    const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ? AND record_id = ?")
      .bind(param(params, "photoId"), param(params, "id"))
      .first<Pick<PhotoRow, "r2_key">>();
    if (!row) throw new HttpError(404, "Photo not found");

    const obj = await env.PHOTOS.get(row.r2_key, { onlyIf: request.headers });
    if (!obj) throw new HttpError(404, "Photo not found");

    const headers = new Headers({
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=31536000, immutable",
      etag: obj.httpEtag,
    });
    // onlyIf matched the browser's If-None-Match: object without a body -> 304.
    if (!("body" in obj)) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  } catch (err) {
    return errorResponse(err);
  }
};

/** DELETE /api/records/:id/photos/:photoId — returns the updated record. */
export const onRequestDelete: Handler<"id" | "photoId"> = async ({ env, params, data }) => {
  try {
    const recordId = param(params, "id");
    const row = await env.DB.prepare("DELETE FROM photos WHERE id = ? AND record_id = ? RETURNING r2_key")
      .bind(param(params, "photoId"), recordId)
      .first<Pick<PhotoRow, "r2_key">>();
    if (!row) throw new HttpError(404, "Photo not found");

    await env.DB.prepare("UPDATE records SET updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(Date.now(), data.userEmail, recordId)
      .run();
    await env.PHOTOS.delete(row.r2_key);
    return json(await loadDetail(env.DB, recordId));
  } catch (err) {
    return errorResponse(err);
  }
};
