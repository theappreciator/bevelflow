import { listRecords } from "../api";
import { formatDateTime, h } from "../dom";
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

function row(r: RecordSummary): HTMLLIElement {
  const thumb = r.thumbnailPhotoId
    ? h("img", {
        class: "thumb",
        src: photoUrl(r.id, r.thumbnailPhotoId),
        alt: "",
        loading: "lazy",
        decoding: "async",
      })
    : h("div", { class: "thumb thumb-empty", "aria-hidden": "true" }, "No photo");

  return h(
    "li",
    null,
    h(
      "a",
      { class: "record-row", href: `#/records/${encodeURIComponent(r.id)}` },
      thumb,
      h(
        "div",
        { class: "record-row-text" },
        h("span", { class: "record-row-name" }, displayName(r)),
        h("span", { class: "record-row-phone" }, r.phone || "—"),
        h("span", { class: "record-row-date muted" }, formatDateTime(r.createdAt)),
      ),
    ),
  );
}
