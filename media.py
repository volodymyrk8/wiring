"""Image processing and upload paths for WIRING."""

from __future__ import annotations

import io
import os
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 40_000_000

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1600
MIN_EDGE = 160
THUMB_EDGE = 192
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class MediaError(ValueError):
    pass


def process_image(raw: bytes) -> bytes:
    if len(raw) > MAX_UPLOAD_BYTES:
        raise MediaError("файл больше 8 МБ — сожми или выбери другое фото")
    if len(raw) < 32:
        raise MediaError("это не похоже на фото")
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise MediaError("нужен jpg, png или webp") from exc
    image = ImageOps.exif_transpose(image)
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    else:
        image = image.convert("RGB")
    width, height = image.size
    if min(width, height) < MIN_EDGE:
        raise MediaError("фото слишком маленькое")
    image.thumbnail((MAX_EDGE, MAX_EDGE))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=86, optimize=True, progressive=True)
    return out.getvalue()


def make_thumb(raw: bytes, edge: int = THUMB_EDGE) -> bytes:
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise MediaError("нужен jpg, png или webp") from exc
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.thumbnail((edge, edge))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=72, optimize=True)
    return out.getvalue()


def read_upload(file_storage) -> bytes:
    if file_storage is None:
        raise MediaError("выбери файл")
    name = (file_storage.filename or "").lower()
    ext = os.path.splitext(name)[1]
    if ext and ext not in ALLOWED_EXT:
        raise MediaError("нужен jpg, png или webp")
    raw = file_storage.read(MAX_UPLOAD_BYTES + 1)
    if isinstance(file_storage.stream, BinaryIO) or hasattr(file_storage, "seek"):
        try:
            file_storage.stream.seek(0)
        except Exception:
            pass
    return process_image(raw)
