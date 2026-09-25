import { syncWebPushIfGranted } from "@/lib/web-push";
import type { ApiClient } from "./api";

type Notice = {
  id: number | string;
  kind?: string;
  body?: string;
  from_id?: number | string | null;
};

type InboxState = {
  view: string;
  chatId: number | null;
  user: Record<string, any> | null;
  likesIn: number;
  unread: number;
  matches: any[];
};

type InboxDeps = {
  api: ApiClient;
  root: HTMLElement;
  state: InboxState;
  pageTitle: string;
  toast: (message: string, action?: () => Promise<void>) => void;
  pingBrowser: (message: string) => void;
  pip: (count: number) => string;
  loadLikes: () => Promise<unknown>;
  openChat: (id: number | string) => Promise<void>;
  refreshMe: () => Promise<unknown>;
  render: () => void;
};

export function createInboxController({
  api,
  root,
  state,
  pageTitle,
  toast,
  pingBrowser,
  pip,
  loadLikes,
  openChat,
  refreshMe,
  render,
}: InboxDeps) {
  const seenNotices = new Set<number | string>();
  let timer = 0;

  const noticeAction = (note: Notice) => async () => {
    if (!note) return;
    if (note.kind === "like") {
      state.view = "likes";
      if (state.user) await loadLikes();
      render();
      return;
    }
    if (note.kind === "match") {
      state.view = "matches";
      if (state.user) {
        const data = await api<{ matches?: any[] }>("/api/matches");
        state.matches = data.matches || [];
      }
      render();
      if (note.from_id) {
        try {
          await openChat(note.from_id);
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err));
        }
      }
      return;
    }
    if (note.kind === "referral") {
      state.view = "profile";
      if (state.user) await refreshMe();
      render();
      return;
    }
    if (note.from_id) {
      await openChat(note.from_id);
      return;
    }
    state.view = "matches";
    render();
  };

  const syncChrome = () => {
    const total = (state.likesIn || 0) + (state.unread || 0);
    document.title = total ? `(${total > 9 ? "9+" : total}) WIRING` : pageTitle;
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      const count = el.dataset.count === "likes" ? state.likesIn || 0 : state.unread || 0;
      el.innerHTML = pip(count);
    });
  };

  const applyInbox = async (data: any, { announce = true } = {}) => {
    const prevLikes = state.likesIn || 0;
    const prevUnread = state.unread || 0;
    state.likesIn = data.likes_in || 0;
    state.unread = data.unread || 0;
    if (state.user) {
      state.user.likes_in = state.likesIn;
      state.user.unread = state.unread;
    }
    syncChrome();
    const fresh = (data.notices || []).filter((note: Notice) => !seenNotices.has(note.id));
    const shown: Array<number | string> = [];
    for (const note of fresh) {
      seenNotices.add(note.id);
      const inChat = state.view === "chat" && state.chatId === Number(note.from_id) && note.kind === "message";
      if (inChat || !announce) continue;
      const noticesOn = state.user?.notify_enabled !== false;
      if (!noticesOn) continue;
      toast(note.body || "новое уведомление", noticeAction(note));
      pingBrowser(note.body || "новое уведомление");
      shown.push(note.id);
    }
    if (shown.length) {
      api("/api/notices/read", { method: "POST", body: JSON.stringify({ ids: shown }) }).catch(() => {});
    }
    if (announce && state.likesIn > prevLikes && state.view === "likes") {
      await loadLikes();
      render();
    }
    if (announce && state.view === "matches") {
      const gotMatch = fresh.some((note: Notice) => note.kind === "match");
      if (gotMatch || state.unread > prevUnread) {
        const matches = await api<{ matches?: any[] }>("/api/matches");
        state.matches = matches.matches || [];
        render();
      }
    }
  };

  const pollInbox = async () => {
    if (!state.user) return;
    try {
      const data = await api("/api/inbox");
      await applyInbox(data);
    } catch {
      /* keep last counts */
    }
  };

  const start = () => {
    clearInterval(timer);
    if (!state.user) return;
    syncWebPushIfGranted(api, state.user);
    timer = window.setInterval(pollInbox, 20000);
  };

  const stop = () => {
    clearInterval(timer);
    timer = 0;
    document.title = pageTitle;
  };

  return { applyInbox, pollInbox, start, stop, syncChrome };
}
