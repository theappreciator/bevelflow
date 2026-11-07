import { listRecords } from "../api";
import { formatDateTime, h } from "../dom";
import { formatPhone } from "../phone";
import { photoUrl, type RecordSummary } from "../../shared/types";
import { errorMessage, handleSessionExpired } from "./common";
import { contactButton } from "./contact";

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
      h(
        "h1",
        { class: "brand" },
        h("img", { class: "brand-logo", src: "/icon.svg", alt: "", width: 32, height: 32 }),
        "Bevelflow",
      ),
      h("div", { class: "topbar-actions" }, refreshBtn, h("a", { class: "btn btn-primary", href: "#/new", "aria-label": "New record" }, "+ New")),
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
          ? h("p", { class: "muted center" }, "No records yet. Tap “+ New” to add one.")
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
      contactButton("email", r.id, r.email, name),
      contactButton("call", r.id, r.phone, name),
    ),
  );
}
