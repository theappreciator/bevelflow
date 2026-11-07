import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { appVersion, formatVersion } from "./version";

registerSW({ immediate: true });

console.info("Bevelflow", appVersion);

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.innerHTML = `
    <main>
      <h1>Bevelflow</h1>
      <p>Coming soon.</p>
    </main>
    <footer class="app-version"></footer>
  `;
  const footer = app.querySelector<HTMLElement>(".app-version");
  if (footer) footer.textContent = formatVersion();
}
