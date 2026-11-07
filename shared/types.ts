// Types and constants shared by the browser app (src/) and the API (functions/, server/).

/** Workflow states, in display/sort order. */
export const WORKFLOW_STATES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked_on_response", label: "Blocked on response" },
  { value: "completed", label: "Completed" },
  { value: "returned_paid", label: "Returned and paid" },
  { value: "returned_not_paid", label: "Returned and not paid" },
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number]["value"];

export const MAX_PHOTOS_PER_RECORD = 5;
export const MAX_TEXT_LENGTH = 500;
/** Upper bound for an uploaded (already resized) JPEG. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The fields a person types in and can edit. */
export interface RecordFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Whole cents: 25.12 is stored as 2512. */
  estimatedCostCents: number | null;
  workflowState: WorkflowState;
}

export interface Photo {
  id: string;
  createdAt: number;
  bytes: number;
}

export interface RecordSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  workflowState: WorkflowState;
  createdAt: number;
  updatedAt: number;
  photoCount: number;
  /** First photo of the record, used as the list thumbnail. */
  thumbnailPhotoId: string | null;
}

export interface RecordDetail extends RecordFields {
  id: string;
  /** 8-character public ID, stored without a dash (see shared/publicId.ts). */
  publicId: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
  photos: Photo[];
}

export function isWorkflowState(v: unknown): v is WorkflowState {
  return WORKFLOW_STATES.some((s) => s.value === v);
}

export function workflowLabel(v: WorkflowState): string {
  return WORKFLOW_STATES.find((s) => s.value === v)?.label ?? v;
}

/** URL the app uses to load a stored photo. */
export function photoUrl(recordId: string, photoId: string): string {
  return `/api/records/${encodeURIComponent(recordId)}/photos/${encodeURIComponent(photoId)}`;
}
