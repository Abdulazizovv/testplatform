// Client-side rich-text preview. Mirrors the server pipeline (docs/DECISIONS.md #17):
// markdown-it with raw HTML disabled, then an allow-list identical to nh3's. The server
// stays the source of truth (it re-sanitizes on save); this only gives a faithful preview
// and an extra layer before anything reaches innerHTML.
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type { BodyFormat } from "./types";

const ALLOWED_TAGS = [
  "p", "b", "strong", "i", "em", "u", "s", "sub", "sup", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td", "code", "pre", "blockquote",
  "br", "img", "span", "h1", "h2", "h3", "h4", "hr",
];
const ALLOWED_ATTR = ["src", "alt", "colspan", "rowspan"];
const MEDIA_SRC = /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;

const md = new MarkdownIt("commonmark", { html: false }).enable(["table", "strikethrough"]);

let hooked = false;
function purifier() {
  if (!DOMPurify.isSupported) return null;
  if (!hooked) {
    hooked = true;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName === "IMG") {
        const src = node.getAttribute("src") ?? "";
        if (!MEDIA_SRC.test(src)) node.remove();
      }
    });
  }
  return DOMPurify;
}

export function sanitizeHtml(html: string): string {
  const p = purifier();
  if (!p || !html) return "";
  return p.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^\/media\//,
  });
}

export function renderPreview(format: BodyFormat, src: string): string {
  if (!src.trim()) return "";
  return sanitizeHtml(format === "html" ? src : md.render(src));
}

/** Plain-text snippet of a source string (for list rows). */
export function snippet(src: string, max = 140): string {
  const text = src
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_#>~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
