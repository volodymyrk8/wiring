export type ProfilePhoto = {
  id: number;
  url: string;
  is_primary?: boolean;
};

export type ProfileUser = {
  id?: number;
  name?: string;
  age?: number | string;
  city?: string;
  gender?: string;
  looking_for?: string;
  height?: number | string | null;
  job?: string;
  bio?: string;
  communication?: string;
  intent?: string;
  intents?: string[];
  neuro?: string[];
  vibe?: string[];
  hide_tags?: string[];
  seek_min_age?: number;
  seek_max_age?: number;
  seek_place?: string;
  prompts?: Array<{ id: string; answer: string }>;
  photos?: ProfilePhoto[];
  photo?: string;
  albums?: Array<{ photos?: ProfilePhoto[] }>;
  plus?: boolean;
  plus_until?: number;
  guest?: boolean;
  needs_profile?: boolean;
  needs_special_consent?: boolean;
  needs_photo_consent?: boolean;
  ref_url?: string;
  ref_days?: number;
  ref_count?: number;
  notify_enabled?: boolean;
  notify_push?: boolean;
  [key: string]: unknown;
};

export type CatalogItem = { id: string; label: string; hint?: string; tip?: string };
export type PlaceBlock = { country: string; cities: string[] };

export type ProfileCatalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  genders?: CatalogItem[];
  looking_for?: CatalogItem[];
  prompts?: CatalogItem[];
  places?: PlaceBlock[];
};

export type ProfileHostBridge = {
  user: ProfileUser;
  catalog: ProfileCatalog;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string) => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  uploadPhoto: (file: File, rightsConsent: boolean) => Promise<unknown>;
  refreshUser: () => Promise<ProfileUser>;
  setPrimaryPhoto: (id: number) => Promise<void>;
  deletePhoto: (id: number) => Promise<void>;
  onUserUpdated: (user: ProfileUser) => void;
  onLogout: () => void;
  onThemeSelect?: (theme: string) => void;
};
