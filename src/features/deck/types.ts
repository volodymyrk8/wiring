import type { CatalogItem, PlaceBlock, ProfileUser } from "@/features/profile/types";

export type DeckFilters = {
  neuro: string[];
  vibe: string[];
  intents: string[];
  min_age: number;
  max_age: number;
  city: string;
  real_only?: boolean;
};

export type DeckCard = {
  id: number;
  name?: string;
  age?: number | string;
  city?: string;
  job?: string;
  height?: number | string | null;
  gender?: string;
  looking_for?: string;
  intent?: string;
  intents?: string[];
  photo?: unknown;
  photos?: unknown[];
  bio?: string;
  neuro?: string[];
  vibe?: string[];
  online?: boolean;
};

export type DeckCatalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  genders?: CatalogItem[];
  looking_for?: CatalogItem[];
  places?: PlaceBlock[];
};

export type DeckHostBridge = {
  user: ProfileUser;
  catalog: DeckCatalog;
  cards: DeckCard[];
  index: number;
  filters: DeckFilters;
  filtersOpen: boolean;
  recycled: boolean;
  passed: number;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  loadFeed: (filters?: DeckFilters) => Promise<{
    cards?: DeckCard[];
    recycled?: boolean;
    passed?: number;
  }>;
  swipe: (direction: "like" | "pass" | "snooze") => Promise<void>;
  rewind: () => Promise<void>;
  restart: () => Promise<void>;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  onUserUpdated: (user: ProfileUser) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout: () => void;
};
