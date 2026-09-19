import type { ComponentChildren } from "preact";
import styles from "./Checkbox.module.css";

type CheckboxProps = {
  name: string;
  checked?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  children: ComponentChildren;
  error?: boolean;
};

export function Checkbox({
  name,
  checked,
  required,
  disabled,
  onChange,
  children,
  error,
}: CheckboxProps) {
  return (
    <label class={`${styles.label}${error ? ` ${styles.hasError}` : ""}${disabled ? ` ${styles.disabled}` : ""}`}>
      <span class={styles.boxWrap}>
        <input
          type="checkbox"
          name={name}
          checked={checked}
          required={required}
          disabled={disabled}
          class={styles.nativeInput}
          onChange={(e) => onChange?.((e.currentTarget as HTMLInputElement).checked)}
        />
        <span class={styles.customBox} aria-hidden="true">
          <svg class={styles.checkIcon} viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5L6.5 11.5L12.5 4.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
      <span class={styles.text}>{children}</span>
    </label>
  );
}
