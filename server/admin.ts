import { HttpError } from "./http";

/** Only our photo files (records/<record>/<photo>.jpg) can be served or deleted via the admin API. */
export function checkImageKey(key: string | null): string {
  if (!key || !/^records\/[\w-]+\/[\w-]+\.jpg$/.test(key)) throw new HttpError(400, "Invalid image key");
  return key;
}
