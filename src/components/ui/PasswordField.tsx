import { useState } from "preact/hooks";
import type { JSX } from "preact";
import styles from "./PasswordField.module.css";

type PasswordFieldProps = {
  name?: string;
  id?: string;
  autoComplete?: string;
  required?: boolean;
  label?: string;
  showStrength?: boolean;
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  error?: string | boolean;
  value?: string;
  onInput?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onChange?: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
};

function calculateStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; tone: "none" | "weak" | "medium" | "strong" } {
  if (!pwd) return { score: 0, label: "", tone: "none" };
  if (pwd.length < 6) return { score: 1, label: "минимум 6 символов", tone: "weak" };
  
  const hasMixed = /[A-Za-zА-Яа-я]/.test(pwd) && /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
  if (pwd.length >= 10 || (pwd.length >= 8 && hasMixed)) {
    return { score: 3, label: "отличный пароль", tone: "strong" };
  }
  return { score: 2, label: "хороший пароль", tone: "medium" };
}

export function PasswordField({
  name = "password",
  id,
  autoComplete = "current-password",
  required = true,
  label = "Пароль",
  showStrength = false,
  enterKeyHint,
  error,
  value,
  onInput,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [localVal, setLocalVal] = useState(value || "");
  const [isFocused, setIsFocused] = useState(false);

  const inputId = id || `field-${name}`;
  const hasError = Boolean(error);
  const currentVal = value !== undefined ? value : localVal;
  const strength = calculateStrength(currentVal);
  const shouldShowStrength = showStrength && (isFocused || currentVal.length > 0);

  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    setLocalVal((e.currentTarget as HTMLInputElement).value);
    onInput?.(e);
  };

  return (
    <div class={`${styles.wrap}${hasError ? ` ${styles.hasError}` : ""}`}>
      <label class={styles.field} htmlFor={inputId}>
        <div class={styles.inputWrap}>
          <input
            id={inputId}
            name={name}
            type={visible ? "text" : "password"}
            required={required}
            minLength={6}
            autocomplete={autoComplete}
            enterKeyHint={enterKeyHint}
            placeholder=" "
            value={value}
            class={styles.input}
            aria-invalid={hasError}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onInput={handleInput}
            onChange={onChange}
          />
          <span class={styles.label}>{label}</span>
          <button
            type="button"
            class={`${styles.toggleBtn}${visible ? ` ${styles.active}` : ""}`}
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
        </div>
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
        <span class={styles.errorText} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
