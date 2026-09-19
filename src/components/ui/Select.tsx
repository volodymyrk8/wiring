import { useState, useRef, useEffect } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import { announcePopupOpen, useDismissibleLayer } from "./useDismissibleLayer";
import styles from "./Select.module.css";

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: ComponentChildren;
  swatchTheme?: string;
  disabled?: boolean;
};

export type SelectProps<T extends string = string> = {
  options: SelectOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  id?: string;
  error?: string | boolean;
  hint?: string;
  variant?: "default" | "iconOnly" | "pill";
  align?: "left" | "right";
  icon?: ComponentChildren;
  showChevron?: boolean;
  showValue?: boolean;
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
  title?: string;
};

export function Select<T extends string = string>({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = "Выбрать…",
  label: fieldLabel,
  required,
  id,
  error,
  hint,
  variant = "default",
  align = "right",
  icon,
  showChevron = true,
  showValue = true,
  className,
  menuClassName,
  ariaLabel,
  title,
}: SelectProps<T>) {
  const [internalValue, setInternalValue] = useState<T | undefined>(defaultValue ?? options[0]?.value);
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [menuMaxHeight, setMenuMaxHeight] = useState(320);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledValue !== undefined;
  const selectedValue = isControlled ? controlledValue : internalValue;
  const selectedOption = options.find((o) => o.value === selectedValue);

  useDismissibleLayer(wrapRef, isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen) return;

    const updatePlacement = () => {
      const wrap = wrapRef.current;
      const menu = menuRef.current;
      if (!wrap || !menu) return;
      const rect = wrap.getBoundingClientRect();
      const menuHeight = Math.min(menu.scrollHeight, 320);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const nextPlacement = below < menuHeight && above > below ? "up" : "down";
      const available = Math.max(48, nextPlacement === "up" ? above : below);
      setPlacement(nextPlacement);
      setMenuMaxHeight(Math.min(320, available));
    };

    requestAnimationFrame(updatePlacement);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [isOpen]);

  const toggleOpen = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      announcePopupOpen(wrapRef.current);
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = (option: SelectOption<T>) => (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (option.disabled) return;
    if (!isControlled) {
      setInternalValue(option.value);
    }
    onChange?.(option.value);
    setIsOpen(false);
  };

  const isIconOnly = variant === "iconOnly";
  const isPill = variant === "pill";
  const hasFieldLabel = Boolean(fieldLabel) && !isIconOnly;
  const hasError = Boolean(error);
  const errorId = id ? `${id}-error` : undefined;
  const hintId = id ? `${id}-hint` : undefined;

  return (
    <div ref={wrapRef} class={`${styles.selectWrap}${hasFieldLabel ? ` ${styles.hasFieldLabel}` : ""}${hasError ? ` ${styles.hasError}` : ""}${className ? ` ${className}` : ""}`}>
      <button
        id={id}
        type="button"
        class={`${styles.trigger}${isIconOnly ? ` ${styles.iconTrigger}` : ""}${isPill ? ` ${styles.pillTrigger}` : ""}${!showValue && !isIconOnly ? ` ${styles.compactTrigger}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || fieldLabel || title || selectedOption?.label || placeholder}
        aria-required={required}
        aria-invalid={hasError}
        aria-describedby={hasError && typeof error === "string" ? errorId : hint ? hintId : undefined}
        title={title || selectedOption?.label}
        onClick={toggleOpen}
      >
        {selectedOption?.icon ? (
          <span class={styles.triggerIcon}>{selectedOption.icon}</span>
        ) : selectedOption?.swatchTheme ? (
          <span class={styles.swatch} data-theme-set={selectedOption.swatchTheme} data-theme={selectedOption.swatchTheme} aria-hidden="true" />
        ) : icon ? (
          icon
        ) : null}

        {!isIconOnly && showValue && (
          <span class={`${hasFieldLabel ? styles.value : styles.label}${!selectedOption ? ` ${styles.placeholder}` : ""}`}>
            {selectedOption?.label || placeholder}
          </span>
        )}

        {hasFieldLabel && <span class={styles.fieldLabel}>{fieldLabel}</span>}

        {showChevron && !isIconOnly && (
          <span class={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`} aria-hidden="true">
            <ChevronIcon />
          </span>
        )}
      </button>

      {typeof error === "string" && error ? (
        <span id={errorId} class={styles.errorText} role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} class={styles.hintText}>{hint}</span>
      ) : null}

      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          style={{ maxHeight: `${menuMaxHeight}px` }}
          class={`${styles.menu}${placement === "up" ? ` ${styles.menuUp}` : ""}${align === "left" ? ` ${styles.menuAlignLeft}` : ""}${menuClassName ? ` ${menuClassName}` : ""}`}
        >
          {options.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                data-value={option.value}
                data-theme={option.swatchTheme || option.value}
                class={`${styles.option}${isSelected ? ` ${styles.selectedOption}` : ""}`}
                onClick={handleSelect(option)}
              >
                {option.icon ? (
                  <span class={styles.optionIcon}>{option.icon}</span>
                ) : option.swatchTheme ? (
                  <span class={styles.swatch} data-theme-set={option.swatchTheme} data-theme={option.swatchTheme} aria-hidden="true" />
                ) : null}
                <span class={styles.optionLabel}>{option.label}</span>
                {isSelected && (
                  <span class={styles.check} aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
