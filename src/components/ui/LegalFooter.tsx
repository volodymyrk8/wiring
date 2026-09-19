import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  showAgeLimit?: boolean;
  openInNewTab?: boolean;
  className?: string;
};

export function LegalFooter({
  showAgeLimit = true,
  openInNewTab = true,
  className,
}: LegalFooterProps) {
  const targetProps = openInNewTab
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <footer class={`${styles.footer}${className ? ` ${className}` : ""}`} aria-label="юридическая информация">
      {showAgeLimit && <span class={styles.badge18}>18+</span>}
      <a class={styles.link} href="/rules" {...targetProps}>
        правила
      </a>
      <a class={styles.link} href="/privacy" {...targetProps}>
        конфиденциальность
      </a>
      <a class={styles.link} href="/support" {...targetProps}>
        поддержка
      </a>
    </footer>
  );
}
