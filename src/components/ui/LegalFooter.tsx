import { COMMUNITY_CHAT_URL } from "@/lib/community-links";
import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  className?: string;
  showTopBorder?: boolean;
  onSupportClick?: () => void;
  showCommunityLinks?: boolean;
};

const telegramIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.7 3.4 18.5 20c-.2 1.2-.9 1.5-1.9.9l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L17.7 7c.4-.3-.1-.5-.6-.2l-11 7-4.7-1.5c-1-.3-1-1 .2-1.5L20 3.7c.9-.3 1.7-.2 1.7-.3Z" />
  </svg>
);

export function LegalFooter({ className, showTopBorder = true, onSupportClick, showCommunityLinks = false }: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${showTopBorder ? "" : ` ${styles.noTopBorder}`}${className ? ` ${className}` : ""}`}
      aria-label="юридическая информация"
    >
      <span class={styles.badge18}>18+</span>
      <a class={styles.link} href="/legal#documents" draggable={false}>
        документы
      </a>
      <a class={styles.link} href="/legal#safety" draggable={false}>
        безопасность
      </a>
      <span class={styles.supportLinks}>
        <a
          class={styles.link}
          href="/support"
          data-nav="support"
          draggable={false}
          onClick={onSupportClick ? (e) => { e.preventDefault(); onSupportClick(); } : undefined}
        >
          Чат Поддержка
        </a>
        {showCommunityLinks ? (
          <a
            class={`${styles.link} ${styles.channelLink}`}
            href={COMMUNITY_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            aria-label="Чат WIRING в Telegram"
            title="Чат WIRING в Telegram"
          >
            {telegramIcon}
          </a>
        ) : null}
      </span>
    </footer>
  );
}
