/** Contract between the legacy SPA shell (`public/app.js`) and the auth feature bundle. */
export type AuthMode = "login" | "register" | "forgot" | "verify" | "reset";

export interface AuthHostBridge {
  mode: AuthMode;
  basePath: string;
  verifyEmail: string;
  resetToken: string;
  /** True when a referral code is present (invite registration copy). */
  inviteLede: boolean;
  getReferralCode: () => string;
  hrefFor: (view: string) => string;
  api: (path: string, init?: RequestInit) => Promise<unknown>;
  toast: (message: string) => void;
  navigate: (view: string) => void;
  onRegisterVerify: (email: string) => void;
  onAuthSuccess: (mode: "login" | "register", data: Record<string, unknown>) => Promise<void>;
  onForgotDone: () => void;
  onResetDone: () => void;
}
