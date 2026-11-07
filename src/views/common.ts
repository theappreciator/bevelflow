import { SessionExpiredError } from "../api";
import { h } from "../dom";

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Shows a session-expired banner with a reload button; returns true if it handled the error. */
export function handleSessionExpired(err: unknown): boolean {
  if (!(err instanceof SessionExpiredError)) return false;
  if (!document.querySelector(".session-banner")) {
    document.body.prepend(
      h(
        "div",
        { class: "session-banner", role: "alert" },
        err.message,
        " ",
        h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Reload"),
      ),
    );
  }
  return true;
}

/** Full-screen photo viewer; tap anywhere or press Escape to close. */
export function showPhoto(src: string): void {
  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  const overlay = h(
    "div",
    { class: "lightbox", role: "dialog", "aria-label": "Photo", onclick: close },
    h("img", { src, alt: "" }),
  );
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
}
