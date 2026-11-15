import { authenticate } from "../../server/auth";
import type { Handler } from "../../server/env";
import { errorResponse, json } from "../../server/http";
import { assertSameOrigin, withSecurityHeaders } from "../../server/security";

export const onRequest: Handler = async (context) => {
  let response: Response;
  try {
    context.data.userEmail = await authenticate(context.request, context.env);
    assertSameOrigin(context.request);
    response = await context.next();
    // Unmatched /api routes fall through to the static site (which serves the app's
    // index.html for any path); make them a JSON 404 instead.
    if (response.headers.get("content-type")?.includes("text/html")) {
      response = json({ error: "Not found" }, 404);
    }
  } catch (err) {
    response = errorResponse(err);
  }
  return withSecurityHeaders(response);
};
