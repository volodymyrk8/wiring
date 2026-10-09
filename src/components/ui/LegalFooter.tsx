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
        <a class={styles.link} href={COMMUNITY_CHANNEL_URL} {...externalTelegram}>
          Канал
        </a>
        <a class={styles.link} href={COMMUNITY_CHAT_URL} {...externalTelegram}>
          Чат
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
