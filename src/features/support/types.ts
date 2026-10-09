export type SupportUser = {
  id?: number;
  name?: string;
  email?: string;
  guest?: boolean;
  photo?: string;
  plus?: boolean | number;
  report_banned?: boolean;
  report_ban_message?: string;
} | null;

export type SupportHostBridge = {
  user: SupportUser;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  goBack: () => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  onThemeSelect?: (theme: any) => void;
  onLogout?: () => void;
};
