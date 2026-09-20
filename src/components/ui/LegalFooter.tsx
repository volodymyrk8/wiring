import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  className?: string;
  showTopBorder?: boolean;
  onSupportClick?: () => void;
};

export function LegalFooter({ className, showTopBorder = true, onSupportClick }: LegalFooterProps = {}) {
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
      <a
        class={styles.link}
        href="/support"
        data-nav="support"
        draggable={false}
        onClick={onSupportClick ? (e) => { e.preventDefault(); onSupportClick(); } : undefined}
      >
        поддержка
      </a>
    </footer>
  );
}
