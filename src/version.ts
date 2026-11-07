export interface AppVersion {
  version: string;
  commit: string;
  branch: string;
  builtAt: string;
}

declare const __APP_VERSION__: AppVersion;

export const appVersion: AppVersion = __APP_VERSION__;

/** e.g. "v0.1.0 · 7a1f841 · built 2026-11-07 17:02 UTC" (branch shown when not main) */
export function formatVersion(v: AppVersion = appVersion): string {
  const built = v.builtAt.slice(0, 16).replace("T", " ") + " UTC";
  const branch = v.branch === "main" ? "" : ` · ${v.branch}`;
  return `v${v.version} · ${v.commit}${branch} · built ${built}`;
}
