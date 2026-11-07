import {
  isWorkflowState,
  MAX_TEXT_LENGTH,
  type Photo,
  type RecordDetail,
  type RecordFields,
  type RecordSummary,
  type WorkflowState,
} from "../shared/types";
import { HttpError } from "./http";

const TEXT_FIELDS = ["firstName", "lastName", "email", "phone"] as const;

/** camelCase API field -> snake_case column. */
export const COLUMNS: Record<keyof RecordFields, string> = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  estimatedCost: "estimated_cost",
  workflowState: "workflow_state",
};

/**
 * Validates a (partial) set of editable fields from a request body.
 * Unknown keys are rejected so typos don't silently do nothing.
 */
export function parseFields(body: Record<string, unknown>): Partial<RecordFields> {
  const out: Partial<RecordFields> = {};
  for (const [key, value] of Object.entries(body)) {
    if ((TEXT_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== "string") throw new HttpError(400, `${key} must be a string`);
      if (value.length > MAX_TEXT_LENGTH) throw new HttpError(400, `${key} is too long`);
      out[key as (typeof TEXT_FIELDS)[number]] = value.trim();
    } else if (key === "estimatedCost") {
      if (value !== null && !Number.isSafeInteger(value)) {
        throw new HttpError(400, "estimatedCost must be a whole number or null");
      }
      out.estimatedCost = value as number | null;
    } else if (key === "workflowState") {
      if (!isWorkflowState(value)) throw new HttpError(400, "Unknown workflowState");
      out.workflowState = value;
    } else {
      throw new HttpError(400, `Unknown field: ${key}`);
    }
  }
  return out;
}

export interface RecordRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  estimated_cost: number | null;
  workflow_state: WorkflowState;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

export interface SummaryRow
  extends Pick<RecordRow, "id" | "first_name" | "last_name" | "phone" | "workflow_state" | "created_at" | "updated_at"> {
  photo_count: number;
  thumbnail_photo_id: string | null;
}

export interface PhotoRow {
  id: string;
  record_id: string;
  r2_key: string;
  bytes: number;
  created_at: number;
}

export function toSummary(r: SummaryRow): RecordSummary {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    workflowState: r.workflow_state,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photoCount: r.photo_count,
    thumbnailPhotoId: r.thumbnail_photo_id,
  };
}

export function toDetail(r: RecordRow, photos: PhotoRow[]): RecordDetail {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    estimatedCost: r.estimated_cost,
    workflowState: r.workflow_state,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    photos: photos.map((p): Photo => ({ id: p.id, createdAt: p.created_at, bytes: p.bytes })),
  };
}

export async function loadDetail(db: D1Database, id: string): Promise<RecordDetail> {
  const [rec, photos] = await db.batch([
    db.prepare("SELECT * FROM records WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM photos WHERE record_id = ? ORDER BY created_at").bind(id),
  ]);
  const row = rec?.results[0] as RecordRow | undefined;
  if (!row) throw new HttpError(404, "Record not found");
  return toDetail(row, (photos?.results ?? []) as PhotoRow[]);
}
