"""
Rich-text pipeline: markdown -> HTML (markdown-it-py, raw HTML disabled) -> nh3 allow-list.

Everything stored in *_html fields goes through `render_rich`, so what the frontend
renders is always sanitized server-side. The `html` format skips markdown but goes
through the same nh3 pass.
"""

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


def render_markdown(src: str) -> str:
    return sanitize_html(_md.render(src or ""))


def render_rich(fmt: str, src: str) -> str:
    """fmt is 'md' or 'html'. Returns sanitized HTML."""
    if not src:
        return ""
    return sanitize_html(src) if fmt == "html" else render_markdown(src)


MEDIA_NAME_RE = re.compile(r"/" + _MEDIA_PREFIX + r"/([A-Za-z0-9_-]+/[A-Za-z0-9_.-]+)")


def media_names_in(text: str) -> set:
    """File names ('uploads/<uuid>.png') of our media referenced inside rich text."""
    return set(MEDIA_NAME_RE.findall(text or ""))
