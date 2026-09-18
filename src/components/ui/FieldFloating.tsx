type FieldFloatingProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: string;
  autoCapitalize?: string;
};

export function FieldFloating({
  label,
  name,
  type = "text",
  required,
  minLength,
  maxLength,
  autoComplete,
  inputMode,
  autoCapitalize,
}: FieldFloatingProps) {
  return (
    <label class="field-floating">
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autocomplete={autoComplete}
        inputMode={inputMode as preact.JSX.HTMLAttributes<HTMLInputElement>["inputMode"]}
        autocapitalize={autoCapitalize}
        placeholder=" "
      />
      <span class="field-floating__label">{label}</span>
    </label>
  );
}
