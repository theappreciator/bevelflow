import {
  adminDeleteImage,
  adminHardDelete,
  adminImages,
  adminImageUrl,
  adminRecords,
  adminSetDeleted,
  adminUsers,
} from "../api";
import { append, formatDateTime, h } from "../dom";
import { formatPublicId } from "../../shared/publicId";
import { ESTIMATED_MAX_IMAGES, ESTIMATED_PHOTO_BYTES, FREE_R2_BYTES } from "../../shared/capacity";
import { workflowLabel, type AdminImage, type AdminRecord } from "../../shared/types";
import { errorMessage, handleSessionExpired, showPhoto } from "./common";

type Section = "home" | "records" | "images" | "users";

const SECTIONS: { id: Exclude<Section, "home">; icon: string; title: string; text: string }[] = [
  { id: "records", icon: "🗂", title: "Records", text: "All records, including deleted ones. Soft delete, restore, or delete permanently. Free-tier space estimate." },
  { id: "images", icon: "🖼", title: "Images", text: "Every stored photo, including orphaned files that no record shows. Delete any image." },
  { id: "users", icon: "👤", title: "People with access", text: "The email addresses allowed to sign in to Bevelflow." },
];

/** #/admin and its detail pages #/admin/records, #/admin/images, #/admin/users. */
export function renderAdmin(root: HTMLElement, section: Section, isCurrent: () => boolean): void {
  const title = section === "home" ? "Admin" : (SECTIONS.find((s) => s.id === section)?.title ?? "Admin");
  const back =
    section === "home"
      ? h("a", { class: "back", href: "#/" }, "‹ Records")
      : h("a", { class: "back", href: "#/admin" }, "‹ Admin");
  const body = h("div", { class: "admin-body" });
  root.replaceChildren(h("header", { class: "topbar" }, back, h("h1", null, `🛡 ${title}`)), body);

  if (section === "home") {
    body.replaceChildren(
      h(
        "ul",
        { class: "admin-menu" },
        ...SECTIONS.map((s) =>
          h(
            "li",
            null,
            h(
              "a",
              { class: "admin-menu-item", href: `#/admin/${s.id}` },
              h("span", { class: "admin-menu-icon", "aria-hidden": "true" }, s.icon),
              h("span", { class: "admin-menu-text" }, h("strong", null, s.title), h("span", { class: "muted" }, s.text)),
              h("span", { class: "admin-menu-chevron", "aria-hidden": "true" }, "›"),
            ),
          ),
        ),
      ),
    );
    return;
  }

  const load = section === "records" ? loadRecords : section === "images" ? loadImages : loadUsers;
  void load(body, isCurrent);
}

function loading(body: HTMLElement): void {
  body.replaceChildren(h("p", { class: "muted center" }, "Loading…"));
}

function failed(body: HTMLElement, err: unknown): void {
  handleSessionExpired(err);
  body.replaceChildren(h("p", { class: "error center" }, errorMessage(err)));
}

/** 0.031 -> "0.03%", 12.34 -> "12.3%": small values keep two decimals so they don't read as 0. */
const formatPercent = (pct: number): string => `${pct > 0 && pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}%`;

const kb = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

/** "Free-tier space used (estimate)" card: progress bar, bold percent, figures and assumptions. */
function capacityCard(pct: number, figures: string, note: string): HTMLElement {
  const fill = h("span", { class: "capacity-fill" });
  // Set through the style object (allowed by the CSP, unlike a style="" attribute).
  fill.style.width = `${Math.max(Math.min(100, pct), 0.5)}%`;
  return h(
    "section",
    { class: "admin-card" },
    h("h2", null, "Free-tier space used (estimate)"),
    h(
      "div",
      { class: "capacity-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": pct.toFixed(2) },
      fill,
    ),
    h("p", { class: "capacity-figures" }, h("strong", null, formatPercent(pct)), ` · ${figures}`),
    h("p", { class: "muted small" }, note),
  );
}

/** Runs an admin action with the button disabled; reloads the page section afterwards. */
async function act(button: HTMLButtonElement, work: () => Promise<unknown>, reload: () => void): Promise<void> {
  button.disabled = true;
  try {
    await work();
    reload();
  } catch (err) {
    handleSessionExpired(err);
    alert(errorMessage(err));
    button.disabled = false;
  }
}

// ---- Records ------------------------------------------------------------------

async function loadRecords(body: HTMLElement, isCurrent: () => boolean): Promise<void> {
  loading(body);
  try {
    const { records, capacity } = await adminRecords();
    if (!isCurrent()) return;
    const reload = (): void => void loadRecords(body, isCurrent);
    const pct = capacity.percentUsed;
    const a = capacity.assumptions;
    body.replaceChildren(
      capacityCard(
        pct,
        `${capacity.recordCount.toLocaleString()} of ~${capacity.estimatedMaxRecords.toLocaleString()} records`,
        `Assumes ${a.photosPerRecord} photos per record at ~${kb(a.photoBytes)} each and ~${kb(a.recordDbBytes)} of database per record, ` +
          `against the free ${Math.round(a.freeR2Bytes / 1e9)} GB photo storage and ${Math.round(a.freeD1Bytes / 1e6)} MB database. Deleted records still count.`,
      ),
      records.length === 0
        ? h("p", { class: "muted center" }, "No records.")
        : h("ul", { class: "admin-list" }, ...records.map((r) => recordRow(r, reload))),
    );
  } catch (err) {
    if (isCurrent()) failed(body, err);
  }
}

function recordRow(r: AdminRecord, reload: () => void): HTMLLIElement {
  const name = [r.lastName, r.firstName].filter(Boolean).join(", ") || "(no name)";
  const deleted = r.deletedAt !== null;
  const softBtn = h("button", { class: "btn btn-small", type: "button" }, deleted ? "Restore" : "Soft delete");
  softBtn.addEventListener("click", () => {
    if (!deleted && !confirm(`Soft delete "${name}"? It will be hidden from the main list. You can restore it here.`)) return;
    void act(softBtn, () => adminSetDeleted(r.id, !deleted), reload);
  });
  const hardBtn = h("button", { class: "btn btn-small btn-danger", type: "button" }, "Delete permanently");
  hardBtn.addEventListener("click", () => {
    const photos = r.photoCount ? ` and its ${r.photoCount} photo${r.photoCount === 1 ? "" : "s"}` : "";
    if (!confirm(`Permanently delete "${name}" (${formatPublicId(r.publicId)})${photos}? This can't be undone.`)) return;
    void act(hardBtn, () => adminHardDelete(r.id), reload);
  });
  return h(
    "li",
    { class: `admin-row${deleted ? " is-deleted" : ""}` },
    h(
      "div",
      { class: "admin-row-main" },
      h("a", { class: "admin-row-title", href: `#/records/${encodeURIComponent(r.id)}` }, name),
      h(
        "div",
        { class: "admin-row-meta muted" },
        h("span", { class: "mono" }, formatPublicId(r.publicId)),
        " · ",
        deleted ? h("span", { class: "badge badge-deleted" }, "Deleted") : workflowLabel(r.workflowState),
        ` · ${r.photoCount} photo${r.photoCount === 1 ? "" : "s"}${r.photoBytes ? ` (${kb(r.photoBytes)})` : ""}`,
      ),
      h("div", { class: "admin-row-meta muted" }, `Created ${formatDateTime(r.createdAt)}`),
    ),
    h("div", { class: "admin-row-actions" }, softBtn, hardBtn),
  );
}

// ---- Images -------------------------------------------------------------------

async function loadImages(body: HTMLElement, isCurrent: () => boolean): Promise<void> {
  loading(body);
  try {
    const { images, missingFiles } = await adminImages();
    if (!isCurrent()) return;
    const reload = (): void => void loadImages(body, isCurrent);
    const orphans = images.filter((i) => !i.photoId).length;
    const total = images.reduce((s, i) => s + i.bytes, 0);
    body.replaceChildren();
    append(
      body,
      capacityCard(
        (images.length / ESTIMATED_MAX_IMAGES) * 100,
        `${images.length.toLocaleString()} of ~${ESTIMATED_MAX_IMAGES.toLocaleString()} images`,
        `Assumes ~${kb(ESTIMATED_PHOTO_BYTES)} per image (the average measured in production), against the free ` +
          `${Math.round(FREE_R2_BYTES / 1e9)} GB photo storage. These ${images.length} image${images.length === 1 ? "" : "s"} use ${kb(total)}.`,
      ),
      orphans ? h("p", { class: "admin-summary" }, h("span", { class: "badge badge-orphan" }, `⚠ ${orphans} orphaned`)) : null,
      images.length === 0
        ? h("p", { class: "muted center" }, "No images.")
        : h("ul", { class: "admin-list" }, ...images.map((i) => imageRow(i, reload))),
      missingFiles.length
        ? h(
            "section",
            { class: "admin-card" },
            h("h2", null, "Photos with a missing file"),
            h("p", { class: "muted small" }, "These records list a photo whose file is no longer in storage."),
            h(
              "ul",
              { class: "plain-list" },
              ...missingFiles.map((m) =>
                h("li", null, h("a", { href: `#/records/${encodeURIComponent(m.recordId)}` }, formatPublicId(m.recordPublicId)), ` · ${m.key}`),
              ),
            ),
          )
        : null,
    );
  } catch (err) {
    if (isCurrent()) failed(body, err);
  }
}

function imageRow(i: AdminImage, reload: () => void): HTMLLIElement {
  const src = adminImageUrl(i.key);
  const del = h("button", { class: "btn btn-small btn-danger", type: "button" }, "Delete");
  del.addEventListener("click", () => {
    const where = i.recordPublicId ? ` from record ${formatPublicId(i.recordPublicId)}` : " (orphaned file)";
    if (!confirm(`Permanently delete this image${where}? This can't be undone.`)) return;
    void act(del, () => adminDeleteImage(i.key), reload);
  });
  return h(
    "li",
    { class: `admin-row${i.photoId ? "" : " is-orphan"}` },
    h("img", { class: "thumb", src, alt: "", loading: "lazy", decoding: "async", onclick: () => showPhoto(src) }),
    h(
      "div",
      { class: "admin-row-main" },
      i.recordId
        ? h("a", { class: "admin-row-title", href: `#/records/${encodeURIComponent(i.recordId)}` }, `${formatPublicId(i.recordPublicId ?? "")} · ${i.recordName}`)
        : h("span", { class: "badge badge-orphan" }, "⚠ Orphaned: not shown anywhere in the app"),
      h(
        "div",
        { class: "admin-row-meta muted" },
        `${kb(i.bytes)} · uploaded ${formatDateTime(i.uploadedAt)}`,
        i.recordDeleted ? h("span", { class: "badge badge-deleted" }, "Record deleted") : null,
      ),
    ),
    h("div", { class: "admin-row-actions" }, del),
  );
}

// ---- People with access -------------------------------------------------------

async function loadUsers(body: HTMLElement, isCurrent: () => boolean): Promise<void> {
  loading(body);
  try {
    const res = await adminUsers();
    if (!isCurrent()) return;
    const emails = res.rules.filter((r) => r.decision === "allow");
    body.replaceChildren();
    append(
      body,
      res.message ? h("p", { class: "admin-card muted" }, res.message) : null,
      emails.length
        ? h(
            "ul",
            { class: "admin-list" },
            ...emails.map((r) =>
              h(
                "li",
                { class: "admin-row" },
                h("span", { class: "admin-user-icon", "aria-hidden": "true" }, r.type === "email" ? "👤" : "👥"),
                h(
                  "div",
                  { class: "admin-row-main" },
                  h("span", { class: "admin-row-title" }, r.value),
                  h("div", { class: "admin-row-meta muted" }, r.type === "email" ? "Email" : `Rule: ${r.type}`, ` · policy "${r.policy}"`),
                ),
              ),
            ),
          )
        : res.configured
          ? h("p", { class: "muted center" }, "No one is allowed in by the current policy.")
          : null,
      h("p", { class: "muted small center" }, "Access is managed in Cloudflare Zero Trust (Access → Policies → “bevelflow allowed users”)."),
    );
  } catch (err) {
    if (isCurrent()) failed(body, err);
  }
}
