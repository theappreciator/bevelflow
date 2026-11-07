import { listRecords } from "../api";
import { formatDateTime, h } from "../dom";
import { formatPhone, telHref } from "../phone";
import { photoUrl, type RecordSummary } from "../../shared/types";
import { errorMessage, handleSessionExpired } from "./common";

export function renderList(root: HTMLElement): void {
  const list = h("div", { class: "list-body" });
  // The label stays in place (hidden) while loading so the button never changes size.
  const refreshBtn = h(
    "button",
    { class: "btn btn-refresh", type: "button", onclick: () => void load() },
    h("span", { class: "btn-label" }, "Refresh"),
    h("span", { class: "spinner", "aria-hidden": "true" }),
  );

  root.replaceChildren(
    h(
      "header",
      { class: "topbar" },
      h("h1", null, "Records"),
      h("div", { class: "topbar-actions" }, refreshBtn, h("a", { class: "btn btn-primary", href: "#/new" }, "New record")),
    ),
    list,
  );

  async function load(): Promise<void> {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");
    refreshBtn.setAttribute("aria-label", "Refreshing");
    if (!list.firstChild) list.replaceChildren(h("p", { class: "muted center" }, "Loading…"));
    try {
      const records = await listRecords();
      list.replaceChildren(
        records.length === 0
          ? h("p", { class: "muted center" }, "No records yet. Tap “New record” to add one.")
          : h("ul", { class: "record-list" }, ...records.map(row)),
      );
    } catch (err) {
      handleSessionExpired(err);
      list.replaceChildren(h("p", { class: "error center" }, errorMessage(err)));
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("is-loading");
      refreshBtn.removeAttribute("aria-label");
    }
  }

  void load();
}

/** "Last, First" — or whichever part exists. */
function displayName(r: RecordSummary): string {
  return [r.lastName, r.firstName].filter(Boolean).join(", ") || "(no name)";
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 24px outline icon from SVG path data. */
function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

const EMAIL_ICON = ["M4 6h16v12H4z", "m4 7 8 6 8-6"];
const PHONE_ICON = [
  "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
];

/** Icon link; rendered dimmed and inert when there's nothing to email/call. */
function contactButton(kind: "email" | "call", href: string | null, label: string, paths: string[]): HTMLElement {
  return href
    ? h("a", { class: `contact-btn is-${kind}`, href, "aria-label": label, title: label }, icon(paths))
    : h("span", { class: `contact-btn is-${kind} is-disabled`, "aria-hidden": "true" }, icon(paths));
}

function row(r: RecordSummary): HTMLLIElement {
  const thumb = h(
    "div",
    { class: "thumb-wrap" },
    r.thumbnailPhotoId
      ? h("img", {
          class: "thumb",
          src: photoUrl(r.id, r.thumbnailPhotoId),
          alt: "",
          loading: "lazy",
          decoding: "async",
        })
      : h("div", { class: "thumb thumb-empty", "aria-hidden": "true" }, "No photo"),
    r.photoCount > 1 ? h("span", { class: "thumb-count", "aria-label": `${r.photoCount} photos` }, r.photoCount) : null,
  );

  const name = displayName(r);
  const email = r.email.trim();
  const phone = r.phone.trim();

  return h(
    "li",
    { class: "record-item" },
    h(
      "a",
      { class: "record-row", href: `#/records/${encodeURIComponent(r.id)}` },
      thumb,
      h(
        "div",
        { class: "record-row-text" },
        h("span", { class: "record-row-name" }, name),
        h("span", { class: "record-row-phone" }, phone ? formatPhone(phone) : "—"),
        h("span", { class: "record-row-date muted" }, formatDateTime(r.createdAt)),
      ),
    ),
    h(
      "div",
      { class: "record-actions" },
      contactButton("email", email ? `mailto:${encodeURI(email)}` : null, `Email ${name}`, EMAIL_ICON),
      contactButton("call", phone ? telHref(phone) : null, `Call ${name}`, PHONE_ICON),
    ),
  );
}
