import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  showGlossary?: boolean;
  testHref?: string;
  className?: string;
};

export function LegalFooter({
  showGlossary = false,
  testHref = "https://neuro-raznoobrazie.web.app/",
  className,
}: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${className ? ` ${className}` : ""}`}
      aria-label="юридическая информация"
    >
      <span class={styles.badge18}>18+</span>
      <a class={styles.link} href="/rules">
        правила
      </a>
      <a class={styles.link} href="/privacy">
        конфиденциальность
      </a>
      <a class={styles.link} href="/support">
        поддержка
      </a>
      {showGlossary && (
        <a class={styles.link} href="/glossary">
          глоссарий
        </a>
      )}
      {showGlossary && testHref && (
        <a
          class={styles.link}
          href={testHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          тест
        </a>
      )}
    </footer>
  );
}
