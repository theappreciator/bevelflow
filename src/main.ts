import "./style.css";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.innerHTML = `
    <main>
      <h1>Bevelflow</h1>
      <p>Coming soon.</p>
    </main>
  `;
}
