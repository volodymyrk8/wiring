import type { ComponentChildren } from "preact";
import styles from "./TagPicker.module.css";

export type TagOption = {
  id: string;
  label: string;
  hint?: string;
};

export type TagPickerProps = {
  options: TagOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: ComponentChildren;
  tone?: "default" | "vibe";
  id?: string;
};

export function TagPicker({ options, selected, onChange, label, tone = "default", id }: TagPickerProps) {
  const toggle = (option: TagOption) => {
    const next = selected.includes(option.id)
      ? selected.filter((value) => value !== option.id)
      : [...selected, option.id];
    onChange(next);
  };

  return (
    <div class={styles.wrap} id={id}>
      {label && <p class={styles.label}>{label}</p>}
      <div class={styles.tags} role="group" aria-label={typeof label === "string" ? label : undefined}>
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              class={`${styles.tag}${tone === "vibe" ? ` ${styles.vibe}` : ""}${active ? ` ${styles.active}` : ""}`}
              aria-pressed={active}
              title={option.hint}
              onClick={() => toggle(option)}
            >
              {option.label}
              {option.hint && <span class={styles.question} aria-hidden="true">?</span>}
              {option.hint && <span class={styles.tip} role="tooltip">{option.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
