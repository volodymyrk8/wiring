import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  showGlossary?: boolean;
  className?: string;
};

export function LegalFooter({
  showGlossary = false,
  className,
}: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${className ? ` ${className}` : ""}`}
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
      {showGlossary && (
        <a class={styles.link} href="/glossary" draggable={false}>
          глоссарий
        </a>
      )}
    </footer>
  );
}
