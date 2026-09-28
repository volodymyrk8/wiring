"""On-demand voice transcription. Uses the OpenAI audio API when OPENAI_API_KEY is set."""

from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_AUDIO_SECONDS = 90

_MIME_EXT = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/aac": ".aac",
}


class SpeechError(Exception):
    pass


def audio_kind(data: bytes, content_type: str) -> tuple[str, str] | None:
    """Return (extension, mime) for a short voice note, or None if it is not audio."""
    if not data or len(data) < 16 or len(data) > MAX_AUDIO_BYTES:
        return None
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        return ".webm", "audio/webm"
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return ".wav", "audio/wav"
    if data.startswith(b"OggS"):
        return ".ogg", "audio/ogg"
    if data.startswith(b"ID3") or (data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return ".mp3", "audio/mpeg"
    if len(data) > 12 and data[4:8] == b"ftyp":
        return ".m4a", "audio/mp4"
    mime = (content_type or "").split(";", 1)[0].strip().lower()
    ext = _MIME_EXT.get(mime)
    if not ext:
        return None
    stored = "audio/webm" if mime == "video/webm" else mime
    return ext, stored


def audio_has_sound(data: bytes, ext: str) -> bool:
    """Reject header-only containers that play as silence."""
    if ext == ".wav":
        index = data.find(b"data")
        if index < 0 or index + 8 > len(data):
            return False
        size = int.from_bytes(data[index + 4 : index + 8], "little")
        return 800 <= size <= len(data) - (index + 8)
    if ext in {".m4a", ".mp4"}:
        index = data.find(b"mdat")
        if index < 4:
            return False
        size = int.from_bytes(data[index - 4 : index], "big")
        if size == 0:
            payload = len(data) - (index + 4)
        elif size == 1 and index + 12 <= len(data):
            payload = int.from_bytes(data[index + 4 : index + 12], "big") - 16
        else:
            payload = size - 8
        return payload >= 800
    return len(data) >= 800


def transcribe_audio(data: bytes, filename: str, mime: str) -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise SpeechError("расшифровка не настроена")
    if not data:
        raise SpeechError("пустое голосовое")
    model = (os.environ.get("OPENAI_TRANSCRIBE_MODEL") or "whisper-1").strip()
    boundary = "----wiring" + secrets.token_hex(12)
    body = b"".join(
        (
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="model"\r\n\r\n'
                f"{model}\r\n"
            ).encode(),
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="response_format"\r\n\r\n'
                "json\r\n"
            ).encode(),
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {mime}\r\n\r\n"
            ).encode()
            + data
            + b"\r\n",
            f"--{boundary}--\r\n".encode(),
        )
    )
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise SpeechError("не удалось расшифровать") from exc
    text = str(payload.get("text") or "").strip()
    if not text:
        raise SpeechError("в записи не слышно слов")
    return text[:2000]
