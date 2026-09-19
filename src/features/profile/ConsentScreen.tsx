import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Checkbox, LegalFooter, ProfileMenu } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ProfileHostBridge } from "./types";
import styles from "./ProfileScreen.module.css";

export function ConsentScreen({ host }: { host: ProfileHostBridge }) {
  const [special, setSpecial] = useState(!host.user.needs_special_consent);
  const [photo, setPhoto] = useState(!host.user.needs_photo_consent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avatar = host.user.photo;

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
        body: JSON.stringify({ special_data_consent: special, photo_rights_consent: photo }),
      });
      host.onUserUpdated(response.user);
      host.toast("согласия сохранены");
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
        sectionTitle="Согласия"
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={
          <ProfileMenu
            avatarUrl={avatar ? `${host.basePath}${avatar}` : undefined}
            userName={String(host.user.name || "")}
            isPlus={Boolean(host.user.plus)}
            profileHref={host.hrefFor("profile")}
            consentsHref={host.hrefFor("consents")}
            plusHref={host.hrefFor("plus")}
            onProfileClick={navigate("profile")}
            onConsentsClick={navigate("consents")}
            onPlusClick={navigate("plus")}
            onLogout={host.onLogout}
          />
        }
      />
      <main class={styles.consentPage}>
        <h1>Согласия</h1>
        <form class={styles.consentForm} onSubmit={save}>
          <Checkbox name="special_data_consent" checked={special} onChange={setSpecial}>
            Согласен(на) на обработку и показ выбранных особенностей
          </Checkbox>
          <Checkbox name="photo_rights_consent" checked={photo} onChange={setPhoto}>
            Загружаю только свои фото и разрешаю показывать их участникам WIRING
          </Checkbox>
          {error && <p class={styles.error} role="alert">{error}</p>}
          <Button type="submit" fullWidth disabled={busy} loading={busy}>{busy ? "Сохраняем…" : "Сохранить"}</Button>
        </form>
      </main>
      <LegalFooter />
    </div>
  );
}
