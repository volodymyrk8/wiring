import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader } from "@/components/ui/AppHeader";
import { ProfileMenu } from "@/components/ui/ProfileMenu";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LegalFooter } from "@/components/ui/LegalFooter";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
import type { SupportHostBridge } from "./types";
import styles from "./SupportScreen.module.css";

export function SupportScreen({ host }: { host: SupportHostBridge }) {
  const [name, setName] = useState(host.user?.name || "");
  const [email, setEmail] = useState(host.user?.email || "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sendingRef = useRef(false);

  const sendMessage = async () => {
    if (sendingRef.current) return;
    const trimmed = body.trim();
    if (trimmed.length < 8) {
      setError("напиши чуть подробнее (минимум 8 символов)");
      return;
    }
    setError("");
    sendingRef.current = true;
    setBusy(true);

    try {
      const res = await host.api("/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          body: trimmed,
        }),
      });

      setNotice(res.notice || "отправили. ответим на почту, если её указал");
      setBody("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "произошла ошибка, попробуй позже";
      setError(message);
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const handleSubmit = (e: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleBack = (e: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    host.goBack();
  };

  const handleHome = (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    host.navigate("home");
  };

  return (
    <div class={styles.container}>
      <AppHeader
        showBack
        backHref={host.hrefFor("home")}
        onBackClick={handleBack}
        homeHref={host.hrefFor("home")}
        onHomeClick={handleHome}
        sectionTitle="поддержка"
        showThemeSwatches
        onThemeSelect={host.onThemeSelect}
        rightSlot={
          host.user && !host.user.guest ? (
            <ProfileMenu
              avatarUrl={profileMenuAvatarUrl(host.basePath, host.user.photo)}
              userName={String(host.user.name || "")}
              isPlus={Boolean(host.user.plus)}
              profileHref={host.hrefFor("profile")}
              consentsHref={host.hrefFor("consents")}
              plusHref={host.hrefFor("plus")}
              notificationsHref={host.hrefFor("notifications")}
              supportHref={host.hrefFor("support")}
              onProfileClick={() => host.navigate("profile")}
              onConsentsClick={() => host.navigate("consents")}
              onPlusClick={() => host.navigate("plus")}
              onNotificationsClick={() => host.navigate("notifications")}
              onSupportClick={() => host.navigate("support")}
              onLogout={host.onLogout}
            />
          ) : null
        }
      />

      <main class={styles.content}>
        <h1 class={styles.title}>Поддержка</h1>
        <div class={styles.intro}>
          <p>
            Напиши сюда — это единственный способ связаться с нами. Почту в сообщении указывать не
            обязательно: если укажешь, ответим туда. Если ты в аккаунте, увидим, кто пишет.
          </p>
        </div>

        {error && (
          <div class={`${styles.statusCard} ${styles.statusErr}`} role="alert">
            <span class={styles.statusIcon}>⚠️</span>
            <div>
              <p class={styles.statusText}>{error}</p>
            </div>
          </div>
        )}

        {notice ? (
          <div class={`${styles.statusCard} ${styles.statusOk}`}>
            <span class={styles.statusIcon}>✓</span>
            <div>
              <h3 class={styles.statusTitle}>Сообщение отправлено</h3>
              <p class={styles.statusText}>{notice}</p>
              <div class={styles.anotherBtn}>
                <Button variant="ghost" slim onClick={() => setNotice("")}>
                  Написать ещё одно сообщение
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form class={styles.form} onSubmit={handleSubmit} noValidate>
            <div class={styles.fields}>
              <Input
                label="Имя (по желанию)"
                name="name"
                maxLength={80}
                autoComplete="name"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />

              <Input
                label="Почта для ответа (по желанию)"
                name="email"
                type="email"
                maxLength={120}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              />

              <div class={styles.textareaField}>
                <textarea
                  id="support-body"
                  name="body"
                  required
                  minLength={8}
                  maxLength={2000}
                  placeholder="Что случилось? Опиши подробно..."
                  class={styles.textarea}
                  value={body}
                  onInput={(e) => {
                    setBody((e.target as HTMLTextAreaElement).value);
                    if (error) setError("");
                  }}
                />
                <div class={styles.textareaMeta}>
                  <span>Минимум 8 символов</span>
                  <span id="char-count">{body.length} / 2000</span>
                </div>
              </div>
            </div>

            <div class={styles.actions}>
              <Button
                variant="solid"
                fullWidth
                type="button"
                loading={busy}
                disabled={busy}
                onClick={() => void sendMessage()}
                onPointerDown={(e) => {
                  if (e.pointerType !== "touch" || busy) return;
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                <span>{busy ? "Отправляем…" : "Отправить сообщение"}</span>
              </Button>
            </div>
          </form>
        )}
      </main>

      <LegalFooter />
    </div>
  );
}
