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
const ALLOWED_ATTR = ["src", "alt", "colspan", "rowspan", "class", "data-tex"];
const MEDIA_SRC = /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;

const md = new MarkdownIt("commonmark", { html: false }).enable(["table", "strikethrough"]);

let hooked = false;
function purifier() {
  if (!DOMPurify.isSupported) return null;
  if (!hooked) {
    hooked = true;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      // class/data-tex only survive on our own math elements (see docs/DECISIONS.md #35).
      const cls = node.getAttribute("class");
      const isMath =
        (node.nodeName === "SPAN" && cls === "math-inline") || (node.nodeName === "DIV" && cls === "math-block");
      if (!isMath) {
        node.removeAttribute("class");
        node.removeAttribute("data-tex");
      }
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

// --- Math: mirror of backend `extract_math` / `restore_math` (sanitize.py) ---------------
const OPEN = "\ue000";
const CLOSE = "\ue001";
const MAX_TEX = 5000;
const TOKEN_RE = new RegExp(`${OPEN}([0-9]+)${CLOSE}`, "g");
const BLOCK_P_RE = new RegExp(`<p>[ \\t\\r\\n]*(${OPEN}[0-9]+${CLOSE})[ \\t\\r\\n]*</p>`, "g");

type Math = { tex: string; block: boolean };

function findClose(s: string, from: number, delim: string, inline: boolean): number {
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (inline && c === "\n" && s[i + 1] === "\n") return -1;
    if (s.startsWith(delim, i)) {
      if (!inline) return i;
      if (!/\s/.test(s[i - 1]) && !/\d/.test(s[i + 1] ?? "")) return i;
    }
  }
  return -1;
}

function extractMath(src: string): { text: string; found: Math[] } {
  const s = src.split(OPEN).join("").split(CLOSE).join("");
  const found: Math[] = [];
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      out += s[i + 1] === "$" ? "&#36;" : s.slice(i, i + 2);
      i += 2;
    } else if (c === "$") {
      const block = s.startsWith("$$", i);
      const start = i + (block ? 2 : 1);
      let end = -1;
      if (block || (start < s.length && !/\s/.test(s[start]))) end = findClose(s, start, block ? "$$" : "$", !block);
      const tex = end === -1 ? "" : s.slice(start, end).trim();
      if (end !== -1 && tex && tex.length <= MAX_TEX) {
        found.push({ tex, block });
        out += `${OPEN}${found.length - 1}${CLOSE}`;
        i = end + (block ? 2 : 1);
      } else {
        out += block ? "$$" : "$";
        i = start;
      }
    } else {
      out += c;
      i++;
    }
  }
  return { text: out, found };
}

const escapeAttr = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function restoreMath(html: string, found: Math[]): string {
  if (!found.length) return html;
  const render = (n: number) => {
    const { tex, block } = found[n];
    return block
      ? `<div class="math-block" data-tex="${escapeAttr(tex)}"></div>`
      : `<span class="math-inline" data-tex="${escapeAttr(tex)}"></span>`;
  };
  return html
    .replace(BLOCK_P_RE, (all, tok: string) => {
      const n = Number(tok.slice(1, -1));
      return found[n].block ? render(n) : all;
    })
    .replace(TOKEN_RE, (_all, n: string) => render(Number(n)));
}

export function renderPreview(format: BodyFormat, src: string): string {
  if (!src.trim()) return "";
  const { text, found } = extractMath(src);
  return restoreMath(sanitizeHtml(format === "html" ? text : md.render(text)), found);
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
