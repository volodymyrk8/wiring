export type TraitChip = {
  label: string;
  vibe?: boolean;
};

export type HomeHostBridge = {
  signed: boolean;
  basePath?: string;
  fetchHomeFaces: () => Promise<string[]>;
  userTraits?: TraitChip[];
  profileAvatar?: string;
  userName?: string;
  isPlus?: boolean;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout?: () => void;
};
