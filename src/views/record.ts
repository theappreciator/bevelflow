import { createRecord, deletePhoto, getRecord, updateRecord, uploadPhoto } from "../api";
import { formatCents, parseDollarsToCents } from "../money";
import { formatDateTime, h } from "../dom";
import { resizeToJpeg } from "../image";
import {
  MAX_NOTES_LENGTH,
  MAX_PHOTOS_PER_RECORD,
  photoUrl,
  WORKFLOW_STATES,
  workflowLabel,
  type RecordDetail,
  type RecordFields,
  type WorkflowState,
} from "../../shared/types";
import { formatPublicId, qrPath } from "../../shared/publicId";
import { qrSvg } from "../qr";
import { labelPng, needsShareToPrint } from "../label";
import type { ContactEvent } from "../../shared/types";
import { formatPhone } from "../phone";
import { errorMessage, handleSessionExpired, showPhoto } from "./common";
import { contactButton, contactIcon, workflowIcon } from "./contact";

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
  /** iOS: label image (QR + ID) ready to hand to the Share sheet for printing. */
  let labelFile: File | null = null;
  /** An immediate workflow-state save is in progress. */
  let stateSaving = false;

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
  // Free-form notes: shows about three lines and scrolls inside itself for more.
  const notesInput = h("textarea", { id: "notes", rows: 3, maxlength: MAX_NOTES_LENGTH, oninput: onEdit });
  // New record: chosen like any other field and saved with Create.
  // Existing record: saved the moment it changes (no Save button needed).
  const stateSelect = h(
    "select",
    { id: "workflowState", onchange: () => (record ? void saveState() : onEdit()) },
    ...WORKFLOW_STATES.map((s) => h("option", { value: s.value }, s.label)),
  );
  const stateStatus = h("span", { class: "field-status", role: "status" });

  const saveBtn = h("button", { class: "btn btn-primary btn-block", type: "submit" }, id ? "Save changes" : "Create record");
  const cancelBtn = h("button", { class: "btn btn-block", type: "button", onclick: () => void cancel() }, "Cancel");
  const status = h("p", { class: "form-status", role: "status" });
  const meta = h("div", { class: "record-meta muted" });
  const publicIdValue = h("span", { class: "public-id-value" });
  const publicIdRow = h("div", { class: "public-id", hidden: true }, h("span", { class: "muted" }, "Record ID"), publicIdValue);
  /** QR code linking to /q/<public id>; drawn in the browser, never stored. */
  const qrBox = h("div", { class: "record-qr", role: "img", hidden: true });
  // What gets printed: just the QR code and the public ID. It lives outside #app so
  // print styles can hide everything else (see "Printing" in style.css).
  const printQr = h("div", { class: "print-label-qr" });
  const printId = h("div", { class: "print-label-id" });
  document.getElementById("print-label")?.remove();
  const printLabel = h("div", { id: "print-label", "aria-hidden": "true" }, printQr, printId);
  document.body.append(printLabel);
  const printBtn = h(
    "button",
    { class: "btn btn-block btn-print", type: "button", hidden: true, onclick: () => onPrint() },
    "Print QR code",
  );
  let qrFor = "";

  const workflowList = h("ul", { class: "contact-list" });
  const workflowSection = h(
    "section",
    { class: "workflow-history", hidden: true },
    h("div", { class: "section-head" }, h("h2", null, "Workflow history")),
    workflowList,
  );

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
      h(
        "label",
        { class: "field", for: "workflowState" },
        h("span", { class: "field-label-row" }, "Workflow state", stateStatus),
        stateSelect,
      ),
      ...textFields.map(([, , el]) => el),
      h(
        "label",
        { class: "field", for: "estimatedCost" },
        h("span", null, "Estimated cost"),
        h("div", { class: "input-prefix" }, h("span", { class: "input-prefix-symbol", "aria-hidden": "true" }, "$"), costInput),
        costError,
      ),
      h("label", { class: "field", for: "notes" }, h("span", null, "Notes"), notesInput),
    ),
    h("div", { class: "form-footer" }, status, h("div", { class: "form-actions" }, saveBtn, cancelBtn)),
    h("section", { class: "photos" }, photoHeading, photoGrid, photoError, fileInput),
    workflowSection,
    contactSection,
    meta,
    printBtn,
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
    fields.notes = notesInput.value.trim();
    return fields;
  }

  /** Put the saved values into the form (initial load only, so typing is never overwritten). */
  function fill(r: RecordDetail): void {
    for (const [key, input] of textFields) input.value = key === "phone" ? formatPhone(r.phone) : r[key];
    costInput.value = r.estimatedCostCents === null ? "" : formatCents(r.estimatedCostCents);
    notesInput.value = r.notes;
    stateSelect.value = r.workflowState;
    showSaved(r);
  }

  /** Refresh what comes from the server (title, ID, QR, contacts, dates) without touching the inputs. */
  function showSaved(r: RecordDetail): void {
    title.textContent = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Record";
    publicIdValue.textContent = formatPublicId(r.publicId);
    publicIdRow.hidden = !r.publicId;
    if (r.publicId && r.publicId !== qrFor) {
      qrFor = r.publicId;
      qrBox.innerHTML = qrSvg(location.origin + qrPath(r.publicId), "/icon.svg");
      printQr.innerHTML = qrBox.innerHTML;
      printId.textContent = formatPublicId(r.publicId);
      printBtn.hidden = false;
      // Prepared now so a tap can open the iOS Share sheet straight away (iOS only
      // allows that directly in response to the tap, not after slow work).
      labelFile = null;
      if (needsShareToPrint()) {
        const publicId = r.publicId;
        labelPng(qrBox.innerHTML, formatPublicId(publicId)).then(
          (blob) => {
            if (qrFor === publicId) labelFile = new File([blob], `bevelflow-${formatPublicId(publicId)}.png`, { type: "image/png" });
          },
          (err: unknown) => console.warn("Couldn't prepare label image", err),
        );
      }
      qrBox.setAttribute("aria-label", `QR code for record ${formatPublicId(r.publicId)}`);
      qrBox.hidden = false;
    }
    renderWorkflow(r);
    renderContacts(r);
    meta.replaceChildren(
      h("div", null, `Created ${formatDateTime(r.createdAt)}`, r.createdBy ? ` by ${r.createdBy}` : ""),
      h("div", null, `Last modified ${formatDateTime(r.updatedAt)}`, r.updatedBy ? ` by ${r.updatedBy}` : ""),
    );
  }

  /**
   * Print the QR code + ID. Computers and iOS Safari get the normal print dialog
   * (print styles show only #print-label). The iOS home screen app ignores
   * window.print(), so there we open the Share sheet with a label image; it has Print.
   */
  function onPrint(): void {
    if (needsShareToPrint() && labelFile && navigator.canShare?.({ files: [labelFile] })) {
      navigator.share({ files: [labelFile] }).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed the sheet
        setStatus(`Couldn't open printing: ${errorMessage(err)}`, true);
      });
      return;
    }
    window.print();
  }

  /** Log of workflow state changes, newest first. */
  function renderWorkflow(r: RecordDetail): void {
    workflowSection.hidden = false;
    workflowList.replaceChildren(
      ...(r.workflowHistory.length === 0
        ? [h("li", { class: "muted contact-empty" }, "No workflow changes recorded yet.")]
        : r.workflowHistory.map((w) =>
            h(
              "li",
              { class: "contact-item" },
              h("span", { class: "contact-chip is-workflow" }, workflowIcon()),
              h(
                "div",
                { class: "contact-text" },
                h(
                  "span",
                  null,
                  w.fromState === null
                    ? `Created as ${workflowLabel(w.toState)}`
                    : `${workflowLabel(w.fromState)} → ${workflowLabel(w.toState)}`,
                ),
                h("span", { class: "muted" }, formatDateTime(w.createdAt), w.createdBy ? ` · ${w.createdBy}` : ""),
              ),
            ),
          )),
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
      notesInput.value.trim() !== "" ||
      stateSelect.value !== "new"
    );
  }

  function onEdit(): void {
    status.textContent = "";
    status.className = "form-status";
    updateButtons();
  }

  function updateButtons(): void {
    stateSelect.disabled = busy || stateSaving;
    cancelBtn.disabled = busy || uploading > 0 || stateSaving;
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
      showSaved(updated);
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
      showSaved(record);
    } catch (err) {
      showPhotoError(err);
    } finally {
      busy = false;
      if (isCurrent()) renderPhotos();
    }
  }

  /** Existing record: save just the workflow state as soon as it's picked. */
  async function saveState(): Promise<void> {
    if (!record) return;
    const previous = record.workflowState;
    const value = stateSelect.value as WorkflowState;
    if (value === previous) return;
    stateSaving = true;
    stateStatus.className = "field-status";
    stateStatus.textContent = "Saving…";
    updateButtons();
    try {
      const updated = await updateRecord(record.id, { workflowState: value });
      if (!isCurrent()) return;
      record = updated;
      showSaved(updated);
      stateStatus.textContent = "Saved ✓";
    } catch (err) {
      handleSessionExpired(err);
      if (!isCurrent()) return;
      stateSelect.value = previous;
      stateStatus.className = "field-status error";
      stateStatus.textContent = `Not saved: ${errorMessage(err)}`;
    } finally {
      stateSaving = false;
      if (isCurrent()) updateButtons();
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
          showSaved(record);
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
