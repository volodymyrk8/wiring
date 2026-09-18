import { useState } from "preact/hooks";
import { Button } from "@/components/ui/Button";
import { FieldFloating } from "@/components/ui/FieldFloating";
import { PasswordField } from "@/components/ui/PasswordField";
import type { AuthHostBridge } from "@/features/auth/types";
import { getErrorMessage } from "@/lib/get-error-message";

type AuthScreenProps = { host: AuthHostBridge };

export function AuthScreen({ host }: AuthScreenProps) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const { mode, hrefFor } = host;

  const onSubmitLoginRegister = async (e: Event) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const isRegister = mode === "register";
    try {
      let body: Record<string, unknown>;
      if (isRegister) {
        body = {
          ...Object.fromEntries(fd.entries()),
          age_confirm: fd.has("age_confirm"),
          privacy_confirm: fd.has("privacy_confirm"),
          marketing_consent: fd.has("marketing_consent"),
        };
        const ref = host.getReferralCode();
        if (ref) body.ref = ref;
      } else {
        body = Object.fromEntries(fd.entries()) as Record<string, unknown>;
      }
      const data = (await host.api(isRegister ? "/api/register" : "/api/login", {
        method: "POST",
        body: JSON.stringify(body),
      })) as Record<string, unknown>;
      if (isRegister && data.needs_email_verify) {
        host.onRegisterVerify(String(data.email || body.email || ""));
        return;
      }
      await host.onAuthSuccess(isRegister ? "register" : "login", data);
    } catch (error) {
      const payloadErr =
        error && typeof error === "object" && "payload" in error
          ? (error as { payload?: { needs_email_verify?: boolean; email?: string } }).payload
          : null;
      if (payloadErr?.needs_email_verify) {
        const email = String(payloadErr.email || fd.get("email") || "");
        host.onRegisterVerify(email);
        return;
      }
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onSubmitForgot = async (e: Event) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await host.api("/api/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email") }),
      });
      host.toast("если аккаунт есть — письмо уже в пути");
      host.onForgotDone();
    } catch (error) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onSubmitReset = async (e: Event) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await host.api("/api/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: host.resetToken, password: fd.get("password") }),
      });
      host.toast("пароль обновлён — можно войти");
      host.onResetDone();
    } catch (error) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const onResendVerify = async () => {
    setErr("");
    if (!host.verifyEmail) {
      setErr("нет адреса — зарегистрируйся ещё раз");
      return;
    }
    try {
      await host.api("/api/email/resend", {
        method: "POST",
        body: JSON.stringify({ email: host.verifyEmail }),
      });
      host.toast("если аккаунт ждёт подтверждения — письмо уже в пути");
    } catch (error) {
      setErr(getErrorMessage(error));
    }
  };

  if (mode === "verify") {
    const email = host.verifyEmail;
    return (
      <>
        <h2>Подтверди почту</h2>
        <p class="lede auth-lede">
          Мы отправили ссылку
          {email ? (
            <>
              {" "}
              на <strong>{email}</strong>
            </>
          ) : (
            ""
          )}
          . Открой письмо и перейди по ссылке — после этого можно войти.
        </p>
        <div class="err">{err}</div>
        <div class="actions auth-actions">
          <Button type="button" onClick={onResendVerify}>
            Отправить ссылку ещё раз
          </Button>
          <Button variant="ghost" href={hrefFor("login")} nav="login">
            Назад ко входу
          </Button>
        </div>
        <p class="hint">Не видишь письмо? Проверь «Спам» и «Промоакции».</p>
      </>
    );
  }

  if (mode === "forgot") {
    return (
      <>
        <h2>Сброс пароля</h2>
        <p class="lede auth-lede">Пришлём ссылку на почту, если такой аккаунт есть.</p>
        <form class="form auth-form" onSubmit={onSubmitForgot}>
          <FieldFloating label="Почта" name="email" type="email" required autoComplete="username" />
          <div class="err">{err}</div>
          <div class="actions auth-actions">
            <Button type="submit" disabled={busy}>
              Отправить ссылку
            </Button>
            <Button variant="ghost" href={hrefFor("login")} nav="login">
              Назад ко входу
            </Button>
          </div>
        </form>
      </>
    );
  }

  if (mode === "reset") {
    return (
      <>
        <h2>Новый пароль</h2>
        <form class="form auth-form" onSubmit={onSubmitReset}>
          <PasswordField autoComplete="new-password" />
          <div class="err">{err}</div>
          <div class="actions auth-actions">
            <Button type="submit" disabled={busy}>
              Сохранить пароль
            </Button>
            <Button variant="ghost" href={hrefFor("login")} nav="login">
              Назад ко входу
            </Button>
          </div>
        </form>
      </>
    );
  }

  const isLogin = mode === "login";
  return (
    <>
      <h2>{isLogin ? "Вход" : "Регистрация"}</h2>
      {!isLogin ? (
        <p class="lede auth-lede">
          {host.inviteLede
            ? "Ты по приглашению. После регистрации WIRING+ на 30 дней будет у вас обоих. Анкету можно дозаполнить позже."
            : "Сначала имя, почта и пароль. Анкету — фото, город, особенности — дозаполнишь, когда будет удобно."}
        </p>
      ) : null}
      <form class="form auth-form" onSubmit={onSubmitLoginRegister}>
        {!isLogin ? (
          <FieldFloating
            label="Имя"
            name="name"
            required
            minLength={2}
            maxLength={32}
            autoComplete="nickname"
          />
        ) : null}
        <FieldFloating
          label="Почта"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
        />
        <PasswordField autoComplete={isLogin ? "current-password" : "new-password"} />
        {!isLogin ? (
          <>
            <label class="check">
              <input name="age_confirm" type="checkbox" required autocomplete="off" /> мне есть 18, принимаю{" "}
              <a href="/rules" target="_blank" rel="noopener">
                правила
              </a>
            </label>
            <label class="check">
              <input name="privacy_confirm" type="checkbox" required autocomplete="off" /> согласен(на) на обработку
              персональных данных и принимаю{" "}
              <a href="/privacy" target="_blank" rel="noopener">
                политику конфиденциальности
              </a>
            </label>
            <label class="check">
              <input name="marketing_consent" type="checkbox" autocomplete="off" /> согласен(на) на маркетинговые
              письма на почту
            </label>
          </>
        ) : null}
        <div class="err">{err}</div>
        <div class="actions auth-actions">
          <Button type="submit" disabled={busy}>
            {isLogin ? "Войти" : "Создать аккаунт"}
          </Button>
          <Button
            variant="ghost"
            href={hrefFor(isLogin ? "register" : "login")}
            nav={isLogin ? "register" : "login"}
          >
            {isLogin ? "Создать профиль" : "Войти"}
          </Button>
        </div>
        {isLogin ? (
          <p class="hint auth-hint">
            <a href={hrefFor("forgot")} data-nav="forgot">
              Забыл(а) пароль?
            </a>
          </p>
        ) : null}
      </form>
    </>
  );
}
