import { createRecord, deletePhoto, getRecord, updateRecord, uploadPhoto } from "../api";
import { formatCents, parseDollarsToCents } from "../money";
import { formatDateTime, h } from "../dom";
import { resizeToJpeg } from "../image";
import {
  MAX_PHOTOS_PER_RECORD,
  photoUrl,
  WORKFLOW_STATES,
  type RecordDetail,
  type RecordFields,
  type WorkflowState,
} from "../../shared/types";
import { formatPublicId, qrPath } from "../../shared/publicId";
import { qrSvg } from "../qr";
import type { ContactEvent } from "../../shared/types";
import { formatPhone } from "../phone";
import { errorMessage, handleSessionExpired, showPhoto } from "./common";
import { contactButton, contactIcon } from "./contact";

type TextKey = "firstName" | "lastName" | "email" | "phone";

/** A photo picked on the "new record" screen, uploaded when the record is first saved. */
interface PendingPhoto {
  blob: Blob;
  url: string;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * New record (id = null) or view/edit an existing one.
 * `isCurrent` lets async work bail out if the user has navigated elsewhere.
 *
 * Cancel (and "‹ Records") throws away unsaved typing. On an existing record it also
 * deletes photos added since the record was opened or last saved. It asks first if
 * there is anything to lose.
 */
export function renderRecord(root: HTMLElement, id: string | null, isCurrent: () => boolean): void {
  let record: RecordDetail | null = null;
  const pending: PendingPhoto[] = [];
  /** Existing record: photos uploaded since it was opened / last saved. */
  const addedThisVisit = new Set<string>();
  let uploading = 0;
  let busy = false;

  // ---- form controls ------------------------------------------------------
  const text = (
    key: TextKey,
    label: string,
    attrs: Record<string, string> = {},
  ): [TextKey, HTMLInputElement, HTMLElement] => {
    const input = h("input", { id: key, type: "text", autocomplete: "off", ...attrs, oninput: onEdit });
    return [key, input, h("label", { class: "field", for: key }, h("span", null, label), input)];
  };
  const textFields = [
    text("firstName", "First name"),
    text("lastName", "Last name"),
    // Take the email exactly as typed: no auto-capitalising, autocorrect or spellcheck.
    text("email", "Email", { inputmode: "email", autocapitalize: "none", autocorrect: "off", spellcheck: "false" }),
    text("phone", "Phone", { inputmode: "tel" }),
  ];
  // Show the phone in the same format as the list; tidy it when leaving the field.
  const phoneInput = textFields.find(([key]) => key === "phone")![1];
  phoneInput.addEventListener("blur", () => {
    phoneInput.value = formatPhone(phoneInput.value);
    onEdit();
  });
  const costInput = h("input", {
    id: "estimatedCost",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0.00",
    oninput: onEdit,
    onblur: () => {
      const cents = parseDollarsToCents(costInput.value);
      if (typeof cents === "number") costInput.value = formatCents(cents);
    },
  });
  const costError = h("span", { class: "field-error", hidden: true }, "Enter an amount like 25.12");
  const stateSelect = h(
    "select",
    { id: "workflowState", onchange: onEdit },
    ...WORKFLOW_STATES.map((s) => h("option", { value: s.value }, s.label)),
  );

  const saveBtn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, id ? "Save changes" : "Create record");
  const cancelBtn = h("button", { class: "btn btn-block", type: "button", onclick: () => void cancel() }, "Cancel");
  const status = h("p", { class: "form-status", role: "status" });
  const meta = h("div", { class: "record-meta muted" });
  const publicIdValue = h("span", { class: "public-id-value" });
  const publicIdRow = h("div", { class: "public-id", hidden: true }, h("span", { class: "muted" }, "Record ID"), publicIdValue);
  /** QR code linking to /q/<public id>; drawn in the browser, never stored. */
  const qrBox = h("div", { class: "record-qr", role: "img", hidden: true });
  let qrFor = "";

  const contactButtons = h("div", { class: "record-actions" });
  const contactList = h("ul", { class: "contact-list" });
  const contactSection = h(
    "section",
    { class: "contacts", hidden: true },
    h("div", { class: "section-head" }, h("h2", null, "Contact history"), contactButtons),
    contactList,
  );

  const photoHeading = h("h2", null);
  const photoGrid = h("div", { class: "photo-grid" });
  const photoError = h("p", { class: "error", hidden: true });
  const fileInput = h("input", {
    type: "file",
    accept: "image/*",
    capture: "environment",
    hidden: true,
    onchange: () => void onPhotoChosen(),
  });

  const title = h("h1", null, id ? "Record" : "New record");
  const content = h(
    "form",
    {
      class: "record-body",
      novalidate: true,
      onsubmit: (e: Event) => {
        e.preventDefault();
        void save();
      },
    },
    h(
      "div",
      { class: "record-fields" },
      publicIdRow,
      ...textFields.map(([, , el]) => el),
      h(
        "label",
        { class: "field", for: "estimatedCost" },
        h("span", null, "Estimated cost"),
        h("div", { class: "input-prefix" }, h("span", { class: "input-prefix-symbol", "aria-hidden": "true" }, "$"), costInput),
        costError,
      ),
      h("label", { class: "field", for: "workflowState" }, h("span", null, "Workflow state"), stateSelect),
    ),
    h("section", { class: "photos" }, photoHeading, photoGrid, photoError, fileInput),
    contactSection,
    meta,
    h("div", { class: "form-footer" }, status, h("div", { class: "form-actions" }, saveBtn, cancelBtn)),
    qrBox,
  );

  const back = h(
    "a",
    {
      class: "back",
      href: "#/",
      onclick: (e: Event) => {
        e.preventDefault();
        void cancel();
      },
    },
    "‹ Records",
  );

  root.replaceChildren(
    h("header", { class: "topbar" }, back, title),
    id ? h("p", { class: "muted center" }, "Loading…") : content,
  );

  // ---- helpers ------------------------------------------------------------
  function readFields(): RecordFields | null {
    const cents = parseDollarsToCents(costInput.value);
    costError.hidden = cents !== "invalid";
    if (cents === "invalid") return null;
    const fields = { estimatedCostCents: cents, workflowState: stateSelect.value as WorkflowState } as RecordFields;
    for (const [key, input] of textFields) fields[key] = input.value.trim();
    return fields;
  }

  function fill(r: RecordDetail): void {
    for (const [key, input] of textFields) input.value = key === "phone" ? formatPhone(r.phone) : r[key];
    costInput.value = r.estimatedCostCents === null ? "" : formatCents(r.estimatedCostCents);
    stateSelect.value = r.workflowState;
    title.textContent = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Record";
    publicIdValue.textContent = formatPublicId(r.publicId);
    publicIdRow.hidden = !r.publicId;
    if (r.publicId && r.publicId !== qrFor) {
      qrFor = r.publicId;
      qrBox.innerHTML = qrSvg(location.origin + qrPath(r.publicId), "/icon.svg");
      qrBox.setAttribute("aria-label", `QR code for record ${formatPublicId(r.publicId)}`);
      qrBox.hidden = false;
    }
    renderContacts(r);
    meta.replaceChildren(
      h("div", null, `Created ${formatDateTime(r.createdAt)}`, r.createdBy ? ` by ${r.createdBy}` : ""),
      h("div", null, `Last modified ${formatDateTime(r.updatedAt)}`, r.updatedBy ? ` by ${r.updatedBy}` : ""),
    );
  }

  /** Email/Call buttons (using the saved email and phone) and the log of past taps. */
  function renderContacts(r: RecordDetail): void {
    contactSection.hidden = false;
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || "this record";
    const onLogged = (event: ContactEvent): void => {
      if (!record || !isCurrent()) return;
      record.contacts.unshift(event);
      renderContacts(record);
    };
    contactButtons.replaceChildren(
      contactButton("email", r.id, r.email, name, onLogged),
      contactButton("call", r.id, r.phone, name, onLogged),
    );
    contactList.replaceChildren(
      ...(r.contacts.length === 0
        ? [h("li", { class: "muted contact-empty" }, "No emails or calls yet.")]
        : r.contacts.map((c) =>
            h(
              "li",
              { class: "contact-item" },
              h("span", { class: `contact-chip is-${c.kind}` }, contactIcon(c.kind)),
              h(
                "div",
                { class: "contact-text" },
                h(
                  "span",
                  null,
                  c.kind === "email" ? "Email" : "Call",
                  c.target ? ` · ${c.kind === "call" ? formatPhone(c.target) : c.target}` : "",
                ),
                h("span", { class: "muted" }, formatDateTime(c.createdAt), c.createdBy ? ` · ${c.createdBy}` : ""),
              ),
            ),
          )),
    );
  }

  /** Fields that differ from the saved record (edit mode). null = invalid input. */
  function changes(): Partial<RecordFields> | null {
    const f = readFields();
    if (!f || !record) return f;
    const diff: Partial<RecordFields> = {};
    for (const key of Object.keys(f) as (keyof RecordFields)[]) {
      // Reformatting alone (e.g. 5558675309 -> (555) 867-5309) isn't a change.
      const same = key === "phone" ? formatPhone(f.phone) === formatPhone(record.phone) : f[key] === record[key];
      if (!same) (diff as Record<string, unknown>)[key] = f[key];
    }
    return diff;
  }

  /** Has the person typed or changed anything that isn't saved yet? */
  function hasUnsavedTyping(): boolean {
    if (record) {
      const diff = changes();
      return diff === null || Object.keys(diff).length > 0;
    }
    return (
      textFields.some(([, input]) => input.value.trim() !== "") ||
      costInput.value.trim() !== "" ||
      stateSelect.value !== "new"
    );
  }

  function onEdit(): void {
    status.textContent = "";
    status.className = "form-status";
    updateButtons();
  }

  function updateButtons(): void {
    cancelBtn.disabled = busy || uploading > 0;
    if (!record) {
      saveBtn.disabled = busy || uploading > 0;
      return;
    }
    const diff = changes();
    const dirty = !diff || Object.keys(diff).length > 0 || addedThisVisit.size > 0;
    saveBtn.disabled = busy || uploading > 0 || !dirty;
  }

  function photoCount(): number {
    return (record?.photos.length ?? 0) + pending.length + uploading;
  }

  function renderPhotos(): void {
    photoHeading.textContent = `Photos (${photoCount()} of ${MAX_PHOTOS_PER_RECORD})`;
    const tiles: HTMLElement[] = [];

    for (const p of record?.photos ?? []) {
      const src = photoUrl(record!.id, p.id);
      tiles.push(photoTile(src, () => void removeSaved(p.id)));
    }
    for (const p of pending) {
      tiles.push(photoTile(p.url, () => removePending(p)));
    }
    for (let i = 0; i < uploading; i++) {
      tiles.push(h("div", { class: "photo-tile photo-uploading" }, "Uploading…"));
    }
    if (photoCount() < MAX_PHOTOS_PER_RECORD) {
      tiles.push(
        h(
          "button",
          { class: "photo-tile photo-add", type: "button", disabled: busy, onclick: () => fileInput.click() },
          h("span", { class: "photo-add-icon", "aria-hidden": "true" }, "+"),
          "Add photo",
        ),
      );
    }
    photoGrid.replaceChildren(...tiles);
    updateButtons();
  }

  function photoTile(src: string, onDelete: () => void): HTMLElement {
    return h(
      "div",
      { class: "photo-tile" },
      h("img", { src, alt: "", loading: "lazy", decoding: "async", onclick: () => showPhoto(src) }),
      h("button", { class: "photo-delete", type: "button", "aria-label": "Delete photo", disabled: busy, onclick: onDelete }, "×"),
    );
  }

  function showPhotoError(err: unknown): void {
    handleSessionExpired(err);
    photoError.textContent = errorMessage(err);
    photoError.hidden = false;
  }

  function setStatus(message: string, isError = false): void {
    status.className = isError ? "form-status error" : "form-status";
    status.textContent = message;
  }

  // ---- actions ------------------------------------------------------------
  async function onPhotoChosen(): Promise<void> {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || photoCount() >= MAX_PHOTOS_PER_RECORD) return;
    photoError.hidden = true;

    if (!record) {
      // New record: keep it until the record is created.
      try {
        const blob = await resizeToJpeg(file);
        pending.push({ blob, url: URL.createObjectURL(blob) });
      } catch (err) {
        showPhotoError(err);
      }
      renderPhotos();
      return;
    }

    uploading++;
    renderPhotos();
    try {
      const blob = await resizeToJpeg(file);
      const before = new Set(record.photos.map((p) => p.id));
      const updated = await uploadPhoto(record.id, blob);
      for (const p of updated.photos) if (!before.has(p.id)) addedThisVisit.add(p.id);
      if (!isCurrent()) return;
      record = updated;
      fill(updated);
    } catch (err) {
      showPhotoError(err);
    } finally {
      uploading--;
      if (isCurrent()) renderPhotos();
    }
  }

  function removePending(p: PendingPhoto): void {
    URL.revokeObjectURL(p.url);
    pending.splice(pending.indexOf(p), 1);
    renderPhotos();
  }

  async function removeSaved(photoId: string): Promise<void> {
    if (!record || !confirm("Delete this photo? This can't be undone.")) return;
    photoError.hidden = true;
    busy = true;
    renderPhotos();
    try {
      record = await deletePhoto(record.id, photoId);
      addedThisVisit.delete(photoId);
      if (!isCurrent()) return;
      fill(record);
    } catch (err) {
      showPhotoError(err);
    } finally {
      busy = false;
      if (isCurrent()) renderPhotos();
    }
  }

  async function save(): Promise<void> {
    const fields = readFields();
    if (!fields || busy || uploading > 0) return;
    busy = true;
    renderPhotos();
    setStatus("Saving…");
    try {
      if (!record) {
        const created = await createRecord(fields);
        let failed = 0;
        for (const [i, p] of pending.entries()) {
          setStatus(`Uploading photo ${i + 1} of ${pending.length}…`);
          try {
            await uploadPhoto(created.id, p.blob);
          } catch (err) {
            if (handleSessionExpired(err)) throw err;
            failed++;
          }
          URL.revokeObjectURL(p.url);
        }
        pending.length = 0;
        if (failed) alert(`${plural(failed, "photo")} failed to upload. You can add them again on the record.`);
        location.replace("#/");
        return;
      }
      const diff = changes();
      if (diff && Object.keys(diff).length) {
        await updateRecord(record.id, diff);
      }
      addedThisVisit.clear();
      if (isCurrent()) location.hash = "#/";
      return;
    } catch (err) {
      handleSessionExpired(err);
      setStatus(errorMessage(err), true);
    } finally {
      busy = false;
      if (isCurrent()) renderPhotos();
    }
  }

  async function cancel(): Promise<void> {
    if (busy) return;
    if (uploading > 0) {
      alert("Please wait for the photo upload to finish.");
      return;
    }

    const typed = hasUnsavedTyping();
    const photos = record ? addedThisVisit.size : pending.length;
    if (typed || photos > 0) {
      const lose: string[] = [];
      if (typed) lose.push(record ? "your unsaved changes" : "what you've typed");
      if (photos > 0) {
        lose.push(
          record
            ? `the ${plural(photos, "photo")} you added (${photos === 1 ? "it" : "they"} will be deleted)`
            : plural(photos, "photo"),
        );
      }
      const question = record ? "Discard changes?" : "Discard this new record?";
      if (!confirm(`${question}\n\nYou will lose ${lose.join(" and ")}.`)) return;
    }

    if (record && addedThisVisit.size > 0) {
      busy = true;
      renderPhotos();
      setStatus("Deleting photos…");
      try {
        for (const photoId of [...addedThisVisit]) {
          record = await deletePhoto(record.id, photoId);
          addedThisVisit.delete(photoId);
        }
      } catch (err) {
        handleSessionExpired(err);
        busy = false;
        if (isCurrent()) {
          fill(record);
          renderPhotos();
          setStatus(`Couldn't delete the photos: ${errorMessage(err)}`, true);
        }
        return;
      }
    }

    for (const p of pending) URL.revokeObjectURL(p.url);
    location.hash = "#/";
  }

  // ---- initial render -----------------------------------------------------
  if (!id) {
    stateSelect.value = "new";
    renderPhotos();
    return;
  }

  getRecord(id).then(
    (r) => {
      if (!isCurrent()) return;
      record = r;
      fill(r);
      root.lastElementChild!.replaceWith(content);
      renderPhotos();
    },
    (err: unknown) => {
      if (!isCurrent()) return;
      handleSessionExpired(err);
      root.lastElementChild!.replaceWith(h("p", { class: "error center" }, errorMessage(err)));
    },
  );
}
