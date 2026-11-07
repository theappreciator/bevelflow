import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Handler } from "../../server/env";
import { errorResponse, HttpError, json } from "../../server/http";

// Cloudflare Access already blocks anyone who isn't signed in before requests
// reach this code. We still verify the Access token here so the API can't be
// reached by any path that skips Access, and to learn who the user is.

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function verifiedEmail(request: Request, teamDomain: string, aud: string): Promise<string> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError(401, "Not signed in");
  jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${teamDomain}`, audience: aud });
    if (typeof payload.email !== "string" || !payload.email) throw new Error("token has no email");
    return payload.email;
  } catch {
    throw new HttpError(401, "Invalid sign-in token");
  }
}

export const onRequest: Handler = async (context) => {
  try {
    const { env, request } = context;
    context.data.userEmail = env.DEV_USER_EMAIL
      ? env.DEV_USER_EMAIL
      : await verifiedEmail(request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
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
