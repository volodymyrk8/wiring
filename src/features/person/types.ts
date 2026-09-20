import type { CatalogItem, PlaceBlock, ProfileUser } from "@/features/profile/types";

export type PersonProfile = Omit<ProfileUser, "photo" | "photos"> & {
  photo?: unknown;
  photos?: unknown[];
  id: number;
  name: string;
  age?: number | string;
  gender?: string;
  looking_for?: string;
  height?: number | string | null;
  city?: string;
  job?: string;
  bio?: string;
  communication?: string;
  intents?: string[];
  neuro?: string[];
  vibe?: string[];
  prompts?: Array<{ id: string; answer: string }>;
  matched?: boolean;
  liked_you?: boolean;
  you_liked?: boolean;
  online?: boolean;
};

export type ReportReason = CatalogItem;

export type PersonCatalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  genders?: CatalogItem[];
  looking_for?: CatalogItem[];
  prompts?: CatalogItem[];
  places?: PlaceBlock[];
  report_reasons?: ReportReason[];
};

export type PersonOrigin = "deck" | "likes" | "matches" | "chat" | "profile";

export type PersonHostBridge = {
  user: ProfileUser;
  catalog: PersonCatalog;
  person: PersonProfile;
  personFrom: PersonOrigin;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  swipe: (direction: "like" | "pass" | "snooze") => Promise<void>;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout: () => void;
};
