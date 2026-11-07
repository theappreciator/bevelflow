import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";
import { HttpError } from "./http";

// Cloudflare Access already blocks anyone who isn't signed in before requests reach
// our code. We still verify the Access token so nothing can be reached by a path that
// skips Access, and to learn who the user is.

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** The signed-in user's email, or HttpError 401. */
export async function authenticate(request: Request, env: Env): Promise<string> {
  if (env.DEV_USER_EMAIL) return env.DEV_USER_EMAIL; // local development only (.dev.vars)

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError(401, "Not signed in");
  const team = env.ACCESS_TEAM_DOMAIN;
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
    if (typeof payload.email !== "string" || !payload.email) throw new Error("token has no email");
    return payload.email;
  } catch {
    throw new HttpError(401, "Invalid sign-in token");
  }
}
