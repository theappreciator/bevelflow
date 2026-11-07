import { listRecords } from "../api";
import { formatDateTime, h } from "../dom";
import { formatUsd } from "../money";
import { formatPhone } from "../phone";
import { photoUrl, WORKFLOW_STATES, type RecordSummary } from "../../shared/types";
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
      h(
        "div",
        { class: "topbar-actions" },
        refreshBtn,
        h(
          "button",
          {
            class: "btn btn-scan",
            type: "button",
            "aria-label": "Scan QR code",
            title: "Scan QR code",
            onclick: () => void import("./scanner").then((m) => m.openScanner()),
          },
          "⛶",
        ),
        h("a", { class: "btn btn-primary", href: "#/new", "aria-label": "New record" }, "+ New"),
      ),
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
        ...(records.length === 0
          ? [h("p", { class: "muted center" }, "No records yet. Tap “+ New” to add one.")]
          : sections(records)),
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

/**
 * One section per workflow state, in the workflow order (New, In progress, …).
 * Records keep the API's newest-first order inside each section; states with no
 * records are left out.
 */
function sections(records: RecordSummary[]): HTMLElement[] {
  return WORKFLOW_STATES.flatMap(({ value, label }) => {
    const inState = records.filter((r) => r.workflowState === value);
    if (inState.length === 0) return [];
    const headingId = `state-${value}`;
    return [
      h(
        "section",
        { class: "state-section", "aria-labelledby": headingId },
        h(
          "h2",
          { class: "state-heading", id: headingId },
          label,
          h("span", { class: "state-count", "aria-label": `${inState.length} records` }, inState.length),
        ),
        ...dayGroups(inState),
      ),
    ];
  });
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const dayFormatWithYear = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Today", "Yesterday", "Thu, Nov 5", or with the year when it isn't this year. */
function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return (d.getFullYear() === today.getFullYear() ? dayFormat : dayFormatWithYear).format(d);
}

/**
 * Splits a section's records (already newest first) into one group per day they
 * were created (in the phone's time zone), each headed by the day, the number of
 * records and the total estimated cost (records with no estimate count as $0).
 */
function dayGroups(records: RecordSummary[]): HTMLElement[] {
  const groups = new Map<string, RecordSummary[]>();
  for (const r of records) {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()].map((dayRecords) => {
    const total = dayRecords.reduce((sum, r) => sum + (r.estimatedCostCents ?? 0), 0);
    const count = dayRecords.length;
    return h(
      "div",
      { class: "day-group" },
      h(
        "h3",
        { class: "day-heading" },
        h("span", null, dayLabel(dayRecords[0]!.createdAt)),
        h(
          "span",
          { class: "day-summary" },
          `${count} ${count === 1 ? "item" : "items"} · `,
          h("span", { class: "day-total" }, formatUsd(total)),
        ),
      ),
      h("ul", { class: "record-list" }, ...dayRecords.map(row)),
    );
  });
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
