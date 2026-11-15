import type { Handler } from "../../../../../server/env";
import { errorResponse, HttpError, json, param } from "../../../../../server/http";
import { hardDeleteRecord } from "../../../../../server/records";

/** DELETE /api/admin/records/:id — hard delete: the record, its photos and history, permanently. */
export const onRequestDelete: Handler<"id"> = async ({ env, params, data }) => {
  try {
    const id = param(params, "id");
    if (!(await hardDeleteRecord(env.DB, env.PHOTOS, id))) throw new HttpError(404, "Record not found");
    console.log(`Hard-deleted record ${id} by ${data.userEmail}`);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
