import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, ProfileMenu, Switch } from "@/components/ui";
import { getErrorMessage } from "@/lib/get-error-message";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { ProfileHostBridge, ProfileUser } from "./types";
import styles from "./PlusScreen.module.css";

const plusUntil = (timestamp?: number) => {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" });
};

const iconProps = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const features = [
  {
    title: "Видно, кто лайкнул",
    text: "Открывай входящие симпатии и выбирай, кому ответить взаимностью.",
    icon: <svg {...iconProps}><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.4" /></svg>,
  },
  {
    title: "Режим инкогнито",
    text: "Твоя анкета видна только тем людям, которых ты лайкнул сам.",
    icon: <svg {...iconProps}><path d="M12 3.5a5 5 0 0 0-5 5c0 2.2 1.2 3.8 2.2 5.2.6.8.8 1.5.8 2.3h4c0-.8.2-1.5.8-2.3 1-1.4 2.2-3 2.2-5.2a5 5 0 0 0-5-5z" /><path d="M9.5 19.5h5" /></svg>,
  },
  {
    title: "Пауза анкеты",
    text: "Скрой себя из ленты на время отдыха — текущие переписки и мэтчи сохранятся.",
    icon: <svg {...iconProps}><rect x="7" y="5" width="3.2" height="14" rx="1" /><rect x="13.8" y="5" width="3.2" height="14" rx="1" /></svg>,
  },
  {
    title: "Заметки и закладки",
    text: "Оставляй личные пометки к профилям — их видишь только ты.",
    icon: <svg {...iconProps}><path d="M8 3.5h7l4 4V20.5H8z" /><path d="M15 3.5V8h4" /><path d="M10.5 12.5h5M10.5 16h3.5" /></svg>,
  },
];

export function PlusScreen({ host }: { host: ProfileHostBridge }) {
  const [user, setUser] = useState(host.user);
  const [busy, setBusy] = useState<"incognito" | "paused" | null>(null);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");

  const updateUser = (nextUser: ProfileUser) => {
    setUser(nextUser);
    host.onUserUpdated(nextUser);
  };

  const navigate = (view: string) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view);
  };

  const savePlus = async (key: "incognito" | "paused", value: boolean) => {
    if (busy) return;
    const previous = user;
    setBusy(key);
    setError("");
    setUser({ ...user, [key]: value });
    try {
      const response = await host.api("/api/plus", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      updateUser(response.user as ProfileUser);
      host.toast("сохранено");
    } catch (caught) {
      setUser(previous);
      setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const redeem = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode || redeeming) return;
    setRedeeming(true);
    setError("");
    try {
      const response = await host.api("/api/premium/redeem", {
        method: "POST",
        body: JSON.stringify({ code: cleanCode }),
      });
      const nextUser = response.user as ProfileUser;
      const recommendationsGranted = !user.jev_feed_unlocked && nextUser.jev_feed_unlocked;
      updateUser(nextUser);
      setCode("");
      host.toast(recommendationsGranted ? "Подбор открыт — включи «Для тебя» в профиле" : "WIRING+ подключён");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setRedeeming(false);
    }
  };

  const copyReferral = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(String(user.ref_url));
      host.toast("ссылка скопирована");
    } catch {
      host.toast("скопируй ссылку");
    }
  };

  const name = String(user.name || "Профиль");
  const signed = !user.guest;

  return (
    <div class={styles.root}>
      <AppHeader
        homeHref={host.hrefFor("home")}
        onHomeClick={navigate("home")}
        showBack
        backHref={host.hrefFor("profile")}
        onBackClick={navigate("profile")}
        className={styles.header}
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={signed ? (
          <ProfileMenu
            avatarUrl={profileMenuAvatarUrl(host.basePath, user.photo)}
            userName={name}
            isPlus={Boolean(user.plus)}
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
        ) : null}
      />

      <main class={styles.content}>
        <header class={styles.hero}>
          <span class={styles.gem} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 13L2 9Z" />
              <path d="M11 3 8 9l4 13 4-13-3-6M2 9h20" />
            </svg>
          </span>
          <h1>WIRING+</h1>
          <p>Спокойный и комфортный режим знакомств без лишней спешки и ограничений.</p>
        </header>

        <section class={`${styles.panel}${user.plus ? ` ${styles.panelActive}` : ""}`}>
          <h2 class={styles.panelTitle}>{user.plus ? "WIRING+ включён" : "WIRING+ выключен"}</h2>
          {user.plus ? (
            <>
              <p class={styles.hint}>{user.plus_until ? `Подписка заканчивается ${plusUntil(user.plus_until)}` : "Подписка активна"}</p>
              <div class={styles.switchList}>
                <Switch
                  name="incognito"
                  checked={Boolean(user.incognito)}
                  disabled={busy !== null}
                  loading={busy === "incognito"}
                  onChange={(checked) => void savePlus("incognito", checked)}
                >
                  инкогнито — меня не показывают, пока я сам не лайкну
                </Switch>
                <Switch
                  name="paused"
                  checked={Boolean(user.paused)}
                  disabled={busy !== null}
                  loading={busy === "paused"}
                  onChange={(checked) => void savePlus("paused", checked)}
                >
                  пауза — временно скрыть анкету
                </Switch>
              </div>
            </>
          ) : (
            <p class={styles.hint}>Спокойный режим: кто лайкнул, инкогнито, пауза, заметки и отложенные профили.</p>
          )}
          <form class={styles.codeForm} onSubmit={redeem}>
            <label class={styles.codeField}>
              промокод
              <input value={code} maxlength={24} placeholder="если есть код" autocomplete="off" onInput={(event) => setCode(event.currentTarget.value)} />
            </label>
            <Button type="submit" slim disabled={redeeming} loading={redeeming}>активировать</Button>
          </form>
          {error && <p class={styles.error} role="alert">{error}</p>}
        </section>

        <section class={styles.featureList} aria-label="Возможности WIRING+">
          {features.map((feature) => (
            <article class={styles.feature} key={feature.title}>
              <span class={styles.featureIcon} aria-hidden="true">{feature.icon}</span>
              <div><strong>{feature.title}</strong><p>{feature.text}</p></div>
            </article>
          ))}
        </section>

        {user.ref_url ? (
          <section class={styles.panel}>
            <h2 class={styles.panelTitle}>Пригласи своих</h2>
            <p class={styles.hint}>По ссылке зарегистрируется человек — ещё {user.ref_days || 30} дней WIRING+ вам обоим. Уже привели: {user.ref_count || 0}</p>
            <div class={styles.refRow}>
              <input readOnly value={String(user.ref_url)} aria-label="Реферальная ссылка" />
              <Button type="button" variant="ghost" slim onClick={() => void copyReferral()}>копировать</Button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
