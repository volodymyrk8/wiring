import { useState, useEffect } from "preact/hooks";
import type { JSX } from "preact";
import { Button, Input, LegalFooter } from "@/components/ui";
import type { AuthHostBridge } from "@/features/auth/types";
import { getErrorMessage } from "@/lib/get-error-message";
import styles from "./AuthScreen.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CYRILLIC_RE = /[а-яё]/i;

type AuthScreenProps = { host: AuthHostBridge };

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

export function AuthScreen({ host }: AuthScreenProps) {
  const { mode, hrefFor } = host;
  const isRegister = mode === "register";
  const isLogin = mode === "login";

  // Form values
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Validation & Server state
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickedNeuro, setPickedNeuro] = useState<string | null>(null);

  // Check for preselected neuro from landing
  useEffect(() => {
    try {
      const p = sessionStorage.getItem("wiring_pick_neuro");
      if (p) setPickedNeuro(p);
    } catch (_) {}
  }, []);

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (serverError) {
      setServerError("");
      setEmailTaken(false);
    }
  };

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    const trimmedEmail = email.trim().toLowerCase();

    if (isRegister) {
      const trimmedName = name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 32) {
        errs.name = "Имя должно быть от 2 до 32 символов";
      }
    }

    if (!trimmedEmail) {
      errs.email = "Укажи адрес почты";
    } else if (CYRILLIC_RE.test(trimmedEmail)) {
      errs.email = "В почте должны быть только латинские буквы";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      errs.email = "Проверь правильность адреса почты";
    }

    if (!password) {
      errs.password = "Введи пароль";
    } else if (password.length < 6) {
      errs.password = "Пароль должен содержать минимум 6 символов";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmitLoginRegister = async (e: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    setServerError("");
    setEmailTaken(false);

    if (!validate()) {
      return;
    }

    setBusy(true);
    const trimmedEmail = email.trim().toLowerCase();
    try {
      let body: Record<string, unknown>;
      if (isRegister) {
        body = {
          name: name.trim(),
          email: trimmedEmail,
          password,
          age_confirm: true,
          privacy_confirm: true,
        };
        const ref = host.getReferralCode();
        if (ref) body.ref = ref;
      } else {
        body = {
          email: trimmedEmail,
          password,
        };
      }

      const data = (await host.api(isRegister ? "/api/register" : "/api/login", {
        method: "POST",
        body: JSON.stringify(body),
      })) as Record<string, unknown>;

      if (isRegister && data.needs_email_verify) {
        host.onRegisterVerify(String(data.email || trimmedEmail));
        return;
      }
      if (isRegister) {
        try {
          localStorage.setItem("wiring-analytics-consent", "granted");
        } catch (_) {}
      }
      await host.onAuthSuccess(isRegister ? "register" : "login", data);
    } catch (error) {
      const payloadErr =
        error && typeof error === "object" && "payload" in error
          ? (error as { payload?: { needs_email_verify?: boolean; email?: string } }).payload
          : null;
      if (payloadErr?.needs_email_verify) {
        const emailToVerify = String(payloadErr.email || trimmedEmail);
        host.onRegisterVerify(emailToVerify);
        return;
      }

      const msg = getErrorMessage(error);
      if (msg.includes("такая почта уже есть") || msg.includes("уже зарегистрирован")) {
        setEmailTaken(true);
        setFieldError("email", "Эта почта уже зарегистрирована");
      }
      setServerError(msg);
    } finally {
      setBusy(false);
    }
  };

  const setFieldError = (field: keyof FieldErrors, message: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  };

  const onSubmitForgot = async (e: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    setServerError("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      setFieldError("email", "Укажи корректный адрес почты");
      return;
    }
    setBusy(true);
    try {
      await host.api("/api/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail }),
      });
      host.toast("если аккаунт есть — письмо уже в пути");
      host.onForgotDone();
    } catch (error) {
      setServerError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onSubmitReset = async (e: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    setServerError("");
    if (password.length < 6) {
      setFieldError("password", "Минимум 6 символов");
      return;
    }
    setBusy(true);
    try {
      await host.api("/api/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: host.resetToken, password }),
      });
      host.toast("пароль обновлён — можно войти");
      host.onResetDone();
    } catch (error) {
      setServerError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onResendVerify = async () => {
    setServerError("");
    if (!host.verifyEmail) {
      setServerError("нет адреса — зарегистрируйся ещё раз");
      return;
    }
    try {
      await host.api("/api/email/resend", {
        method: "POST",
        body: JSON.stringify({ email: host.verifyEmail }),
      });
      host.toast("если аккаунт ждёт подтверждения — письмо уже в пути");
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  };

  // --- Screens: Verify, Forgot, Reset ---

  if (mode === "verify") {
    const verifyTarget = host.verifyEmail;
    return (
      <div class={styles.container}>
        <div class={styles.authBody}>
          <h2 class={`${styles.title} ${styles.titleWithLede}`}>Подтверди почту</h2>
          <p class={styles.lede}>
            Мы отправили ссылку
            {verifyTarget ? (
              <>
                {" "}
                на <strong>{verifyTarget}</strong>
              </>
            ) : (
              ""
            )}
            . Открой письмо и перейди по ссылке — после этого можно войти.
          </p>
          {serverError && (
            <div class={styles.errorBanner} role="alert">
              <span class={styles.errorIcon}>⚠️</span>
              <div class={styles.errorBody}>{serverError}</div>
            </div>
          )}
          <div class={styles.actions}>
            <Button type="button" onClick={onResendVerify} fullWidth>
              Отправить ссылку ещё раз
            </Button>
            <Button variant="ghost" href={hrefFor("login")} nav="login" fullWidth>
              Назад ко входу
            </Button>
          </div>
          <p class={styles.footerHint}>Не видишь письмо? Проверь «Спам» и «Промоакции».</p>
        </div>
        <LegalFooter />
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div class={styles.container}>
        <div class={styles.authBody}>
          <h2 class={`${styles.title} ${styles.titleWithLede}`}>Сброс пароля</h2>
          <p class={styles.lede}>Пришлём ссылку на почту, если такой аккаунт есть.</p>
          <form class={styles.form} onSubmit={onSubmitForgot} noValidate>
            <Input
              label="Почта"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              error={fieldErrors.email}
              onInput={(e) => {
                setEmail((e.currentTarget as HTMLInputElement).value);
                clearFieldError("email");
              }}
            />
            {serverError && (
              <div class={styles.errorBanner} role="alert">
                <span class={styles.errorIcon}>⚠️</span>
                <div class={styles.errorBody}>{serverError}</div>
              </div>
            )}
            <div class={styles.actions}>
              <Button type="submit" disabled={busy} loading={busy} fullWidth>
                {busy ? "Отправляем…" : "Отправить ссылку"}
              </Button>
              <Button variant="ghost" href={hrefFor("login")} nav="login" fullWidth>
                Назад ко входу
              </Button>
            </div>
          </form>
        </div>
        <LegalFooter />
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <div class={styles.container}>
        <div class={styles.authBody}>
          <h2 class={styles.title}>Новый пароль</h2>
          <form class={styles.form} onSubmit={onSubmitReset} noValidate>
            <Input
              label="Новый пароль"
              name="password"
              type="password"
              autoComplete="new-password"
              showStrength
              value={password}
              error={fieldErrors.password}
              onInput={(e) => {
                setPassword((e.currentTarget as HTMLInputElement).value);
                clearFieldError("password");
              }}
            />
            {serverError && (
              <div class={styles.errorBanner} role="alert">
                <span class={styles.errorIcon}>⚠️</span>
                <div class={styles.errorBody}>{serverError}</div>
              </div>
            )}
            <div class={styles.actions}>
              <Button type="submit" disabled={busy} loading={busy} fullWidth>
                {busy ? "Сохраняем…" : "Сохранить пароль"}
              </Button>
              <Button variant="ghost" href={hrefFor("login")} nav="login" fullWidth>
                Назад ко входу
              </Button>
            </div>
          </form>
        </div>
        <LegalFooter />
      </div>
    );
  }

  // --- Main Auth: Register or Login ---

  return (
    <div class={styles.container}>
      <div class={styles.authBody}>
        <h2 class={styles.title}>
          {isLogin ? "Вход" : "Регистрация"}
        </h2>

      {!isLogin && (
        <div class={styles.registerIntro}>
          <p class={styles.mission}>
            Мы нейроотличные люди и делаем проект для таких же, как мы. Создаём пространство для свободного и
            комфортного общения.
          </p>
          <p class={styles.mission}>
            <strong>Бета-версия.</strong> Сообщай в{" "}
            <a href={hrefFor("support")} data-nav="support" onClick={(e) => { e.preventDefault(); host.navigate("support"); }}>
              поддержку
            </a>{" "}
            о любых замечаниях, пожеланиях и улучшениях — мы внимательно и оперативно обработаем и при необходимости дадим обратную связь.
          </p>
        </div>
      )}

      {!isLogin && (
        <>
          {host.inviteLede && (
            <div class={styles.badgeCard}>
              <span class={styles.badgeIcon}>🎁</span>
              <div class={styles.badgeContent}>
                <span class={styles.badgeTitle}>Тебе доступен подарок!</span>
                <span class={styles.badgeDesc}>
                  Ты по приглашению. После регистрации WIRING+ на 30 дней активируется у тебя и у друга.
                </span>
              </div>
            </div>
          )}

          {pickedNeuro && (
            <div class={styles.badgeCard}>
              <span class={styles.badgeIcon}>✨</span>
              <div class={styles.badgeContent}>
                <span class={styles.badgeTitle}>Твой выбор сохранён</span>
                <span class={styles.badgeDesc}>
                  Мы автоматически добавим выбранную особенность в твой профиль.
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <form class={styles.form} onSubmit={onSubmitLoginRegister} noValidate>
        {!isLogin && (
          <Input
            label="Имя"
            name="name"
            required
            minLength={2}
            maxLength={32}
            autoComplete="name"
            enterKeyHint="next"
            value={name}
            error={fieldErrors.name}
            onInput={(e) => {
              setName((e.currentTarget as HTMLInputElement).value);
              clearFieldError("name");
            }}
          />
        )}

        <Input
          label="Почта"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          enterKeyHint="next"
          value={email}
          error={fieldErrors.email}
          onInput={(e) => {
            setEmail((e.currentTarget as HTMLInputElement).value);
            clearFieldError("email");
          }}
        />

        <Input
          label="Пароль"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          showStrength={!isLogin}
          enterKeyHint={isLogin ? "done" : "next"}
          value={password}
          error={fieldErrors.password}
          onInput={(e) => {
            setPassword((e.currentTarget as HTMLInputElement).value);
            clearFieldError("password");
          }}
        />

        {serverError && (
          <div class={styles.errorBanner} role="alert">
            <span class={styles.errorIcon}>⚠️</span>
            <div class={styles.errorBody}>
              <span>{serverError}</span>
              {emailTaken && (
                <a
                  class={styles.quickActionBtn}
                  href={hrefFor("login")}
                  data-nav="login"
                  onClick={() => host.navigate("login")}
                >
                  Войти с этой почтой →
                </a>
              )}
            </div>
          </div>
        )}

        <div class={styles.submitArea}>
          <Button type="submit" disabled={busy} loading={busy} fullWidth>
            {busy
              ? isLogin
                ? "Входим…"
                : "Создаём профиль…"
              : isLogin
              ? "Войти"
              : "Создать аккаунт"}
          </Button>

          {isRegister && (
            <p class={styles.legalDisclaimer}>
              Нажимая «Создать аккаунт», ты подтверждаешь возраст 18+ и принимаешь{" "}
              <a href="/rules" target="_blank" rel="noopener noreferrer">
                правила сервиса
              </a>{" "}
              и{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                политику конфиденциальности
              </a>
            </p>
          )}

          <div class={styles.switchRow}>
            <span class={styles.switchPrompt}>
              {isLogin ? "Ещё нет профиля?" : "Уже есть аккаунт?"}
            </span>
            <a
              class={styles.switchLink}
              href={hrefFor(isLogin ? "register" : "login")}
              data-nav={isLogin ? "register" : "login"}
              onClick={(e) => {
                e.preventDefault();
                host.navigate(isLogin ? "register" : "login");
              }}
            >
              {isLogin ? "Создать профиль" : "Войти"}
            </a>
          </div>

          {isLogin && (
            <div class={styles.forgotRow}>
              <a
                class={styles.forgotLink}
                href={hrefFor("forgot")}
                data-nav="forgot"
                onClick={(e) => {
                  e.preventDefault();
                  host.navigate("forgot");
                }}
              >
                Напомнить пароль?
              </a>
            </div>
          )}
        </div>
      </form>
      </div>
      <LegalFooter />
    </div>
  );
}
