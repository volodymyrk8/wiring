import type { ProfileCatalog, ProfileUser } from "@/features/profile/types";

export type AccountHostBridge = {
  user: ProfileUser;
  catalog: ProfileCatalog;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  continueAfterInvite: () => Promise<void>;
  onDeleted: () => Promise<void>;
  uploadPhoto: (file: File, rightsConsent?: boolean) => Promise<unknown>;
  refreshUser: () => Promise<ProfileUser>;
  onUserUpdated: (user: ProfileUser) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout: () => void;
};
