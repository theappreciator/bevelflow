import type { ContactEvent, ContactKind, RecordDetail, RecordFields, RecordSummary } from "../shared/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The Cloudflare Access login has expired; a full page reload signs the user back in. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your sign-in has expired. Reload the page to sign in again.");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    // "manual" so an Access redirect to the login page shows up as an opaque
    // redirect instead of a confusing cross-origin failure.
    res = await fetch(path, { ...init, credentials: "same-origin", redirect: "manual" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.type === "opaqueredirect" || res.status === 401) throw new SessionExpiredError();

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body: unknown = isJson ? await res.json() : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body ? String(body.error) : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  if (!isJson) throw new SessionExpiredError();
  return body as T;
}

function sendJson(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function listRecords(): Promise<RecordSummary[]> {
  return (await request<{ records: RecordSummary[] }>("/api/records")).records;
}

export function getRecord(id: string): Promise<RecordDetail> {
  return request(`/api/records/${encodeURIComponent(id)}`);
}

export function createRecord(fields: RecordFields): Promise<RecordDetail> {
  return request("/api/records", sendJson("POST", fields));
}

export function updateRecord(id: string, fields: Partial<RecordFields>): Promise<RecordDetail> {
  return request(`/api/records/${encodeURIComponent(id)}`, sendJson("PATCH", fields));
}

export function uploadPhoto(recordId: string, jpeg: Blob): Promise<RecordDetail> {
  return request(`/api/records/${encodeURIComponent(recordId)}/photos`, {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body: jpeg,
  });
}

/**
 * Logs an Email/Call button tap. keepalive lets the request finish even if the
 * phone switches to the Mail or Phone app straight away.
 */
export function logContact(recordId: string, kind: ContactKind): Promise<ContactEvent> {
  return request(`/api/records/${encodeURIComponent(recordId)}/contacts`, {
    ...sendJson("POST", { kind }),
    keepalive: true,
  });
}

export function deletePhoto(recordId: string, photoId: string): Promise<RecordDetail> {
  return request(`/api/records/${encodeURIComponent(recordId)}/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
  });
}
