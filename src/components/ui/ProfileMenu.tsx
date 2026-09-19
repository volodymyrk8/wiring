import { useState, useRef, useEffect } from "preact/hooks";
import type { JSX } from "preact";
import styles from "./ProfileMenu.module.css";

export type ProfileMenuProps = {
  avatarUrl?: string;
  userName?: string;
  isPlus?: boolean;
  profileHref?: string;
  plusHref?: string;
  supportHref?: string;
  onProfileClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onPlusClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  onLogout?: () => void;
  className?: string;
};

export function ProfileMenu({
  avatarUrl,
  userName,
  isPlus,
  profileHref = "/profile",
  plusHref = "/plus",
  supportHref = "/support",
  onProfileClick,
  onPlusClick,
  onLogout,
  className,
}: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
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

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout?.();
  };

  return (
    <div ref={containerRef} class={`${styles.profilePop}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        class={`avatar-slot ${styles.avatarBtn}`}
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={isPlus ? "Меню профиля · WIRING+" : "Меню профиля"}
        title={isPlus ? "Меню профиля · WIRING+" : "Меню профиля"}
      >
        <span class={`avatar-link${isPlus ? " plus" : ""}`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="7.8" r="3.4" />
              <path d="M5.5 20.2c1.3-3.6 3.6-5 6.5-5s5.2 1.4 6.5 5" />
            </svg>
          )}
        </span>
        {isPlus && (
          <span class="plus-mark" title="WIRING+" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3h12l4 7-10 11L2 10l4-7z" />
              <path d="M2 10h20" />
              <path d="m7.5 3 4.5 7 4.5-7" />
              <path d="M12 21 7.5 10 12 3l4.5 7L12 21z" />
            </svg>
          </span>
        )}
      </button>

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
            <span class={styles.plusBadgeGem} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 13L2 9Z" />
                <path d="M11 3 8 9l4 13 4-13-3-6" />
                <path d="M2 9h20" />
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
            href={supportHref}
            class={styles.menuItem}
            onClick={() => setIsOpen(false)}
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
