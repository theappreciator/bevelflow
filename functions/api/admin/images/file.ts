import type { Handler } from "../../../../server/env";
import { errorResponse, HttpError } from "../../../../server/http";
import { checkImageKey } from "../../../../server/admin";

/** GET /api/admin/images/file?key=<storage key> — the image itself (works for orphans too). */
export const onRequestGet: Handler = async ({ env, request }) => {
  try {
    const key = checkImageKey(new URL(request.url).searchParams.get("key"));
    const obj = await env.PHOTOS.get(key);
    if (!obj) throw new HttpError(404, "Image not found");
    return new Response(obj.body, {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  } catch (err) {
    return errorResponse(err);
  }
};
