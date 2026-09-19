import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  className?: string;
  showTopBorder?: boolean;
};

export function LegalFooter({ className, showTopBorder = true }: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${showTopBorder ? "" : ` ${styles.noTopBorder}`}${className ? ` ${className}` : ""}`}
      aria-label="юридическая информация"
    >
      <span class={styles.badge18}>18+</span>
      <a class={styles.link} href="/rules" draggable={false}>
        правила
      </a>
      <a class={styles.link} href="/privacy" draggable={false}>
        конфиденциальность
      </a>
      <a class={styles.link} href="/support" draggable={false}>
        поддержка
      </a>
    </footer>
  );
}
