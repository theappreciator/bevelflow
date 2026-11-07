import { logContact } from "../api";
import { h } from "../dom";
import { telHref } from "../phone";
import type { ContactEvent, ContactKind } from "../../shared/types";

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS: Record<ContactKind, string[]> = {
  email: ["M4 6h16v12H4z", "m4 7 8 6 8-6"],
  call: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"],
};

/** 24px outline icon. */
export function contactIcon(kind: ContactKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[kind]) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/**
 * The round Email / Call button used on the list and the record screen.
 * Tapping it opens Mail / the dialer and logs the tap to the record's contact history.
 * With no address/number it renders dimmed and inert.
 */
export function contactButton(
  kind: ContactKind,
  recordId: string,
  value: string,
  name: string,
  onLogged?: (event: ContactEvent) => void,
): HTMLElement {
  const target = value.trim();
  const label = `${kind === "email" ? "Email" : "Call"} ${name}`;
  if (!target) {
    return h("span", { class: `contact-btn is-${kind} is-disabled`, "aria-hidden": "true" }, contactIcon(kind));
  }
  const href = kind === "email" ? `mailto:${encodeURI(target)}` : telHref(target);
  return h(
    "a",
    {
      class: `contact-btn is-${kind}`,
      href,
      "aria-label": label,
      title: label,
      onclick: () => {
        // Don't block the link: Mail / the dialer opens right away while this records the tap.
        logContact(recordId, kind).then(
          (event) => onLogged?.(event),
          (err: unknown) => console.warn("Couldn't log contact", err),
        );
      },
    },
    contactIcon(kind),
  );
}
