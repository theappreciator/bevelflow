import type { Handler } from "../../../server/env";
import { errorResponse, json, readJson } from "../../../server/http";
import { loadDetail, parseFields, toSummary, type SummaryRow } from "../../../server/records";
import { generatePublicId } from "../../../shared/publicId";

const LIST_LIMIT = 500;

/** GET /api/records — newest first. */
export const onRequestGet: Handler = async ({ env }) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.first_name, r.last_name, r.email, r.phone, r.workflow_state, r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id) AS photo_count,
              (SELECT p.id FROM photos p WHERE p.record_id = r.id ORDER BY p.created_at LIMIT 1) AS thumbnail_photo_id
         FROM records r
        ORDER BY r.created_at DESC
        LIMIT ?`,
    )
      .bind(LIST_LIMIT)
      .all<SummaryRow>();
    return json({ records: results.map(toSummary) });
  } catch (err) {
    return errorResponse(err);
  }
};

/** POST /api/records — create a record (photos are uploaded separately). */
export const onRequestPost: Handler = async ({ env, request, data }) => {
  try {
    const f = parseFields(await readJson(request));
    const id = crypto.randomUUID();
    const now = Date.now();
    const insert = env.DB.prepare(
      `INSERT INTO records (id, public_id, first_name, last_name, email, phone, estimated_cost_cents,
                            workflow_state, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Public IDs are random; on the (very unlikely) clash with an existing one, try another.
    for (let attempt = 1; ; attempt++) {
      try {
        await insert
          .bind(
            id,
            generatePublicId(),
            f.firstName ?? "",
            f.lastName ?? "",
            f.email ?? "",
            f.phone ?? "",
            f.estimatedCostCents ?? null,
            f.workflowState ?? "new",
            now,
            now,
            data.userEmail,
            data.userEmail,
          )
          .run();
        break;
      } catch (err) {
        const clash = String(err).includes("UNIQUE") && String(err).includes("public_id");
        if (!clash || attempt >= 5) throw err;
      }
    }
    return json(await loadDetail(env.DB, id), 201);
  } catch (err) {
    return errorResponse(err);
  }
};
