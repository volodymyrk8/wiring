import type { ComponentChildren } from "preact";
import styles from "./Switch.module.css";

export type SwitchProps = {
  checked?: boolean;
  disabled?: boolean;
  loading?: boolean;
  name?: string;
  onChange?: (checked: boolean) => void;
  children: ComponentChildren;
};

export function Switch({
  checked = false,
  disabled = false,
  loading = false,
  name,
  onChange,
  children,
}: SwitchProps) {
  const unavailable = disabled || loading;

  return (
    <button
      type="button"
      class={styles.switch}
      role="switch"
      aria-checked={checked}
      aria-busy={loading}
      disabled={unavailable}
      name={name}
      onClick={() => onChange?.(!checked)}
    >
      <span class={styles.track} aria-hidden="true">
        <span class={styles.thumb} />
      </span>
      <span class={styles.text}>{children}</span>
    </button>
  );
}
