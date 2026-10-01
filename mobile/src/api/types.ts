export type Photo = string | { url: string; is_primary?: boolean; id?: number };

export type Person = {
  id: number;
  name: string;
  age?: number | string;
  city?: string;
  bio?: string;
  job?: string;
  photo?: string;
  photos?: Photo[];
  neuro?: string[];
  vibe?: string[];
  intents?: string[];
  online?: boolean;
  hidden?: boolean;
};

export type Me = Person & {
  email: string;
  guest?: boolean;
  plus?: boolean;
  needs_profile?: boolean;
  needs_special_consent?: boolean;
  needs_photo_consent?: boolean;
  notify_enabled?: boolean;
  notify_push?: boolean;
  /** Unread chat messages and incoming likes, from /api/me. */
  unread?: number;
  likes_in?: number;
  gender?: string;
  looking_for?: string;
  height?: number | null;
};

export type FeedPage = { cards: Person[]; has_more: boolean; generation?: number };

export type Match = Person & {
  last_message?: string;
  last_at?: number;
  last_from_id?: number;
  unread?: number;
};

export type Message = {
  id: number;
  from_id: number;
  mine?: boolean;
  body?: string;
  photo_url?: string;
  audio_url?: string;
  transcript?: string;
  created_at: number;
};

export type Thread = { peer: Person; messages: Message[]; openers?: string[] };

export type CatalogItem = { id: string; label?: string; name?: string; blurb?: string };
export type Place = { country: string; cities: string[] };
export type Catalog = {
  neuro?: CatalogItem[];
  vibe?: CatalogItem[];
  intents?: CatalogItem[];
  genders?: CatalogItem[];
  looking_for?: CatalogItem[];
  places?: Place[];
  limits?: { photos: number; bio: number };
};
