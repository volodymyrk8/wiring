import { COMMUNITY_CHANNEL_URL, COMMUNITY_CHAT_URL } from "@/lib/community-links";
import styles from "./LegalFooter.module.css";

type LegalFooterProps = {
  className?: string;
  showTopBorder?: boolean;
  onSupportClick?: () => void;
};

const externalTelegram = {
  target: "_blank",
  rel: "noopener noreferrer",
  draggable: false as const,
};

const telegramIcon = (
  <svg class={styles.telegramIcon} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.7 3.4 18.5 20c-.2 1.2-.9 1.5-1.9.9l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L17.7 7c.4-.3-.1-.5-.6-.2l-11 7-4.7-1.5c-1-.3-1-1 .2-1.5L20 3.7c.9-.3 1.7-.2 1.7-.3Z" />
  </svg>
);

export function LegalFooter({ className, showTopBorder = true, onSupportClick }: LegalFooterProps = {}) {
  return (
    <footer
      class={`${styles.footer}${showTopBorder ? "" : ` ${styles.noTopBorder}`}${className ? ` ${className}` : ""}`}
      aria-label="юридическая информация"
    >
      <span class={styles.badge18}>18+</span>
      <a class={styles.link} href="/legal#documents" draggable={false}>
        Документы
      </a>
      <a class={styles.link} href="/legal#safety" draggable={false}>
        Безопасность
      </a>
      <span class={styles.supportLinks}>
        <a class={`${styles.link} ${styles.telegramLink}`} href={COMMUNITY_CHANNEL_URL} {...externalTelegram} title="Канал WIRING в Telegram">
          {telegramIcon}
          <span>Канал</span>
        </a>
        <a class={`${styles.link} ${styles.telegramLink}`} href={COMMUNITY_CHAT_URL} {...externalTelegram} title="Группа тестировщиков WIRING в Telegram">
          {telegramIcon}
          <span>Группа тестировщиков</span>
        </a>
        <a
          class={styles.link}
          href="/support"
          data-nav="support"
          draggable={false}
          onClick={onSupportClick ? (e) => { e.preventDefault(); onSupportClick(); } : undefined}
        >
          Поддержка
        </a>
      </span>
    </footer>
  );
}
