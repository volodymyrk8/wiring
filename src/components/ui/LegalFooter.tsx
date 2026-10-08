import styles from "./LegalFooter.module.css";
import { COMMUNITY_CHANNEL_URL, COMMUNITY_CHAT_URL } from "@/lib/community-links";

type LegalFooterProps = {
  className?: string;
  showTopBorder?: boolean;
  onSupportClick?: () => void;
  showCommunityLinks?: boolean;
};

export function LegalFooter({ className, showTopBorder = true, onSupportClick, showCommunityLinks = false }: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${showTopBorder ? "" : ` ${styles.noTopBorder}`}${className ? ` ${className}` : ""}`}
      aria-label="юридическая информация"
    >
      <span class={styles.badge18}>18+</span>
      <a class={styles.link} href="/rules" draggable={false}>
        соглашение
      </a>
      <a class={styles.link} href="/privacy" draggable={false}>
        конфиденциальность
      </a>
      <a class={styles.link} href="/marketing" draggable={false}>
        рассылка
      </a>
      <a class={styles.link} href="/child-safety" draggable={false}>
        Защита детей
      </a>
      <a class={styles.link} href="/account-deletion" draggable={false}>
        Удаление аккаунта и данных
      </a>
      <span class={styles.supportLinks}>
        <a
          class={styles.link}
          href="/support"
          data-nav="support"
          draggable={false}
          onClick={onSupportClick ? (e) => { e.preventDefault(); onSupportClick(); } : undefined}
        >
          поддержка
        </a>
        {showCommunityLinks ? <>
          <a class={styles.link} href={COMMUNITY_CHAT_URL} target="_blank" rel="noopener noreferrer" draggable={false}>
            чат
          </a>
          <a class={`${styles.link} ${styles.channelLink}`} href={COMMUNITY_CHANNEL_URL} target="_blank" rel="noopener noreferrer" draggable={false} aria-label="канал WIRING в Telegram" title="канал WIRING в Telegram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21.7 3.4 18.5 20c-.2 1.2-.9 1.5-1.9.9l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L17.7 7c.4-.3-.1-.5-.6-.2l-11 7-4.7-1.5c-1-.3-1-1 .2-1.5L20 3.7c.9-.3 1.7-.2 1.7-.3Z" />
            </svg>
          </a>
        </> : null}
      </span>
    </footer>
  );
}
