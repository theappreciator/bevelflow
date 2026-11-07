import { generatePublicId } from "../shared/publicId";
import { HttpError } from "./http";

export const MAX_PUBLIC_ID_ATTEMPTS = 5;

/** Shown to the user if no unique ID could be made; the code lets support find it. */
export const PUBLIC_ID_SUPPORT_MESSAGE =
  "Couldn't create a unique record ID. Nothing was saved. Please contact support (error PUBLIC_ID_EXHAUSTED).";

function isPublicIdClash(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("UNIQUE") && msg.includes("public_id");
}

/**
 * Creates a record with a new public ID that is not already in use.
 *
 * Each attempt generates an ID, checks the database for it, and only then inserts.
 * If the ID is taken (or another request grabbed it between the check and the insert,
 * which the unique index catches), it tries a fresh ID. After 5 attempts it gives up
 * with an error that asks the user to contact support.
 *
 * `insert` must insert the record using the given public ID.
 */
export async function insertWithUniquePublicId(
  db: D1Database,
  insert: (publicId: string) => Promise<unknown>,
  generate: () => string = generatePublicId,
): Promise<string> {
  const tried: string[] = [];
  for (let attempt = 1; attempt <= MAX_PUBLIC_ID_ATTEMPTS; attempt++) {
    const publicId = generate();
    tried.push(publicId);

    const taken = await db.prepare("SELECT 1 FROM records WHERE public_id = ?").bind(publicId).first();
    if (taken) continue;

    try {
      await insert(publicId);
      return publicId;
    } catch (err) {
      if (!isPublicIdClash(err)) throw err;
    }
  }
  console.error("PUBLIC_ID_EXHAUSTED: every generated public ID was already in use", { tried });
  throw new HttpError(500, PUBLIC_ID_SUPPORT_MESSAGE);
}
