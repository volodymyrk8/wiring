import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, LegalFooter, ProfileMenu, Switch } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import { iosNeedsHomeScreen, syncWebPush, webPushSupported } from "@/lib/web-push";
import type { ProfileHostBridge, ProfileUser } from "./types";
import styles from "./NotificationSettingsScreen.module.css";

export function NotificationSettingsScreen({ host }: { host: ProfileHostBridge }) {
  const [user, setUser] = useState(host.user);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });
  const [error, setError] = useState("");
  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };
  const enabled = user.notify_enabled !== false;
  const push = enabled && user.notify_push !== false;

  const patchNotifications = async (patch: { enabled?: boolean; push?: boolean }) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let nextPush = patch.push;
      if (nextPush && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          const nextPermission = await Notification.requestPermission();
          setPermission(nextPermission);
          if (nextPermission !== "granted") nextPush = false;
        } else if (Notification.permission === "denied") {
          nextPush = false;
          host.toast("разреши уведомления в настройках браузера");
        }
      }
      const body: { enabled?: boolean; push?: boolean } = {};
      if (patch.enabled !== undefined) body.enabled = patch.enabled;
      if (nextPush !== undefined) body.push = nextPush;
      else if (patch.push !== undefined) body.push = patch.push;
      const response = await host.api("/api/notifications", { method: "PATCH", body: JSON.stringify(body) });
      const nextUser = response.user as ProfileUser;
      setUser(nextUser);
      host.onUserUpdated(nextUser);
      if (nextUser.notify_push && nextUser.notify_enabled !== false && Notification.permission === "granted") {
        const pushState = await syncWebPush(host.api, true);
        if (pushState === "unsupported") {
          host.toast("в этом браузере пуш при закрытом сайте недоступен — останутся уведомления, пока вкладка открыта");
        }
      } else if (patch.push === false || nextUser.notify_push === false || nextUser.notify_enabled === false) {
        await syncWebPush(host.api, false);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={navigate("home")}
        showBack
        backHref={host.hrefFor("profile")}
        onBackClick={navigate("profile")}
        sectionTitle="Уведомления"
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={<ProfileMenu
          avatarUrl={profileMenuAvatarUrl(host.basePath, user.photo)}
          userName={String(user.name || "")}
          isPlus={Boolean(user.plus)}
          profileHref={host.hrefFor("profile")}
          consentsHref={host.hrefFor("consents")}
          plusHref={host.hrefFor("plus")}
          notificationsHref={host.hrefFor("notifications")}
          onProfileClick={navigate("profile")}
          onConsentsClick={navigate("consents")}
          onPlusClick={navigate("plus")}
          onNotificationsClick={navigate("notifications")}
          onLogout={host.onLogout}
        />}
      />
      <main class={styles.content}>
        <header class={styles.heading}>
          <h1>Уведомления</h1>
          <p>Выбери, какие события будут напоминать о себе.</p>
        </header>
        <section class={styles.section}>
          <div class={styles.notifyList}>
            <Switch name="notify-enabled" checked={enabled} disabled={busy} loading={busy} onChange={(checked) => void patchNotifications({ enabled: checked })}>
              уведомления о лайках и сообщениях — подсказки на сайте
            </Switch>
            <Switch name="notify-push" checked={push && permission === "granted"} disabled={busy || !enabled || permission === "unsupported"} loading={busy} onChange={(checked) => void patchNotifications({ push: checked })}>
              пуш о лайках и сообщениях — и когда сайт закрыт
            </Switch>
          </div>
          {enabled && permission === "denied" ? <p class={styles.hint}>Браузер запретил уведомления. Их можно включить в настройках сайта в Safari или Chrome.</p> : null}
          {enabled && permission === "unsupported" ? <p class={styles.hint}>Этот браузер не показывает системные уведомления — останутся подсказки на сайте и счётчики в меню.</p> : null}
          {enabled && permission !== "unsupported" && !webPushSupported() ? <p class={styles.hint}>Закрытый сайт этот браузер не будит. Уведомления останутся, пока вкладка WIRING открыта.</p> : null}
          {enabled && webPushSupported() && iosNeedsHomeScreen() ? <p class={styles.hint}>На iPhone пуш при закрытом Safari приходит, если добавить WIRING на экран «Домой». В обычной вкладке уведомления работают, пока сайт открыт.</p> : null}
          {error ? <p class={styles.error} role="alert">{error}</p> : null}
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
