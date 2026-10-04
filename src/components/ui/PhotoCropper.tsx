import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { Button } from "./Button";
import { Modal } from "./Modal";
import styles from "./PhotoCropper.module.css";

const RATIO = 3 / 4;
const OUT_W = 1200;
const OUT_H = 1600;
const MAX_ZOOM = 3;

type Source = {
  image: CanvasImageSource;
  width: number;
  height: number;
  url: string;
};

type View = { zoom: number; x: number; y: number };

type PhotoCropperProps = {
  file: File;
  title?: string;
  busy?: boolean;
  error?: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

async function openSource(file: File): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width >= 2 && bitmap.height >= 2) {
        return { image: bitmap, width: bitmap.width, height: bitmap.height, url: "" };
      }
      bitmap.close();
    } catch {
      /* fall through to an image element */
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth < 2 || image.naturalHeight < 2) {
    URL.revokeObjectURL(url);
    throw new Error("empty");
  }
  return { image, width: image.naturalWidth, height: image.naturalHeight, url };
}

function release(source: Source | null) {
  if (!source) return;
  if (source.url) URL.revokeObjectURL(source.url);
  if (source.image instanceof ImageBitmap) source.image.close();
}

export function PhotoCropper({ file, title = "Кадр", busy = false, error = "", onConfirm, onCancel }: PhotoCropperProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<Source | null>(null);
  const viewRef = useRef<View>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, ox: 0, oy: 0, zoom: 1, dist: 0 });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const box = () => {
    const node = stageRef.current;
    return { w: node?.clientWidth || 0, h: node?.clientHeight || 0 };
  };

  const place = (nextZoom: number, x: number, y: number) => {
    const source = sourceRef.current;
    const frame = box();
    const zoomValue = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    if (!source || frame.w < 2 || frame.h < 2) {
      viewRef.current = { zoom: zoomValue, x, y };
      setZoom(zoomValue);
      setOffset({ x, y });
      return;
    }
    const scale = Math.max(frame.w / source.width, frame.h / source.height) * zoomValue;
    const minX = Math.min(0, frame.w - source.width * scale);
    const minY = Math.min(0, frame.h - source.height * scale);
    const next = {
      zoom: zoomValue,
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
    viewRef.current = next;
    setZoom(next.zoom);
    setOffset({ x: next.x, y: next.y });
  };

  const zoomTo = (nextZoom: number, origin = viewRef.current) => {
    const source = sourceRef.current;
    const frame = box();
    const zoomValue = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    if (!source || frame.w < 2) {
      place(zoomValue, origin.x, origin.y);
      return;
    }
    const base = Math.max(frame.w / source.width, frame.h / source.height);
    const cx = frame.w / 2;
    const cy = frame.h / 2;
    const ix = (cx - origin.x) / (base * origin.zoom);
    const iy = (cy - origin.y) / (base * origin.zoom);
    const next = base * zoomValue;
    place(zoomValue, cx - ix * next, cy - iy * next);
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    viewRef.current = { zoom: 1, x: 0, y: 0 };
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    openSource(file).then((source) => {
      if (cancelled) {
        release(source);
        return;
      }
      release(sourceRef.current);
      sourceRef.current = source;
      setReady(true);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      release(sourceRef.current);
      sourceRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    if (!ready) return;
    let fitted = false;
    const sync = () => {
      const source = sourceRef.current;
      const frame = box();
      if (!source || frame.w < 2 || frame.h < 2) return;
      if (!fitted) {
        fitted = true;
        const base = Math.max(frame.w / source.width, frame.h / source.height);
        place(1, (frame.w - source.width * base) / 2, (frame.h - source.height * base) / 2);
        return;
      }
      const view = viewRef.current;
      place(view.zoom, view.x, view.y);
    };
    sync();
    const node = stageRef.current;
    const observer = new ResizeObserver(sync);
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [ready, file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    const stage = stageRef.current;
    if (!canvas || !source || !stage || !ready) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width < 2 || height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const scale = Math.max(width / source.width, height / source.height) * zoom;
    ctx.drawImage(source.image, offset.x, offset.y, source.width * scale, source.height * scale);
  }, [ready, zoom, offset, file]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(viewRef.current.zoom + (event.deltaY > 0 ? -0.08 : 0.08));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [ready]);

  const pinchDistance = () => {
    const points = [...pointers.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };

  const onPointerDown = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const view = viewRef.current;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      ox: view.x,
      oy: view.y,
      zoom: view.zoom,
      dist: pinchDistance(),
    };
  };

  const onPointerMove = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const dist = pinchDistance();
      const start = gesture.current.dist || dist;
      if (start > 0) {
        zoomTo(gesture.current.zoom * (dist / start), {
          zoom: gesture.current.zoom,
          x: gesture.current.ox,
          y: gesture.current.oy,
        });
      }
      return;
    }
    place(
      viewRef.current.zoom,
      gesture.current.ox + event.clientX - gesture.current.x,
      gesture.current.oy + event.clientY - gesture.current.y,
    );
  };

  const onPointerUp = (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const view = viewRef.current;
    gesture.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y, zoom: view.zoom, dist: pinchDistance() };
  };

  const onStageKey = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 28 : 10;
    if (event.key === "ArrowLeft") { event.preventDefault(); place(viewRef.current.zoom, viewRef.current.x + step, viewRef.current.y); }
    else if (event.key === "ArrowRight") { event.preventDefault(); place(viewRef.current.zoom, viewRef.current.x - step, viewRef.current.y); }
    else if (event.key === "ArrowUp") { event.preventDefault(); place(viewRef.current.zoom, viewRef.current.x, viewRef.current.y + step); }
    else if (event.key === "ArrowDown") { event.preventDefault(); place(viewRef.current.zoom, viewRef.current.x, viewRef.current.y - step); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomTo(viewRef.current.zoom + 0.1); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomTo(viewRef.current.zoom - 0.1); }
  };

  const confirm = () => {
    const source = sourceRef.current;
    const frame = box();
    const view = viewRef.current;
    if (!source || frame.w < 2 || frame.h < 2 || busy) return;
    const scale = Math.max(frame.w / source.width, frame.h / source.height) * view.zoom;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, -view.x / scale, -view.y / scale, frame.w / scale, frame.h / scale, 0, 0, OUT_W, OUT_H);
    canvas.toBlob((blob) => {
      if (!blob) {
        setFailed(true);
        return;
      }
      onConfirm(new File([blob], "photo.jpg", { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", 0.86);
  };

  const keepEnterInside = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={title}
      closeOnBackdrop={!busy}
      closeOnEsc={!busy}
      ariaLabel={title}
      footer={failed ? (
        <Button type="button" variant="ghost" onClick={onCancel}>Закрыть</Button>
      ) : (
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Отмена</Button>
          <Button type="button" disabled={!ready || busy} loading={busy} onClick={confirm}>Готово</Button>
        </>
      )}
    >
      <div onKeyDown={keepEnterInside}>
        <p class={styles.hint}>Двигай и увеличивай. В анкете все фото одного кадра, 3:4.</p>
        {failed ? <p class={styles.error} role="alert">Это фото не открывается. Выбери jpg или png.</p> : (
          <>
            <div
              ref={stageRef}
              class={styles.stage}
              style={{ aspectRatio: `${RATIO}` }}
              tabIndex={0}
              role="application"
              aria-label="Кадр фото. Стрелки двигают, плюс и минус приближают."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onStageKey}
            >
              <canvas ref={canvasRef} />
              {!ready ? <span class={styles.loading}>Открываем фото…</span> : null}
            </div>
            <label class={styles.zoom}>
              Масштаб
              <input
                type="range"
                min="1"
                max={String(MAX_ZOOM)}
                step="0.01"
                value={String(zoom)}
                disabled={!ready || busy}
                onInput={(event) => zoomTo(Number(event.currentTarget.value))}
              />
            </label>
          </>
        )}
        {error ? <p class={styles.error} role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}
