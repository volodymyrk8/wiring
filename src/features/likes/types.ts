import type { CatalogItem, PlaceBlock, ProfileUser } from "@/features/profile/types";

export type LikesFilters = {
  neuro: string[];
  vibe: string[];
  intents: string[];
  min_age: number;
  max_age: number;
  city: string;
};

export type LikeCard = {
  id?: number;
  hidden?: boolean;
  name?: string;
  age?: number | string;
  city?: string;
  photo?: string | string[];
  bio?: string;
  communication?: string;
  intent?: string;
  intents?: string[];
  neuro?: string[];
  vibe?: string[];
};

export type LikesCatalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  places?: PlaceBlock[];
};

export type LikesHostBridge = {
  user: ProfileUser;
  catalog: LikesCatalog;
  likes: LikeCard[];
  matchesCount: number;
  filters: LikesFilters;
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  loadLikes: (filters: LikesFilters) => Promise<{ likes?: LikeCard[]; plus?: boolean; user?: ProfileUser }>;
  toast: (message: string) => void;
  onUserUpdated: (user: ProfileUser) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout: () => void;
};
