import type { Handler } from "../../../../server/env";
import { errorResponse, HttpError, json, param, readJson } from "../../../../server/http";
import { toContactEvent, type ContactEventRow } from "../../../../server/records";

/**
 * POST /api/records/:id/contacts — body {"kind": "email" | "call"}.
 * Logs a tap on the Email or Call button. The address/number is taken from the
 * record as it is now, so the history shows what was actually used.
 */
export const onRequestPost: Handler<"id"> = async ({ env, params, request, data }) => {
  try {
    const recordId = param(params, "id");
    const { kind } = await readJson(request);
    if (kind !== "email" && kind !== "call") throw new HttpError(400, 'kind must be "email" or "call"');

    const row = await env.DB.prepare(
      `INSERT INTO contact_events (id, record_id, kind, target, created_at, created_by)
       SELECT ?, id, ?, CASE ? WHEN 'email' THEN trim(email) ELSE trim(phone) END, ?, ?
         FROM records WHERE id = ?
       RETURNING *`,
    )
      .bind(crypto.randomUUID(), kind, kind, Date.now(), data.userEmail, recordId)
      .first<ContactEventRow>();
    if (!row) throw new HttpError(404, "Record not found");
    return json(toContactEvent(row), 201);
  } catch (err) {
    return errorResponse(err);
  }
};
