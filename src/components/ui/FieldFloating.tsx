import type { JSX } from "preact";
import styles from "./FieldFloating.module.css";

type FieldFloatingProps = {
  label: string;
  name: string;
  id?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: string;
  autoCapitalize?: string;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  value?: string;
  defaultValue?: string;
  error?: string | boolean;
  hint?: string;
  onInput?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onChange?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onFocus?: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
};

export function FieldFloating({
  label,
  name,
  id,
  type = "text",
  required,
  minLength,
  maxLength,
  autoComplete,
  inputMode,
  autoCapitalize,
  enterKeyHint,
  value,
  defaultValue,
  error,
  hint,
  onInput,
  onChange,
  onFocus,
  onBlur,
}: FieldFloatingProps) {
  const inputId = id || `field-${name}`;
  const hasError = Boolean(error);
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div class={`${styles.wrap}${hasError ? ` ${styles.hasError}` : ""}`}>
      <label class={styles.field} htmlFor={inputId}>
        <input
          id={inputId}
          name={name}
          type={type}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autocomplete={autoComplete}
          inputMode={inputMode as JSX.HTMLAttributes<HTMLInputElement>["inputMode"]}
          autocapitalize={autoCapitalize}
          enterKeyHint={enterKeyHint}
          placeholder=" "
          value={value}
          defaultValue={defaultValue}
          class={styles.input}
          aria-invalid={hasError}
          aria-describedby={
            hasError && typeof error === "string"
              ? errorId
              : hint
              ? hintId
              : undefined
          }
          onInput={onInput}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <span class={styles.label}>{label}</span>
      </label>
      {typeof error === "string" && error ? (
        <span id={errorId} class={styles.errorText} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} class={styles.hintText}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
