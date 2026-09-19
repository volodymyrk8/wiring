export type ChatUser = {
  id?: number;
  name?: string;
  age?: number | string;
  photo?: string;
  plus?: boolean;
  [key: string]: unknown;
};

export type ChatMatch = ChatUser & {
  id: number;
  last_message?: string;
  last_at?: number;
  last_from_id?: number;
  unread?: number;
};

export type ChatReply = {
  id: number;
  body?: string;
  has_photo?: boolean;
  mine?: boolean;
};

export type ChatMessage = {
  id: number;
  from_id: number;
  mine?: boolean;
  body?: string;
  photo_url?: string;
  created_at: number;
  read?: boolean;
  reply_to?: ChatReply | null;
};

export type ChatThread = {
  peer: ChatUser & { id: number; name: string };
  messages: ChatMessage[];
  openers?: string[];
};

export type ChatMode = "matches" | "chat";

export type ChatHostBridge = {
  mode: ChatMode;
  chatId?: number;
  user: ChatUser;
  matches?: ChatMatch[];
  basePath: string;
  hrefFor: (view: string, params?: Record<string, string | number>) => string;
  navigate: (view: string, params?: Record<string, string | number>) => void;
  api: (path: string, init?: RequestInit) => Promise<any>;
  toast: (message: string) => void;
  onThemeSelect?: (theme: string) => void;
  onLogout?: () => void;
};
