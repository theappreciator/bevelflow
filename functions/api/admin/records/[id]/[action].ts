import type { Handler } from "../../../../../server/env";
import { errorResponse, HttpError, json, param } from "../../../../../server/http";

/**
 * POST /api/admin/records/:id/delete  — soft delete (status "Deleted"; hidden from the main list)
 * POST /api/admin/records/:id/restore — undo a soft delete (back to its workflow state)
 * Both are logged in the record's workflow history.
 */
export const onRequestPost: Handler<"id" | "action"> = async ({ env, params, data }) => {
  try {
    const id = param(params, "id");
    const action = param(params, "action");
    const now = Date.now();
    const user = data.userEmail;
    const log = (from: string, to: string) =>
      env.DB.prepare(
        `INSERT INTO workflow_events (id, record_id, from_state, to_state, created_at, created_by)
         SELECT ?, id, ${from}, ${to}, ?, ? FROM records WHERE id = ? AND deleted_at IS ${action === "delete" ? "NULL" : "NOT NULL"}`,
      ).bind(crypto.randomUUID(), now, user, id);

    let statements: D1PreparedStatement[];
    if (action === "delete") {
      statements = [
        log("workflow_state", "'deleted'"),
        env.DB.prepare(
          `UPDATE records SET deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ?
            WHERE id = ? AND deleted_at IS NULL`,
        ).bind(now, user, now, user, id),
      ];
    } else if (action === "restore") {
      statements = [
        log("'deleted'", "workflow_state"),
        env.DB.prepare(
          `UPDATE records SET deleted_at = NULL, deleted_by = '', updated_at = ?, updated_by = ?
            WHERE id = ? AND deleted_at IS NOT NULL`,
        ).bind(now, user, id),
      ];
    } else {
      throw new HttpError(404, "Not found");
    }
    const results = await env.DB.batch(statements);
    if (results.at(-1)?.meta.changes === 0) {
      const exists = await env.DB.prepare("SELECT 1 FROM records WHERE id = ?").bind(id).first();
      throw new HttpError(exists ? 409 : 404, exists ? `Record is already ${action === "delete" ? "deleted" : "active"}` : "Record not found");
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
};
