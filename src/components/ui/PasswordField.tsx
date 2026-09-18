import { useState } from "preact/hooks";

const iconEye =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const iconEyeOff =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4.07 5.18M6.12 6.12A18.36 18.36 0 0 0 2 12s3.5 7 10 7a10.94 10.94 0 0 0 5.1-1.24"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

type PasswordFieldProps = {
  name?: string;
  autoComplete?: string;
  required?: boolean;
};

export function PasswordField({
  name = "password",
  autoComplete = "current-password",
  required = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <label class="field-floating field-floating--password">
      <span class="password-wrap">
        <input
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={6}
          autocomplete={autoComplete}
          placeholder=" "
        />
        <button
          type="button"
          class={`password-toggle${visible ? " on" : ""}`}
          aria-label={visible ? "скрыть пароль" : "показать пароль"}
          title={visible ? "скрыть пароль" : "показать пароль"}
          onClick={() => setVisible((v) => !v)}
          dangerouslySetInnerHTML={{ __html: visible ? iconEyeOff : iconEye }}
        />
      </span>
      <span class="field-floating__label">Пароль</span>
    </label>
  );
}
