import { useState } from "preact/hooks";
import type { JSX } from "preact";
import styles from "./Input.module.css";

export type InputProps = {
  label: string;
  name: string;
  id?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: JSX.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCapitalize?: "none" | "off" | "on" | "sentences" | "words" | "characters";
  list?: string;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  value?: string;
  defaultValue?: string;
  error?: string | boolean;
  hint?: string;
  showStrength?: boolean;
  onInput?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onChange?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onFocus?: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
};

function calculateStrength(pwd: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
  tone: "none" | "weak" | "medium" | "strong";
} {
  if (!pwd) return { score: 0, label: "", tone: "none" };
  if (pwd.length < 6) return { score: 1, label: "минимум 6 символов", tone: "weak" };

  const hasMixed = /[A-Za-zА-Яа-я]/.test(pwd) && /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
  if (pwd.length >= 10 || (pwd.length >= 8 && hasMixed)) {
    return { score: 3, label: "отличный пароль", tone: "strong" };
  }
  return { score: 2, label: "хороший пароль", tone: "medium" };
}

export function Input({
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
  list,
  enterKeyHint,
  value,
  defaultValue,
  error,
  hint,
  showStrength = false,
  onInput,
  onChange,
  onFocus,
  onBlur,
}: InputProps) {
  const isPassword = type === "password";
  const [visible, setVisible] = useState(false);
  const [localVal, setLocalVal] = useState(value || defaultValue || "");
  const [isFocused, setIsFocused] = useState(false);

  const inputId = id || `field-${name}`;
  const hasError = Boolean(error);
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const currentVal = value !== undefined ? value : localVal;
  const strength = calculateStrength(currentVal);
  const shouldShowStrength = isPassword && showStrength && (isFocused || currentVal.length > 0);

  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    setLocalVal((e.currentTarget as HTMLInputElement).value);
    onInput?.(e);
  };

  const handleFocus = (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: JSX.TargetedFocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <div class={`${styles.wrap}${hasError ? ` ${styles.hasError}` : ""}`}>
      <label class={styles.field} htmlFor={inputId}>
        <input
          id={inputId}
          name={name}
          type={isPassword ? (visible ? "text" : "password") : type}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autocomplete={autoComplete}
          inputMode={inputMode}
          autocapitalize={autoCapitalize}
          list={list}
          enterKeyHint={enterKeyHint}
          placeholder=" "
          value={value}
          defaultValue={defaultValue}
          class={`${styles.input}${isPassword ? ` ${styles.hasAction}` : ""}`}
          aria-invalid={hasError}
          aria-describedby={
            hasError && typeof error === "string"
              ? errorId
              : hint
              ? hintId
              : undefined
          }
          onInput={handleInput}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <span class={styles.label}>{label}</span>

        {isPassword && (
          <button
            type="button"
            class={`${styles.actionBtn}${visible ? ` ${styles.active}` : ""}`}
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
            title={visible ? "Скрыть пароль" : "Показать пароль"}
            onClick={() => setVisible((v) => !v)}
            tabIndex={-1}
          >
            {visible ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.07 5.18M6.12 6.12A18.36 18.36 0 0 0 2 12s3.5 7 10 7a10.94 10.94 0 0 0 5.1-1.24" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </label>

      {shouldShowStrength && strength.score > 0 && (
        <div class={styles.strengthMeter} aria-live="polite">
          <div class={styles.bars}>
            <div
              class={`${styles.barSegment} ${
                strength.score >= 1 ? styles[strength.tone] : ""
              }`}
            />
            <div
              class={`${styles.barSegment} ${
                strength.score >= 2 ? styles[strength.tone] : ""
              }`}
            />
            <div
              class={`${styles.barSegment} ${
                strength.score >= 3 ? styles[strength.tone] : ""
              }`}
            />
          </div>
          <div class={styles.strengthFeedback}>
            <span class={`${styles.strengthText} ${styles[strength.tone]}`}>
              {strength.label}
            </span>
          </div>
        </div>
      )}

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

/** Convenience alias for password input */
export const PasswordInput = (props: Omit<InputProps, "type">) => (
  <Input type="password" {...props} />
);

/** Backward compatibility aliases */
export const FieldFloating = Input;
export const PasswordField = PasswordInput;
