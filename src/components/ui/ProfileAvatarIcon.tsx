export type ProfileAvatarIconProps = {
  size?: number;
  className?: string;
};

export function ProfileAvatarIcon({ size = 20, className }: ProfileAvatarIconProps) {
  return (
    <svg
      class={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="7.8" r="3.4" />
      <path d="M5.5 20.2c1.3-3.6 3.6-5 6.5-5s5.2 1.4 6.5 5" />
    </svg>
  );
}
