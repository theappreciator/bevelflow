import type { Handler } from "../../../../server/env";
import { errorResponse, json } from "../../../../server/http";
import {
  ESTIMATE_PHOTOS_PER_RECORD,
  ESTIMATED_MAX_RECORDS,
  ESTIMATED_PHOTO_BYTES,
  ESTIMATED_RECORD_DB_BYTES,
  FREE_D1_BYTES,
  FREE_R2_BYTES,
} from "../../../../shared/capacity";
import type { AdminRecord, AdminRecordsResponse, WorkflowState } from "../../../../shared/types";

interface Row {
  id: string;
  public_id: string;
  first_name: string;
  last_name: string;
  workflow_state: WorkflowState;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  photo_count: number;
  photo_bytes: number | null;
}

/** GET /api/admin/records — every record, soft-deleted included, newest first, plus capacity. */
export const onRequestGet: Handler = async ({ env }) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.public_id, r.first_name, r.last_name, r.workflow_state, r.created_at, r.updated_at,
              r.deleted_at,
              (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id) AS photo_count,
              (SELECT SUM(p.bytes) FROM photos p WHERE p.record_id = r.id) AS photo_bytes
         FROM records r
        ORDER BY r.created_at DESC`,
    ).all<Row>();
    const records: AdminRecord[] = results.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      firstName: r.first_name,
      lastName: r.last_name,
      workflowState: r.workflow_state,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      photoCount: r.photo_count,
      photoBytes: r.photo_bytes ?? 0,
    }));
    // Soft-deleted records still use space, so they count.
    const body: AdminRecordsResponse = {
      records,
      capacity: {
        recordCount: records.length,
        estimatedMaxRecords: ESTIMATED_MAX_RECORDS,
        percentUsed: (records.length / ESTIMATED_MAX_RECORDS) * 100,
        assumptions: {
          photosPerRecord: ESTIMATE_PHOTOS_PER_RECORD,
          photoBytes: ESTIMATED_PHOTO_BYTES,
          recordDbBytes: ESTIMATED_RECORD_DB_BYTES,
          freeR2Bytes: FREE_R2_BYTES,
          freeD1Bytes: FREE_D1_BYTES,
        },
      },
    };
    return json(body);
  } catch (err) {
    return errorResponse(err);
  }
};
