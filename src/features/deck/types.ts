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
  /** Present when Jev ranking succeeded for this page (experiment). */
  jev_match_pct?: number;
  jev_match_reasons?: string[];
  jev_match_source?: "api" | "local";
};

export type DeckCatalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  genders?: CatalogItem[];
  looking_for?: CatalogItem[];
  places?: PlaceBlock[];
};

export type FeedPage = {
  generation: number;
  cards: DeckCard[];
  has_more: boolean;
  unseen?: number;
  passed?: number;
  liked?: number;
  likes_in?: number;
  unread?: number;
  jev_ranked?: boolean;
  jev_scores?: "api" | "local" | "none";
};

export type DeckHostBridge = {
  user: ProfileUser;
  catalog: DeckCatalog;
  cards: DeckCard[];
  index: number;
  filters: DeckFilters;
  filtersOpen: boolean;
  hasMore: boolean;
  generation: number;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  loadFeed: (filters: DeckFilters, signal?: AbortSignal) => Promise<FeedPage>;
  resetFeed: (generation: number, signal?: AbortSignal) => Promise<{ reset: boolean; generation: number }>;
  onFeedChange: (cards: DeckCard[], index: number, filters: DeckFilters, hasMore: boolean, generation: number) => void;
  onMatch: (match: { id: number; name?: string }) => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  onUserUpdated: (user: ProfileUser) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout: () => void;
};
