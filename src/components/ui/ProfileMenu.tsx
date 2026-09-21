import { useState, useRef } from "preact/hooks";
import type { JSX } from "preact";
import { announcePopupOpen, useDismissibleLayer } from "./useDismissibleLayer";
import { ProfileAvatarIcon } from "./ProfileAvatarIcon";
import { IconButton } from "./IconButton";
import styles from "./ProfileMenu.module.css";

export type ProfileMenuProps = {
  avatarUrl?: string;
  userName?: string;
  isPlus?: boolean;
  profileHref?: string;
  consentsHref?: string;
  plusHref?: string;
  supportHref?: string;
  notificationsHref?: string;
  onProfileClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onConsentsClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onPlusClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onSupportClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onNotificationsClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onLogout?: () => void;
  className?: string;
};

export function ProfileMenu({
  avatarUrl,
  userName,
  isPlus,
  profileHref = "/profile",
  consentsHref = "/consents",
  plusHref = "/plus",
  supportHref = "/support",
  notificationsHref = "/notifications",
  onProfileClick,
  onConsentsClick,
  onPlusClick,
  onSupportClick,
  onNotificationsClick,
  onLogout,
  className,
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissibleLayer(containerRef, isOpen, () => setIsOpen(false));

  const toggleOpen = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) announcePopupOpen(containerRef.current);
    setIsOpen(!isOpen);
  };

  const handleProfileClick = (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    setIsOpen(false);
    onProfileClick?.(e);
  };

  const handlePlusClick = (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    setIsOpen(false);
    onPlusClick?.(e);
  };

  const handleConsentsClick = (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    setIsOpen(false);
    onConsentsClick?.(e);
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout?.();
  };

  return (
    <div ref={containerRef} class={`${styles.profilePop}${className ? ` ${className}` : ""}`}>
      <IconButton
        class="avatar-slot"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Меню профиля"
        title="Меню профиля"
      >
        <span class="avatar-link">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <ProfileAvatarIcon />
          )}
        </span>
      </IconButton>

      {isOpen && (
        <div class={styles.profileMenu} role="menu">
          {userName && (
            <>
              <div class={styles.menuHeader}>
                <span class={styles.userName}>{userName}</span>
              </div>
              <div class={styles.divider} />
            </>
          )}
          <a
            href={plusHref}
            class={`${styles.menuItem} ${styles.plusMenuItem}`}
            onClick={handlePlusClick}
            role="menuitem"
          >
            <span class={styles.itemIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 15 9l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7z" />
              </svg>
            </span>
            <span class={styles.itemText}>WIRING+</span>
            {isPlus ? (
              <span class={styles.plusStatusBadge}>активен</span>
            ) : (
              <span class={styles.plusStatusBadgeInactive}>подключить</span>
            )}
          </a>
          <a
            href={profileHref}
            class={styles.menuItem}
            onClick={handleProfileClick}
            role="menuitem"
          >
            <span class={styles.itemIcon}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="7.8" r="3.4" />
                <path d="M5.5 20.2c1.3-3.6 3.6-5 6.5-5s5.2 1.4 6.5 5" />
              </svg>
            </span>
            <span class={styles.itemText}>Профиль</span>
          </a>

          <a
            href={consentsHref}
            class={styles.menuItem}
            onClick={handleConsentsClick}
            role="menuitem"
          >
            <span class={styles.itemIcon}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3.5h10v17H7z" />
                <path d="m9.5 12 1.7 1.7 3.5-3.8" />
              </svg>
            </span>
            <span class={styles.itemText}>Согласия</span>
          </a>

          <a
            href={supportHref}
            data-nav="support"
            class={styles.menuItem}
            onClick={(e) => {
              setIsOpen(false);
              if (onSupportClick) onSupportClick(e);
            }}
            role="menuitem"
          >
            <span class={styles.itemIcon}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <span class={styles.itemText}>Поддержка</span>
          </a>

          <a
            href={notificationsHref}
            data-nav="notifications"
            class={styles.menuItem}
            onClick={(e) => {
              setIsOpen(false);
              onNotificationsClick?.(e);
            }}
            role="menuitem"
          >
            <span class={styles.itemIcon}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
            </span>
            <span class={styles.itemText}>Уведомления</span>
          </a>

          <div class={styles.divider} />

          <button
            type="button"
            class={`${styles.menuItem} ${styles.logoutItem}`}
            onClick={handleLogoutClick}
            role="menuitem"
          >
            <span class={styles.itemIcon}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </span>
            <span class={styles.itemText}>Выйти</span>
          </button>
        </div>
      )}
    </div>
  );
}
