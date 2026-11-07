import { createRecord, deletePhoto, getRecord, updateRecord, uploadPhoto } from "../api";
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
import { errorMessage, handleSessionExpired, showPhoto } from "./common";

type TextKey = "firstName" | "lastName" | "email" | "phone";

/** A photo picked on the "new record" screen, uploaded when the record is first saved. */
interface PendingPhoto {
  blob: Blob;
  url: string;
}

/**
 * New record (id = null) or view/edit an existing one.
 * `isCurrent` lets async work bail out if the user has navigated elsewhere.
 */
export function renderRecord(root: HTMLElement, id: string | null, isCurrent: () => boolean): void {
  let record: RecordDetail | null = null;
  const pending: PendingPhoto[] = [];
  let uploading = 0;
  let busy = false;

  // ---- form controls ------------------------------------------------------
  const text = (key: TextKey, label: string, inputmode: string, autocomplete: string): [TextKey, HTMLInputElement, HTMLElement] => {
    const input = h("input", { id: key, type: "text", inputmode, autocomplete, oninput: onEdit });
    return [key, input, h("label", { class: "field", for: key }, h("span", null, label), input)];
  };
  const textFields = [
    text("firstName", "First name", "text", "off"),
    text("lastName", "Last name", "text", "off"),
    text("email", "Email", "email", "off"),
    text("phone", "Phone", "tel", "off"),
  ];
  const costInput = h("input", { id: "estimatedCost", type: "text", inputmode: "numeric", autocomplete: "off", oninput: onEdit });
  const costError = h("span", { class: "field-error", hidden: true }, "Enter a whole number, e.g. 1200");
  const stateSelect = h(
    "select",
    { id: "workflowState", onchange: onEdit },
    ...WORKFLOW_STATES.map((s) => h("option", { value: s.value }, s.label)),
  );

  const saveBtn = h("button", { class: "btn btn-primary", type: "submit" }, id ? "Save changes" : "Create record");
  const status = h("p", { class: "form-status", role: "status" });
  const meta = h("div", { class: "record-meta muted" });

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
  const form = h(
    "form",
    { class: "record-form", novalidate: true, onsubmit: (e: Event) => { e.preventDefault(); void save(); } },
    ...textFields.map(([, , el]) => el),
    h("label", { class: "field", for: "estimatedCost" }, h("span", null, "Estimated cost"), costInput, costError),
    h("label", { class: "field", for: "workflowState" }, h("span", null, "Workflow state"), stateSelect),
    h("div", { class: "form-actions" }, saveBtn, status),
  );

  const content = h(
    "div",
    { class: "record-body" },
    form,
    h("section", { class: "photos" }, photoHeading, photoGrid, photoError, fileInput),
    meta,
  );

  root.replaceChildren(
    h("header", { class: "topbar" }, h("a", { class: "back", href: "#/" }, "‹ Records"), title),
    id ? h("p", { class: "muted center" }, "Loading…") : content,
  );

  // ---- helpers ------------------------------------------------------------
  function parseCost(): number | null | "invalid" {
    const raw = costInput.value.replace(/[\s,$]/g, "");
    if (raw === "") return null;
    return /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : "invalid";
  }

  function readFields(): RecordFields | null {
    const cost = parseCost();
    costError.hidden = cost !== "invalid";
    if (cost === "invalid") return null;
    const fields = { estimatedCost: cost, workflowState: stateSelect.value as WorkflowState } as RecordFields;
    for (const [key, input] of textFields) fields[key] = input.value.trim();
    return fields;
  }

  function fill(r: RecordDetail): void {
    for (const [key, input] of textFields) input.value = r[key];
    costInput.value = r.estimatedCost === null ? "" : String(r.estimatedCost);
    stateSelect.value = r.workflowState;
    title.textContent = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Record";
    meta.replaceChildren(
      h("div", null, `Created ${formatDateTime(r.createdAt)}`, r.createdBy ? ` by ${r.createdBy}` : ""),
      h("div", null, `Last modified ${formatDateTime(r.updatedAt)}`, r.updatedBy ? ` by ${r.updatedBy}` : ""),
    );
  }

  /** Fields that differ from the saved record (edit mode). */
  function changes(): Partial<RecordFields> | null {
    const f = readFields();
    if (!f || !record) return f;
    const diff: Partial<RecordFields> = {};
    for (const key of Object.keys(f) as (keyof RecordFields)[]) {
      if (f[key] !== record[key]) (diff as Record<string, unknown>)[key] = f[key];
    }
    return diff;
  }

  function onEdit(): void {
    status.textContent = "";
    updateSaveButton();
  }

  function updateSaveButton(): void {
    if (!id) {
      saveBtn.disabled = busy;
      return;
    }
    const diff = changes();
    saveBtn.disabled = busy || !diff || Object.keys(diff).length === 0;
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
      const updated = await uploadPhoto(record.id, blob);
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
      if (!isCurrent()) return;
      fill(record);
    } catch (err) {
      showPhotoError(err);
    } finally {
      busy = false;
      if (isCurrent()) {
        renderPhotos();
        updateSaveButton();
      }
    }
  }

  async function save(): Promise<void> {
    const fields = readFields();
    if (!fields || busy) return;
    busy = true;
    updateSaveButton();
    renderPhotos();
    status.className = "form-status";
    status.textContent = "Saving…";
    try {
      if (!record) {
        const created = await createRecord(fields);
        let failed = 0;
        for (const [i, p] of pending.entries()) {
          status.textContent = `Uploading photo ${i + 1} of ${pending.length}…`;
          try {
            await uploadPhoto(created.id, p.blob);
          } catch (err) {
            if (handleSessionExpired(err)) throw err;
            failed++;
          }
          URL.revokeObjectURL(p.url);
        }
        pending.length = 0;
        if (failed) alert(`${failed} photo(s) failed to upload. You can add them again on the record.`);
        location.replace(`#/records/${encodeURIComponent(created.id)}`);
        return;
      }
      const diff = changes();
      if (diff && Object.keys(diff).length) {
        record = await updateRecord(record.id, diff);
        if (!isCurrent()) return;
        fill(record);
      }
      status.textContent = "Saved";
    } catch (err) {
      handleSessionExpired(err);
      status.className = "form-status error";
      status.textContent = errorMessage(err);
    } finally {
      busy = false;
      if (isCurrent()) {
        updateSaveButton();
        renderPhotos();
      }
    }
  }

  // ---- initial render -----------------------------------------------------
  if (!id) {
    stateSelect.value = "new";
    renderPhotos();
    updateSaveButton();
    return;
  }

  getRecord(id).then(
    (r) => {
      if (!isCurrent()) return;
      record = r;
      fill(r);
      root.lastElementChild!.replaceWith(content);
      renderPhotos();
      updateSaveButton();
    },
    (err: unknown) => {
      if (!isCurrent()) return;
      handleSessionExpired(err);
      root.lastElementChild!.replaceWith(h("p", { class: "error center" }, errorMessage(err)));
    },
  );
}
