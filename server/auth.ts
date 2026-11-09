import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { Env } from "./env";
import { HttpError } from "./http";

// Cloudflare Access already blocks anyone who isn't signed in before requests reach
// our code. We still verify the Access token so nothing can be reached by a path that
// skips Access, and to learn who the user is.
//
// ACCESS_TEAM_DOMAIN may list several comma-separated team domains, so the team
// domain can be renamed without downtime (accept old + new, then drop the old one).

const jwksByDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(domain: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksByDomain.get(domain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`));
    jwksByDomain.set(domain, jwks);
  }
  return jwks;
}

/** The signed-in user's email, or HttpError 401. */
export async function authenticate(request: Request, env: Env): Promise<string> {
  if (env.DEV_USER_EMAIL) return env.DEV_USER_EMAIL; // local development only (.dev.vars)

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError(401, "Not signed in");
  try {
    // Only the issuer is read before verification, to pick which allowed team
    // domain's keys to verify against; nothing is trusted until jwtVerify passes.
    const allowed = env.ACCESS_TEAM_DOMAIN.split(",").map((d) => d.trim()).filter(Boolean);
    const issuer = String(decodeJwt(token).iss ?? "");
    const domain = allowed.find((d) => issuer === `https://${d}`);
    if (!domain) throw new Error("token from an unexpected team domain");
    const { payload } = await jwtVerify(token, jwksFor(domain), { issuer, audience: env.ACCESS_AUD });
    if (typeof payload.email !== "string" || !payload.email) throw new Error("token has no email");
    return payload.email;
  } catch {
    throw new HttpError(401, "Invalid sign-in token");
  }
}
