import { useState, useRef, useEffect } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledValue !== undefined;
  const selectedValue = isControlled ? controlledValue : internalValue;
  const selectedOption = options.find((o) => o.value === selectedValue);

  useEffect(() => {
    if (!isOpen) return;

    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen((prev) => !prev);
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

  return (
    <div ref={wrapRef} class={`${styles.selectWrap}${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        class={`${styles.trigger}${isIconOnly ? ` ${styles.iconTrigger}` : ""}${isPill ? ` ${styles.pillTrigger}` : ""}${!showValue && !isIconOnly ? ` ${styles.compactTrigger}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || title || selectedOption?.label || placeholder}
        title={title || selectedOption?.label}
        onClick={toggleOpen}
      >
        {selectedOption?.swatchTheme ? (
          <span class={styles.swatch} data-theme-set={selectedOption.swatchTheme} data-theme={selectedOption.swatchTheme} aria-hidden="true" />
        ) : icon ? (
          icon
        ) : null}

        {!isIconOnly && showValue && (
          <span class={styles.label}>{selectedOption?.label || placeholder}</span>
        )}

        {showChevron && !isIconOnly && (
          <span class={`${styles.chevron}${isOpen ? ` ${styles.chevronOpen}` : ""}`} aria-hidden="true">
            <ChevronIcon />
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          class={`${styles.menu}${align === "left" ? ` ${styles.menuAlignLeft}` : ""}${menuClassName ? ` ${menuClassName}` : ""}`}
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
                class={`${styles.option}${isSelected ? ` ${styles.selectedOption}` : ""}`}
                onClick={handleSelect(option)}
              >
                {option.swatchTheme ? (
                  <span class={styles.swatch} data-theme-set={option.swatchTheme} data-theme={option.swatchTheme} aria-hidden="true" />
                ) : option.icon ? (
                  option.icon
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
