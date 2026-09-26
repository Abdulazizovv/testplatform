"""
Rich-text pipeline: markdown -> HTML (markdown-it-py, raw HTML disabled) -> nh3 allow-list.

Everything stored in *_html fields goes through `render_rich`, so what the frontend
renders is always sanitized server-side. The `html` format skips markdown but goes
through the same nh3 pass.
"""

import html as html_lib
import re

import nh3
from django.conf import settings
from markdown_it import MarkdownIt

ALLOWED_TAGS = {
    "p", "b", "strong", "i", "em", "u", "s", "sub", "sup", "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td", "code", "pre", "blockquote",
    "br", "img", "span", "h1", "h2", "h3", "h4", "hr",
}  # fmt: skip

ALLOWED_ATTRIBUTES = {
    "img": {"src", "alt"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
}

# Our own uploads only: MEDIA_URL + uploads/<name>. No "..", no scheme, no host.
_MEDIA_PREFIX = re.escape(settings.MEDIA_URL.strip("/"))
_MEDIA_PATH_RE = re.compile(r"^/" + _MEDIA_PREFIX + r"/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$")

_md = MarkdownIt("commonmark", {"html": False}).enable(["table", "strikethrough"])


def _attribute_filter(tag, attr, value):
    if tag == "img" and attr == "src":
        if ".." in value or not _MEDIA_PATH_RE.match(value):
            return None  # attribute dropped -> harmless <img>
    return value


def sanitize_html(html: str) -> str:
    cleaned = nh3.clean(
        html or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=set(),  # no absolute URLs at all; img src is checked by the filter
        attribute_filter=_attribute_filter,
        link_rel=None,
        strip_comments=True,
    )
    # An <img> whose src was dropped is useless noise.
    return re.sub(r"<img(?![^>]*\bsrc=)[^>]*>", "", cleaned)


# --- Math (KaTeX on the client) -------------------------------------------------------
# `$...$` inline and `$$...$$` block. Math is cut out BEFORE markdown/nh3 (so `_ * \ { } ^ | < >`
# inside formulas are never touched) and put back AFTER sanitizing as
# <span class="math-inline" data-tex="..."> / <div class="math-block" data-tex="...">,
# where data-tex is HTML-escaped LaTeX source. The nh3 allow-list itself does not allow
# `class`/`data-*`, so user-written look-alike markup is stripped.
_OPEN, _CLOSE = "\ue000", "\ue001"  # private-use markers, stripped from input first
_MAX_TEX = 5000
_TOKEN_RE = re.compile(_OPEN + r"(\d+)" + _CLOSE)
_BLOCK_P_RE = re.compile(r"<p>\s*(" + _OPEN + r"\d+" + _CLOSE + r")\s*</p>")


def _find_close(s: str, i: int, delim: str, inline: bool):
    """Index of the closing delimiter starting the search at i, or -1."""
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            i += 2
            continue
        if inline and c == "\n" and s.startswith("\n", i + 1):
            return -1  # inline math never spans a blank line
        if s.startswith(delim, i):
            if not inline:
                return i
            after = s[i + 1] if i + 1 < n else ""
            if not s[i - 1].isspace() and not after.isdigit():
                return i
        i += 1
    return -1


def extract_math(src: str):
    """Replace math with markers. Returns (text, [(tex, is_block), ...])."""
    s = src.replace(_OPEN, "").replace(_CLOSE, "")
    out, found, i, n = [], [], 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\" and s.startswith("$", i + 1):
            out.append("&#36;")  # escaped dollar -> literal $
            i += 2
        elif c == "\\":
            out.append(s[i:i + 2])
            i += 2
        elif c == "$":
            block = s.startswith("$$", i)
            start = i + (2 if block else 1)
            end = -1
            if block or (start < n and not s[start].isspace()):
                end = _find_close(s, start, "$$" if block else "$", not block)
            tex = s[start:end].strip() if end != -1 else ""
            if end != -1 and tex and len(tex) <= _MAX_TEX:
                found.append((tex, block))
                out.append(f"{_OPEN}{len(found) - 1}{_CLOSE}")
                i = end + (2 if block else 1)
            else:
                out.append("$$" if block else "$")
                i = start
        else:
            out.append(c)
            i += 1
    return "".join(out), found


def restore_math(html: str, found) -> str:
    if not found:
        return html

    def render(m):
        tex, block = found[int(m.group(1))]
        attr = html_lib.escape(tex, quote=True)
        if block:
            return f'<div class="math-block" data-tex="{attr}"></div>'
        return f'<span class="math-inline" data-tex="{attr}"></span>'

    def unwrap(m):
        token = _TOKEN_RE.fullmatch(m.group(1))
        return render(token) if found[int(token.group(1))][1] else m.group(0)

    html = _BLOCK_P_RE.sub(unwrap, html)
    return _TOKEN_RE.sub(render, html)


def render_markdown(src: str) -> str:
    text, found = extract_math(src or "")
    return restore_math(sanitize_html(_md.render(text)), found)


def render_rich(fmt: str, src: str) -> str:
    """fmt is 'md' or 'html'. Returns sanitized HTML."""
    if not src:
        return ""
    if fmt == "html":
        text, found = extract_math(src)
        return restore_math(sanitize_html(text), found)
    return render_markdown(src)


MEDIA_NAME_RE = re.compile(r"/" + _MEDIA_PREFIX + r"/([A-Za-z0-9_-]+/[A-Za-z0-9_.-]+)")


def media_names_in(text: str) -> set:
    """File names ('uploads/<uuid>.png') of our media referenced inside rich text."""
    return set(MEDIA_NAME_RE.findall(text or ""))
