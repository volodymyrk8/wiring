import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import styles from "./TagPicker.module.css";

export type TagOption = {
  id: string;
  label: string;
  hint?: string;
  vibe?: boolean;
  shared?: boolean;
};

export type TagPickerProps = {
  options: TagOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: ComponentChildren;
  tone?: "default" | "vibe";
  id?: string;
};

const PAD = 12;

function placeTip(tag: HTMLElement) {
  const tip = tag.querySelector<HTMLElement>("[data-tip]");
  if (!tip) return;
  tip.style.display = "block";
  const max = Math.min(280, window.innerWidth - PAD * 2);
  tip.style.maxWidth = `${max}px`;
  tip.style.transform = "none";
  const width = tip.offsetWidth;
  const tagRect = tag.getBoundingClientRect();
  const centered = (tagRect.width - width) / 2;
  const minLeft = PAD - tagRect.left;
  const maxLeft = window.innerWidth - PAD - width - tagRect.left;
  tip.style.left = `${Math.round(Math.min(Math.max(centered, minLeft), maxLeft))}px`;
  tip.style.display = "";
}

function closeTips(root: HTMLElement | null) {
  root?.querySelectorAll<HTMLElement>("[data-open]").forEach((tag) => tag.removeAttribute("data-open"));
}

function Hint({ hint }: { hint: string }) {
  const open = (event: JSX.TargetedMouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const tag = event.currentTarget.parentElement;
    if (!tag) return;
    const next = tag.getAttribute("data-open") === "true" ? "false" : "true";
    const root = tag.parentElement;
    closeTips(root);
    if (next === "true") {
      tag.setAttribute("data-open", "true");
      placeTip(tag);
    }
  };
  return (
    <>
      <span
        class={styles.question}
        aria-hidden="true"
        onClick={open}
        onPointerDown={(event) => event.stopPropagation()}
      >
        ?
      </span>
      <span class={styles.tip} data-tip role="tooltip">{hint}</span>
    </>
  );
}

function chipClass(option: TagOption, extra = "") {
  return `${styles.tag}${option.vibe ? ` ${styles.vibe}` : ""}${option.shared ? ` ${styles.shared}` : ""}${extra}`;
}

export function TagHints({ tags }: { tags: TagOption[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const root = rootRef.current;
      if (!root || (event.target instanceof Node && root.contains(event.target))) return;
      closeTips(root);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return (
    <div class={styles.tags} ref={rootRef}>
      {tags.map((tag) => (
        <span
          key={`${tag.vibe ? "vibe" : "neuro"}-${tag.id}`}
          class={`${chipClass(tag)} ${styles.display}`}
          tabIndex={tag.hint ? 0 : undefined}
          onPointerEnter={(event) => placeTip(event.currentTarget)}
          onFocus={(event) => placeTip(event.currentTarget)}
        >
          {tag.label}
          {tag.hint ? <Hint hint={tag.hint} /> : null}
        </span>
      ))}
    </div>
  );
}

export function TagPicker({ options, selected, onChange, label, tone = "default", id }: TagPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const root = rootRef.current;
      if (!root || (event.target instanceof Node && root.contains(event.target))) return;
      closeTips(root);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const toggle = (option: TagOption) => {
    const next = selected.includes(option.id)
      ? selected.filter((value) => value !== option.id)
      : [...selected, option.id];
    onChange(next);
  };

  return (
    <div class={styles.wrap} id={id}>
      {label && <p class={styles.label}>{label}</p>}
      <div class={styles.tags} ref={rootRef} role="group" aria-label={typeof label === "string" ? label : undefined}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          const marked = tone === "vibe" ? { ...option, vibe: true } : option;
          return (
            <button
              key={option.id}
              type="button"
              class={`${chipClass(marked)}${active ? ` ${styles.active}` : ""}`}
              aria-pressed={active}
              onClick={() => toggle(option)}
              onPointerEnter={(event) => placeTip(event.currentTarget)}
              onFocus={(event) => placeTip(event.currentTarget)}
            >
              {option.label}
              {option.hint ? <Hint hint={option.hint} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
