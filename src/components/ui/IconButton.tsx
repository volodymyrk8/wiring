import type { JSX } from "preact";
import styles from "./IconButton.module.css";

/** Shared circular control for header actions. */
export function IconButton({ class: className, type = "button", ...props }: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type={type} class={`${styles.button}${className ? ` ${className}` : ""}`} />;
}
