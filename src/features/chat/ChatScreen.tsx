import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, Modal, ProfileMenu } from "@/components/ui";
import type { ChatHostBridge, ChatMatch, ChatMessage, ChatThread } from "./types";
import styles from "./ChatScreen.module.css";

const errorMessage = (caught: unknown, fallback: string) =>
  caught instanceof Error && caught.message ? caught.message : fallback;

const ArrowIcon = ({ back = false }: { back?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {back ? <path d="m13 6-6 6 6 6M7 12h14" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);

const SearchIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="m16 16 4.6 4.6" />
  </svg>
);

const ChatIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12c0 4.7-4 8.5-9 8.5-1.6 0-3.1-.4-4.4-1.1L3.2 21.2l1.6-3.9C4 15.8 3.2 14 3.2 12c0-4.7 3.8-8.5 9-8.5s8.8 3.8 8.8 8.5z" />
    <circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.2 19c1.4-3.2 4-4.8 6.8-4.8s5.4 1.6 6.8 4.8" />
  </svg>
);

const TrashIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

const ReplyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 17-5-5 5-5" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m21.5 3.5-19 7.3 7.3 2.7 2.7 7.5z" />
    <path d="M9.8 13.5 21.5 3.5" />
  </svg>
);

const PhotoIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9" r="1.4" />
    <path d="m4 17 4.5-4.5 3.5 3 2.5-2.5L20 18" />
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

const photoUrl = (basePath: string, photo: unknown, name = "?") => {
  let value = photo;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") value = (value as { url?: string }).url;
  if (typeof value === "string" && value) {
    if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http")) return value;
    if (value.startsWith(basePath)) return value;
    if (value.startsWith("/")) return `${basePath}${value}`;
    return `${basePath}/public/${value}`;
  }
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 40% 28%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 50% 18%)"/></linearGradient></defs><rect width="400" height="520" fill="url(#g)"/><text x="200" y="280" text-anchor="middle" fill="#d8ff3c" font-size="84" font-family="Georgia">${name.slice(0, 1)}</text></svg>`);
  return `data:image/svg+xml,${svg}`;
};

const avatarUrl = (basePath: string, photo: unknown, name = "?") => {
  const url = photoUrl(basePath, photo, name);
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}s=sm`;
};

const timeLabel = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru", { day: "numeric", month: "short" });
};

const chatTimeLabel = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return `${date.toLocaleDateString("ru", { day: "numeric", month: "short" })}, ${date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
};

const replyText = (message: ChatMessage) => (message.photo_url && !message.body ? "фото" : message.body || "фото");

function ChatHeader({ host }: { host: ChatHostBridge }) {
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };

  return (
    <AppHeader
      homeHref={host.hrefFor("home")}
      onHomeClick={navigate("home")}
      sectionTitle="чаты"
      showThemeSwatches
      onThemeSelect={host.onThemeSelect}
      rightSlot={
        <ProfileMenu
          avatarUrl={avatarUrl(host.basePath, host.user.photo, String(host.user.name || "Профиль"))}
          userName={String(host.user.name || "")}
          isPlus={Boolean(host.user.plus)}
          profileHref={host.hrefFor("profile")}
          consentsHref={host.hrefFor("consents")}
          plusHref={host.hrefFor("plus")}
          onProfileClick={navigate("profile")}
          onConsentsClick={navigate("consents")}
          onPlusClick={navigate("plus")}
          onLogout={host.onLogout}
        />
      }
    />
  );
}

function MatchRow({ match, host, onOpen, onRemove }: { match: ChatMatch; host: ChatHostBridge; onOpen: () => void; onRemove: () => void }) {
  const hasUnread = Boolean(match.unread);
  return (
    <div class="match-wrap">
      <a
        class={`match${hasUnread ? " has-unread" : ""}`}
        href={host.hrefFor("chat", { id: match.id })}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        <img src={avatarUrl(host.basePath, match.photo, match.name)} alt="" width="64" height="64" loading="lazy" />
        <div class="match-body">
          <div class="match-head">
            <h3>{match.name}, {match.age}</h3>
            {match.last_at ? <time class="match-time">{timeLabel(match.last_at)}</time> : null}
          </div>
          <p>{match.last_message ? `${match.last_from_id === host.user.id ? "ты: " : ""}${match.last_message}` : "взаимно · напиши первым"}</p>
        </div>
        {hasUnread ? <span class="unread">{(match.unread || 0) > 9 ? "9+" : match.unread}</span> : null}
      </a>
      <button type="button" class="match-remove" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(); }} aria-label="убрать из чатов" title="убрать из чатов">
        <CloseIcon />
      </button>
    </div>
  );
}

function MatchesScreen({ host }: { host: ChatHostBridge }) {
  const [matches, setMatches] = useState<ChatMatch[]>(host.matches || []);
  const [query, setQuery] = useState("");
  const [pendingUnmatch, setPendingUnmatch] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    host.api("/api/matches").then((data) => {
      if (alive) setMatches(data.matches || []);
    }).catch((caught) => {
      if (alive) setError(errorMessage(caught, "не удалось загрузить чаты"));
    });
    return () => { alive = false; };
  }, [host]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = matches.filter((match) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${match.name || ""} ${match.last_message || ""}`.toLowerCase().includes(needle);
  });

  const confirmUnmatch = async () => {
    if (!pendingUnmatch || busy) return;
    setBusy(true);
    try {
      await host.api("/api/unmatch", { method: "POST", body: JSON.stringify({ user_id: pendingUnmatch }) });
      setMatches((current) => current.filter((match) => match.id !== pendingUnmatch));
      setPendingUnmatch(null);
      host.toast("убрано · в пропущенных");
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось убрать чат"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class={styles.root}>
      <ChatHeader host={host} />
      <main class="chat-list-page">
        <div class="chat-list-intro">
          <p class="chat-list-lede">Здесь можно продолжить разговор без спешки — в своём ритме.</p>
        </div>
        <section class="chat-list-card" aria-label="Список чатов">
          <label class="chat-search">
            <SearchIcon />
            <input ref={searchRef} type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="найти диалог" autocomplete="off" />
            <kbd>⌘ K</kbd>
          </label>
          {error ? <p class={styles.error}>{error}</p> : null}
          {matches.length ? (
            filtered.length ? (
              <div class="match-list">
                {filtered.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    host={host}
                    onOpen={() => host.navigate("chat", { id: match.id })}
                    onRemove={() => setPendingUnmatch(match.id)}
                  />
                ))}
              </div>
            ) : (
              <div class="chat-no-results"><span><SearchIcon /></span><strong>Ничего не нашлось</strong><p>Попробуй поискать по имени или тексту сообщения.</p></div>
            )
          ) : (
            <div class="chat-empty"><div class="chat-empty-icon"><ChatIcon /></div><h2>Первый мэтч — уже начало</h2><p>Лайкни анкету. Если человек ответит тем же, здесь появится ваш разговор.</p><a class="solid" href={host.hrefFor("deck")} onClick={(event) => { event.preventDefault(); host.navigate("deck"); }}>перейти в ленту <ArrowIcon /></a></div>
          )}
        </section>
      </main>
      <Modal
        isOpen={pendingUnmatch !== null}
        onClose={() => !busy && setPendingUnmatch(null)}
        title="Убрать чат?"
        footer={
          <>
            <Button variant="ghost" slim disabled={busy} onClick={() => setPendingUnmatch(null)}>отмена</Button>
            <Button variant="solid" slim disabled={busy} loading={busy} className={styles.dangerButton} onClick={confirmUnmatch}>убрать чат</Button>
          </>
        }
      >
        <p class={styles.modalHint}>Переписка сохранится, но чат исчезнет из списка.</p>
      </Modal>
    </div>
  );
}

function MessageBubble({ message, host, onReply }: { message: ChatMessage; host: ChatHostBridge; onReply: () => void }) {
  const photo = message.photo_url ? photoUrl(host.basePath, message.photo_url) : "";
  return (
    <div class={`bubble${message.mine ? " mine" : ""}${photo ? " has-photo" : ""}`} data-msg={message.id}>
      {message.reply_to ? <div class="bubble-quote">{message.reply_to.has_photo && !message.reply_to.body ? "фото" : message.reply_to.body || "фото"}</div> : null}
      {photo ? <a class="bubble-photo" href={photo} target="_blank" rel="noopener"><img src={photo} alt="" decoding="async" /></a> : null}
      {message.body ? <div class="bubble-body">{message.body}</div> : null}
      <span class="time">
        <button type="button" class="bubble-reply" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReply(); }} title="ответить" aria-label="ответить"><ReplyIcon /></button>
        {chatTimeLabel(message.created_at)}
        {message.mine ? <i class={`receipt${message.read ? " on" : ""}`} title={message.read ? "прочитано" : "отправлено"}>{message.read ? "✓✓" : "✓"}</i> : null}
      </span>
    </div>
  );
}

function ChatThread({ host, chatId, onUnmatchRequest }: { host: ChatHostBridge; chatId: number; onUnmatchRequest: (id: number) => void }) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const element = threadRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  };

  const loadThread = async (scroll = false) => {
    try {
      const element = threadRef.current;
      const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight <= 120;
      const next = await host.api(`/api/messages/${chatId}`) as ChatThread;
      if (scroll || nearBottom) shouldScrollRef.current = true;
      setThread((current) => {
        if (current && current.messages.length !== next.messages.length && nearBottom) shouldScrollRef.current = true;
        return next;
      });
      setError("");
    } catch (caught) {
      setError(errorMessage(caught, "не удалось загрузить переписку"));
    }
  };

  useEffect(() => {
    let alive = true;
    setThread(null);
    setError("");
    shouldScrollRef.current = true;
    host.api(`/api/messages/${chatId}`).then((data) => {
      if (alive) setThread(data as ChatThread);
    }).catch((caught) => {
      if (alive) setError(errorMessage(caught, "не удалось загрузить переписку"));
    });
    const timer = window.setInterval(() => {
      if (alive) void loadThread();
    }, 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [chatId, host]);

  useEffect(() => {
    if (thread && shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToEnd();
    }
  }, [thread?.messages.length]);

  const sendMessage = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await host.api("/api/messages", {
        method: "POST",
        body: JSON.stringify({ to_id: chatId, body, ...(replyTo?.id ? { reply_to_id: replyTo.id } : {}) }),
      });
      setDraft("");
      setReplyTo(null);
      shouldScrollRef.current = true;
      await loadThread(true);
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось отправить сообщение"));
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("to_id", String(chatId));
      form.append("file", file, file.name || "photo.jpg");
      if (draft.trim()) form.append("body", draft.trim().slice(0, 500));
      if (replyTo?.id) form.append("reply_to_id", String(replyTo.id));
      await host.api("/api/messages/photo", { method: "POST", body: form });
      setDraft("");
      setReplyTo(null);
      shouldScrollRef.current = true;
      await loadThread(true);
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось отправить фото"));
    } finally {
      setSending(false);
    }
  };

  const peer = thread?.peer;
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };

  return (
    <section class="chat-screen">
      <header class="chat-topbar">
        <a class="chat-back" href={host.hrefFor("matches")} onClick={navigate("matches")} aria-label="Вернуться к чатам" title="Чаты"><ArrowIcon /></a>
        {peer ? (
          <a class="chat-peer" href={host.hrefFor("person", { id: peer.id })} onClick={navigate("person", { id: peer.id })}>
            <img src={avatarUrl(host.basePath, peer.photo, peer.name)} alt="" />
            <span class="chat-peer-copy"><strong>{peer.name}</strong><small>взаимная симпатия</small></span>
          </a>
        ) : <div class="chat-peer"><span class="chat-peer-copy"><strong>Загрузка…</strong></span></div>}
        <div class="chat-top-actions">
          {peer ? <a class="chat-top-action" href={host.hrefFor("person", { id: peer.id })} onClick={navigate("person", { id: peer.id })} aria-label="Открыть анкету" title="Анкета"><UserIcon /></a> : null}
          {peer ? <button class="chat-top-action chat-remove-action" type="button" onClick={() => onUnmatchRequest(peer.id)} aria-label="Убрать чат" title="Убрать чат"><TrashIcon /></button> : null}
        </div>
      </header>
      {error ? <p class={styles.error}>{error}</p> : (
        <>
          <div class="thread" ref={threadRef}>
            {thread?.messages?.length ? thread.messages.map((message) => (
              <MessageBubble key={message.id} message={message} host={host} onReply={() => { setReplyTo(message); }} />
            )) : thread ? (
              <>
                <p class="hint">Напиши первым. Подсказки по анкете — ткни, отредактируй и отправь.</p>
                <div class="openers">{(thread.openers || []).map((opener) => <button key={opener} type="button" class="ghost slim opener" onClick={() => setDraft(opener)}>{opener}</button>)}</div>
              </>
            ) : <p class="hint">загрузка…</p>}
          </div>
          <div class="composer-dock">
            {replyTo ? <div class="reply-bar"><span><b>ответ на сообщение</b>{replyText(replyTo).slice(0, 90)}</span><button type="button" class="reply-cancel" onClick={() => setReplyTo(null)} aria-label="Отменить ответ"><CloseIcon /></button></div> : null}
            <form class={`composer${sending ? " is-sending" : ""}`} onSubmit={sendMessage} aria-busy={sending}>
              <label class="composer-attach" title="фото" aria-label="прикрепить фото">
                <PhotoIcon />
                <input type="file" accept="image/*" hidden disabled={sending} onChange={sendPhoto} />
              </label>
              <input name="body" maxlength={1000} value={draft} onInput={(event) => setDraft(event.currentTarget.value)} placeholder="написать сообщение" autocomplete="off" enterKeyHint="send" disabled={sending} />
              <button class="composer-send" type="submit" aria-label="Отправить сообщение" title="Отправить" disabled={sending || !draft.trim()}><SendIcon /></button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

export function ChatScreen({ host }: { host: ChatHostBridge }) {
  const [pendingUnmatch, setPendingUnmatch] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmUnmatch = async () => {
    if (!pendingUnmatch || busy) return;
    setBusy(true);
    try {
      await host.api("/api/unmatch", { method: "POST", body: JSON.stringify({ user_id: pendingUnmatch }) });
      setPendingUnmatch(null);
      host.toast("убрано · в пропущенных");
      host.navigate("matches");
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось убрать чат"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {host.mode === "chat" && host.chatId ? <ChatThread host={host} chatId={host.chatId} onUnmatchRequest={setPendingUnmatch} /> : <MatchesScreen host={host} />}
      <Modal
        isOpen={host.mode === "chat" && pendingUnmatch !== null}
        onClose={() => !busy && setPendingUnmatch(null)}
        title="Убрать чат?"
        footer={
          <>
            <Button variant="ghost" slim disabled={busy} onClick={() => setPendingUnmatch(null)}>отмена</Button>
            <Button variant="solid" slim disabled={busy} loading={busy} className={styles.dangerButton} onClick={confirmUnmatch}>убрать чат</Button>
          </>
        }
      >
        <p class={styles.modalHint}>Переписка сохранится, но чат исчезнет из списка.</p>
      </Modal>
    </>
  );
}
