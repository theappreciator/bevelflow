import {
  isWorkflowState,
  MAX_NOTES_LENGTH,
  MAX_TEXT_LENGTH,
  type ContactEvent,
  type ContactKind,
  type Photo,
  type RecordDetail,
  type RecordFields,
  type RecordSummary,
  type WorkflowEvent,
  type WorkflowState,
} from "../shared/types";
import { HttpError } from "./http";

const TEXT_FIELDS = ["firstName", "lastName", "email", "phone", "notes"] as const;

/** camelCase API field -> snake_case column. */
export const COLUMNS: Record<keyof RecordFields, string> = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  notes: "notes",
  estimatedCostCents: "estimated_cost_cents",
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
      const max = key === "notes" ? MAX_NOTES_LENGTH : MAX_TEXT_LENGTH;
      if (value.length > max) throw new HttpError(400, `${key} is too long`);
      out[key as (typeof TEXT_FIELDS)[number]] = value.trim();
    } else if (key === "estimatedCostCents") {
      if (value !== null && !Number.isSafeInteger(value)) {
        throw new HttpError(400, "estimatedCostCents must be a whole number of cents or null");
      }
      out.estimatedCostCents = value as number | null;
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
  public_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  estimated_cost_cents: number | null;
  workflow_state: WorkflowState;
  notes: string;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

export interface SummaryRow
  extends Pick<RecordRow, "id" | "first_name" | "last_name" | "email" | "phone" | "estimated_cost_cents" | "workflow_state" | "created_at" | "updated_at"> {
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
    email: r.email,
    phone: r.phone,
    estimatedCostCents: r.estimated_cost_cents,
    workflowState: r.workflow_state,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photoCount: r.photo_count,
    thumbnailPhotoId: r.thumbnail_photo_id,
  };
}

export interface ContactEventRow {
  id: string;
  record_id: string;
  kind: ContactKind;
  target: string;
  created_at: number;
  created_by: string;
}

/** How many contact events the record screen shows. */
export const CONTACT_HISTORY_LIMIT = 200;

export function toContactEvent(c: ContactEventRow): ContactEvent {
  return { id: c.id, kind: c.kind, target: c.target, createdAt: c.created_at, createdBy: c.created_by };
}

export interface WorkflowEventRow {
  id: string;
  record_id: string;
  from_state: WorkflowState | null;
  to_state: WorkflowState;
  created_at: number;
  created_by: string;
}

/** How many workflow changes the record screen shows. */
export const WORKFLOW_HISTORY_LIMIT = 200;

/**
 * Statement that logs a workflow change for `recordId` to `toState`, recording the
 * state it had before. Run it in the same batch *before* the UPDATE: it reads the
 * current state, and inserts nothing if the state isn't actually changing.
 */
export function logWorkflowChange(db: D1Database, recordId: string, toState: WorkflowState, user: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO workflow_events (id, record_id, from_state, to_state, created_at, created_by)
       SELECT ?, id, workflow_state, ?, ?, ? FROM records WHERE id = ? AND workflow_state != ?`,
    )
    .bind(crypto.randomUUID(), toState, Date.now(), user, recordId, toState);
}

/** Statement that logs the state a new record was created in. */
export function logWorkflowCreated(db: D1Database, recordId: string, state: WorkflowState, user: string, at: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO workflow_events (id, record_id, from_state, to_state, created_at, created_by)
       VALUES (?, ?, NULL, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), recordId, state, at, user);
}

export function toDetail(
  r: RecordRow,
  photos: PhotoRow[],
  contacts: ContactEventRow[],
  workflow: WorkflowEventRow[],
): RecordDetail {
  return {
    id: r.id,
    publicId: r.public_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    estimatedCostCents: r.estimated_cost_cents,
    workflowState: r.workflow_state,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    photos: photos.map((p): Photo => ({ id: p.id, createdAt: p.created_at, bytes: p.bytes })),
    contacts: contacts.map(toContactEvent),
    workflowHistory: workflow.map(
      (w): WorkflowEvent => ({
        id: w.id,
        fromState: w.from_state,
        toState: w.to_state,
        createdAt: w.created_at,
        createdBy: w.created_by,
      }),
    ),
  };
}

export async function loadDetail(db: D1Database, id: string): Promise<RecordDetail> {
  const [rec, photos, contacts, workflow] = await db.batch([
    db.prepare("SELECT * FROM records WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM photos WHERE record_id = ? ORDER BY created_at").bind(id),
    db
      .prepare("SELECT * FROM contact_events WHERE record_id = ? ORDER BY created_at DESC LIMIT ?")
      .bind(id, CONTACT_HISTORY_LIMIT),
    db
      .prepare("SELECT * FROM workflow_events WHERE record_id = ? ORDER BY created_at DESC LIMIT ?")
      .bind(id, WORKFLOW_HISTORY_LIMIT),
  ]);
  const row = rec?.results[0] as RecordRow | undefined;
  if (!row) throw new HttpError(404, "Record not found");
  return toDetail(
    row,
    (photos?.results ?? []) as PhotoRow[],
    (contacts?.results ?? []) as ContactEventRow[],
    (workflow?.results ?? []) as WorkflowEventRow[],
  );
}
