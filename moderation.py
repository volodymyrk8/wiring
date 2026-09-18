"""Minimal OpenAI photo check: block explicit and minor-sexual images only."""

from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image

from media import MediaError

BLOCK = ("sexual", "sexual/minors")
MODEL = "omni-moderation-latest"
TIMEOUT = 8


def blocked_labels(result: dict) -> tuple[str, ...]:
    cats = result.get("categories") or {}
    return tuple(name for name in BLOCK if cats.get(name))


def moderate_photo(jpeg: bytes) -> None:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key or not jpeg:
        return
    try:
        result = _ask_openai(key, jpeg)
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, TypeError, json.JSONDecodeError, OSError, ValueError):
        return
    if blocked_labels(result):
        raise MediaError("это фото нельзя загрузить")


def _preview_jpeg(jpeg: bytes) -> bytes:
    image = Image.open(io.BytesIO(jpeg))
    image = image.convert("RGB")
    image.thumbnail((512, 512))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=68, optimize=True)
    return out.getvalue()


def _ask_openai(key: str, jpeg: bytes) -> dict:
    preview = _preview_jpeg(jpeg)
    payload = {
        "model": MODEL,
        "input": [
            {
                "type": "image_url",
                "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(preview).decode("ascii")},
            }
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/moderations",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["results"][0]
