import { tr } from "@/lib/i18n";
import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Checkbox, LegalFooter, ProfileMenu } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { ProfileHostBridge } from "./types";
import styles from "./ProfileScreen.module.css";

export function ConsentScreen({ host }: { host: ProfileHostBridge }) {
  const [special, setSpecial] = useState(!host.user.needs_special_consent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };

  const save = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await host.api("/api/me/consents", {
        method: "PATCH",
        body: JSON.stringify({ special_data_consent: special }),
      });
      host.onUserUpdated(response.user);
      host.toast(tr("согласия сохранены"));
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
        sectionTitle={tr("Согласия")}
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={
          <ProfileMenu
            avatarUrl={profileMenuAvatarUrl(host.basePath, host.user.photo)}
            userName={String(host.user.name || "")}
            isPlus={Boolean(host.user.plus)}
            profileHref={host.hrefFor("profile")}
            consentsHref={host.hrefFor("consents")}
            plusHref={host.hrefFor("plus")}
            notificationsHref={host.hrefFor("notifications")}
            archiveHref={host.hrefFor("archive")}
            onProfileClick={navigate("profile")}
            onConsentsClick={navigate("consents")}
            onPlusClick={navigate("plus")}
            onNotificationsClick={navigate("notifications")}
            onArchiveClick={navigate("archive")}
            onLogout={host.onLogout}
          />
        }
      />
      <main class={styles.consentPage}>
        <h1>{tr("Согласия")}</h1>
        <form class={styles.consentForm} onSubmit={save}>
          <Checkbox name="special_data_consent" checked={special} onChange={setSpecial}>
            {tr("Согласен(на) на обработку и показ выбранных особенностей")}</Checkbox>
          {error && <p class={styles.error} role="alert">{error}</p>}
          <Button type="submit" fullWidth disabled={busy} loading={busy}>{busy ? tr("Сохраняем…") : tr("Сохранить")}</Button>
        </form>
      </main>
      <LegalFooter />
    </div>
  );
}
