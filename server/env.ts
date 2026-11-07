export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Local development only (set in .dev.vars, never deployed): skips Access token checks. */
  DEV_USER_EMAIL?: string;
}

/** Values the auth middleware puts on context.data for the route handlers. */
export interface RequestData extends Record<string, unknown> {
  userEmail: string;
}

export type Handler<P extends string = never> = PagesFunction<Env, P, RequestData>;
