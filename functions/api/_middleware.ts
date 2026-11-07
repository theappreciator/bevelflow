import { authenticate } from "../../server/auth";
import type { Handler } from "../../server/env";
import { errorResponse, json } from "../../server/http";

export const onRequest: Handler = async (context) => {
  try {
    context.data.userEmail = await authenticate(context.request, context.env);
    const response = await context.next();
    // Unmatched /api routes fall through to the static site (which serves the app's
    // index.html for any path); make them a JSON 404 instead.
    if (response.headers.get("content-type")?.includes("text/html")) {
      return json({ error: "Not found" }, 404);
    }
    return response;
  } catch (err) {
    return errorResponse(err);
  }
};
