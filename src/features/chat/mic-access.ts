import { tr } from "@/lib/i18n";
const MIC_GRANTED_KEY = "wiring-mic-granted";
const MIC_LOST_KEY = "wiring-mic-lost";
const MIC_TOAST_AT_KEY = "wiring-mic-toast-at";

export type MicRequestResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

export async function requestMicStream(): Promise<MicRequestResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "denied") {
      return { ok: false, reason: "denied" };
    }
  } catch {
    /* Permissions API missing or limited (common on iOS). */
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      localStorage.setItem(MIC_GRANTED_KEY, "1");
      localStorage.removeItem(MIC_LOST_KEY);
    } catch {
      /* private mode */
    }
    return { ok: true, stream };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      try {
        if (localStorage.getItem(MIC_GRANTED_KEY) === "1") {
          localStorage.setItem(MIC_LOST_KEY, "1");
        }
      } catch {
        /* ignore */
      }
      return { ok: false, reason: "denied" };
    }
    return { ok: false, reason: "failed" };
  }
}

export function micToastMessage(reason: "denied" | "failed" | "unsupported"): string {
  if (reason === "unsupported") return tr("этот браузер не записывает голосовые");
  if (reason === "failed") return tr("не получилось включить микрофон");
  try {
    if (localStorage.getItem(MIC_LOST_KEY) === "1" || localStorage.getItem(MIC_GRANTED_KEY) === "1") {
      return tr("Safari сбросил доступ к микрофону. Включи его для сайта: aA → «Настройки для сайта» → Микрофон.");
    }
  } catch {
    /* ignore */
  }
  return tr("разреши микрофон, чтобы записать голосовое");
}

/** Avoid the same mic toast on every tap after reopening the PWA. */
export function shouldShowMicToast(): boolean {
  try {
    const last = parseInt(sessionStorage.getItem(MIC_TOAST_AT_KEY) || "0", 10);
    const now = Date.now();
    if (now - last < 45_000) return false;
    sessionStorage.setItem(MIC_TOAST_AT_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}
