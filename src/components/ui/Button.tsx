import type { ComponentChildren } from "preact";

type ButtonProps = {
  variant?: "solid" | "ghost";
  slim?: boolean;
  type?: "button" | "submit";
  href?: string;
  nav?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
};

export function Button({
  variant = "solid",
  slim,
  type = "button",
  href,
  nav,
  disabled,
  onClick,
  children,
}: ButtonProps) {
  const className = `${variant}${slim ? " slim" : ""}`;
  if (href) {
    return (
      <a class={className} href={href} data-nav={nav} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button class={className} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
