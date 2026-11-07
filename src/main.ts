import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { appVersion, formatVersion } from "./version";
import { renderList } from "./views/list";
import { renderRecord } from "./views/record";

registerSW({ immediate: true });

console.info("Bevelflow", appVersion);

const app = document.querySelector<HTMLElement>("#app")!;
const versionEl = document.querySelector<HTMLElement>("#app-version");
if (versionEl) versionEl.textContent = formatVersion();

// Hash routes: #/ (list), #/new, #/records/<id>
let navigation = 0;

function route(): void {
  const current = ++navigation;
  const isCurrent = (): boolean => current === navigation;
  const path = location.hash.replace(/^#/, "") || "/";
  window.scrollTo(0, 0);

  const recordMatch = /^\/records\/([^/]+)$/.exec(path);
  if (path === "/new") renderRecord(app, null, isCurrent);
  else if (recordMatch?.[1]) renderRecord(app, decodeURIComponent(recordMatch[1]), isCurrent);
  else renderList(app);
}

window.addEventListener("hashchange", route);
route();
