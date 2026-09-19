import type { JSX } from "preact";
import styles from "./Textarea.module.css";

export type TextareaProps = {
  label: string;
  name: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  error?: string | boolean;
  hint?: string;
  onInput?: (e: JSX.TargetedEvent<HTMLTextAreaElement, Event>) => void;
  onChange?: (e: JSX.TargetedEvent<HTMLTextAreaElement, Event>) => void;
};

export function Textarea({
  label,
  name,
  id,
  value,
  defaultValue,
  required,
  maxLength,
  rows = 4,
  error,
  hint,
  onInput,
  onChange,
}: TextareaProps) {
  const inputId = id || `field-${name}`;
  const hasError = Boolean(error);
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div class={`${styles.wrap}${hasError ? ` ${styles.hasError}` : ""}`}>
      <label class={styles.field} htmlFor={inputId}>
        <textarea
          id={inputId}
          name={name}
          rows={rows}
          required={required}
          maxLength={maxLength}
          placeholder=" "
          value={value}
          defaultValue={defaultValue}
          class={styles.input}
          aria-invalid={hasError}
          aria-describedby={
            hasError && typeof error === "string" ? errorId : hint ? hintId : undefined
          }
          onInput={onInput}
          onChange={onChange}
        />
        <span class={styles.label}>{label}</span>
      </label>
      {typeof error === "string" && error ? (
        <span id={errorId} class={styles.errorText} role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} class={styles.hintText}>{hint}</span>
      ) : null}
    </div>
  );
}
