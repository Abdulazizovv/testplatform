"""
Image upload pipeline. Nothing about the uploaded file is trusted:
type is decided by magic bytes, the image is decoded and RE-ENCODED with Pillow (drops
EXIF/ICC/metadata and any polyglot payload), size/dimensions are capped, and identical
content is stored once per branch (sha256 of the re-encoded bytes).
"""

import hashlib
import io
import uuid
import warnings

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps

from ..models import MediaAsset
from .errors import ContentError

# Decompression-bomb guard: Pillow warns above this many pixels (we turn the warning into
# an error) and raises outright above 2x.
Image.MAX_IMAGE_PIXELS = settings.MEDIA_MAX_SIDE * settings.MEDIA_MAX_SIDE

_FORMATS = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}


def sniff_format(head: bytes):
    """Decide the type from magic bytes only. Returns Pillow format name or None."""
    if head.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "WEBP"
    return None


def _reencode(raw: bytes, fmt: str):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(raw))
            if img.format != fmt:
                raise ContentError("Rasm fayli buzilgan yoki turi mos kelmaydi.")
            if max(img.size) > settings.MEDIA_MAX_SIDE:
                raise ContentError(
                    f"Rasm juda katta: eng uzun tomoni {settings.MEDIA_MAX_SIDE}px dan oshmasligi kerak."
                )
            img.load()
    except ContentError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ContentError("Rasm o'lchami juda katta.")
    except Exception:
        raise ContentError("Rasm fayli buzilgan yoki o'qib bo'lmadi.")

    img = ImageOps.exif_transpose(img)  # bake orientation in before metadata is dropped
    img.info = {}
    save_kwargs = {}
    if fmt == "JPEG":
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        save_kwargs = {"quality": 88, "optimize": True}
    elif fmt == "PNG":
        save_kwargs = {"optimize": True}
    elif fmt == "WEBP":
        save_kwargs = {"quality": 88}
    out = io.BytesIO()
    img.save(out, format=fmt, **save_kwargs)  # no exif=/icc_profile= -> metadata is gone
    return out.getvalue(), img.size


def store_upload(uploaded, *, branch, user):
    """Validate + re-encode + store. Returns (asset, created)."""
    if uploaded.size > settings.MEDIA_MAX_BYTES:
        raise ContentError("Fayl hajmi 5 MB dan oshmasligi kerak.")
    raw = uploaded.read(settings.MEDIA_MAX_BYTES + 1)
    if len(raw) > settings.MEDIA_MAX_BYTES:
        raise ContentError("Fayl hajmi 5 MB dan oshmasligi kerak.")
    fmt = sniff_format(raw[:16])
    if fmt is None:
        raise ContentError("Faqat JPEG, PNG yoki WebP rasm yuklash mumkin.")

    data, (width, height) = _reencode(raw, fmt)
    digest = hashlib.sha256(data).hexdigest()

    existing = MediaAsset.objects.filter(branch=branch, sha256=digest).first()
    if existing:
        return existing, False

    mime, ext = _FORMATS[fmt]
    asset = MediaAsset(
        branch=branch, sha256=digest, mime=mime, width=width, height=height,
        size=len(data), uploaded_by=user,
    )  # fmt: skip
    asset.file.save(f"{asset.id}.{ext}", ContentFile(data), save=False)
    try:
        asset.save()
    except Exception:
        default_storage.delete(asset.file.name)
        raise
    return asset, True


def copy_asset_to_branch(asset, target_branch, created_files: list):
    """
    Give `target_branch` its own copy of `asset` (or link to an identical one it already
    has). File names of NEW files are appended to `created_files` so the caller can
    delete them if the surrounding transaction rolls back.
    """
    if asset.branch_id == target_branch.id:
        return asset
    existing = MediaAsset.objects.filter(branch=target_branch, sha256=asset.sha256).first()
    if existing:
        return existing
    new_id = uuid.uuid4()
    ext = asset.file.name.rsplit(".", 1)[-1]
    with asset.file.open("rb") as fh:
        name = default_storage.save(f"uploads/{new_id}.{ext}", ContentFile(fh.read()))
    created_files.append(name)
    return MediaAsset.objects.create(
        id=new_id, branch=target_branch, file=name, sha256=asset.sha256, mime=asset.mime,
        width=asset.width, height=asset.height, size=asset.size, uploaded_by=None,
    )  # fmt: skip
