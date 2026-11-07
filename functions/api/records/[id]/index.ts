import type { Handler } from "../../../../server/env";
import { errorResponse, HttpError, json, param, readJson } from "../../../../server/http";
import { COLUMNS, loadDetail, parseFields } from "../../../../server/records";
import type { RecordFields } from "../../../../shared/types";

/** GET /api/records/:id — record with its photos. */
export const onRequestGet: Handler<"id"> = async ({ env, params }) => {
  try {
    return json(await loadDetail(env.DB, param(params, "id")));
  } catch (err) {
    return errorResponse(err);
  }
};

/** PATCH /api/records/:id — update any subset of the editable fields. */
export const onRequestPatch: Handler<"id"> = async ({ env, params, request, data }) => {
  try {
    const id = param(params, "id");
    const fields = parseFields(await readJson(request));
    const keys = Object.keys(fields) as (keyof RecordFields)[];
    if (keys.length === 0) throw new HttpError(400, "No fields to update");

    const sets = keys.map((k) => `${COLUMNS[k]} = ?`);
    const values = keys.map((k) => fields[k] ?? null);
    const result = await env.DB.prepare(
      `UPDATE records SET ${sets.join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`,
    )
      .bind(...values, Date.now(), data.userEmail, id)
      .run();
    if (result.meta.changes === 0) throw new HttpError(404, "Record not found");
    return json(await loadDetail(env.DB, id));
  } catch (err) {
    return errorResponse(err);
  }
};
