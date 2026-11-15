export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Admin "People with access": Cloudflare account and Access app to read the policy from. */
  CF_ACCOUNT_ID: string;
  ACCESS_APP_ID: string;
  /** Secret (wrangler pages secret put): read-only Cloudflare API token for Access. Optional. */
  CF_API_TOKEN?: string;
  /** Local development only (set in .dev.vars, never deployed): skips Access token checks. */
  DEV_USER_EMAIL?: string;
}

/** Values the auth middleware puts on context.data for the route handlers. */
export interface RequestData extends Record<string, unknown> {
  userEmail: string;
}

export type Handler<P extends string = never> = PagesFunction<Env, P, RequestData>;
