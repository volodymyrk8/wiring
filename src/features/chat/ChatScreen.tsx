import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { AppHeader, Button, GuestFlowSteps, Modal, ProfileMenu } from "@/components/ui";
import { profileMenuAvatarUrl } from "@/lib/profile-photo";
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
  const initial = [...String(name || "?").trim()][0]?.toUpperCase() || "?";
  const hue = [...String(name || "?")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 38% 32%)"/><stop offset="1" stop-color="hsl(${(hue + 36) % 360} 42% 22%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="32" dominant-baseline="central" text-anchor="middle" fill="#d8ff3c" font-size="26" font-family="Georgia">${initial}</text></svg>`);
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

const replyText = (message: ChatMessage) => {
  if (message.transcript) return message.transcript;
  if (message.audio_url) return "голосовое";
  if (message.photo_url && !message.body) return "фото";
  return message.body || "сообщение";
};

const clock = (seconds: number) => {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

const MicIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" />
  </svg>
);

function ChatHeader({ host }: { host: ChatHostBridge }) {
  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };

  const signedOut = !host.user;

  return (
    <AppHeader
      homeHref={host.hrefFor("home")}
      onHomeClick={navigate("home")}
      sectionTitle="чаты"
      showThemeSwatches
      onThemeSelect={host.onThemeSelect}
      rightSlot={
        signedOut ? (
          <a class="icon-btn profile-slot" href={host.hrefFor("login")} onClick={navigate("login")} aria-label="войти">
            <UserIcon />
          </a>
        ) : (
          <ProfileMenu
            avatarUrl={profileMenuAvatarUrl(host.basePath, host.user!.photo)}
            userName={String(host.user!.name || "")}
            isPlus={Boolean(host.user!.plus)}
            profileHref={host.hrefFor("profile")}
            consentsHref={host.hrefFor("consents")}
            plusHref={host.hrefFor("plus")}
            notificationsHref={host.hrefFor("notifications")}
            onProfileClick={navigate("profile")}
            onConsentsClick={navigate("consents")}
            onPlusClick={navigate("plus")}
            onNotificationsClick={navigate("notifications")}
            onLogout={host.onLogout}
          />
        )
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
          <p>{match.last_message ? `${match.last_from_id === host.user?.id ? "ты: " : ""}${match.last_message}` : "взаимно · напиши первым"}</p>
        </div>
        {hasUnread ? <span class="unread">{(match.unread || 0) > 9 ? "9+" : match.unread}</span> : null}
      </a>
      <button type="button" class="match-remove" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(); }} aria-label="Убрать чат" title="Убрать чат">
        <TrashIcon />
      </button>
    </div>
  );
}

function MatchesScreen({ host }: { host: ChatHostBridge }) {
  const signedOut = !host.user;
  const [matches, setMatches] = useState<ChatMatch[]>(host.matches || []);
  const [query, setQuery] = useState("");
  const [pendingUnmatch, setPendingUnmatch] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (signedOut) return undefined;
    let alive = true;
    host.api("/api/matches").then((data) => {
      if (alive) setMatches(data.matches || []);
    }).catch((caught) => {
      if (alive) setError(errorMessage(caught, "не удалось загрузить чаты"));
    });
    return () => { alive = false; };
  }, [host, signedOut]);

  useEffect(() => {
    if (signedOut) return undefined;
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
  }, [signedOut]);

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

  const navigate = (view: string, params?: Record<string, string | number>) => (event: JSX.TargetedMouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    event.preventDefault();
    host.navigate(view, params);
  };

  return (
    <div class={styles.root}>
      <ChatHeader host={host} />
      <main class={signedOut ? styles.guestMain : "chat-list-page"}>
        {signedOut ? (
          <section class={styles.empty} aria-label="Чаты">
            <span class={styles.emptyIcon} aria-hidden="true"><ChatIcon /></span>
            <h2>Чаты после мэтча</h2>
            <GuestFlowSteps variant="chats" />
            <div class={styles.guestCta}>
              <Button variant="solid" fullWidth href={host.hrefFor("register")} nav="register" onClick={navigate("register")}>Создать профиль</Button>
              <div class={styles.switchRow}>
                <span class={styles.switchPrompt}>Уже есть профиль?</span>
                <a class={styles.switchLink} href={host.hrefFor("login")} data-nav="login" onClick={navigate("login")}>Войти</a>
              </div>
            </div>
          </section>
        ) : (
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
              <div class="chat-empty">
                <div class="chat-empty-icon"><ChatIcon /></div>
                <h2>Первый мэтч — уже начало</h2>
                <p>Лайкни анкету. Если человек ответит тем же, здесь появится ваш разговор.</p>
                <Button variant="solid" slim href={host.hrefFor("deck")} nav="deck" onClick={navigate("deck")}>
                  перейти в ленту <ArrowIcon />
                </Button>
              </div>
            )}
          </section>
        )}
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

function VoiceNote({ src, duration }: { src: string; duration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const total = Math.max(0, duration || 0);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    const onTime = () => setTime(element.currentTime || 0);
    const onEnd = () => { setPlaying(false); setTime(0); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = () => setFailed(true);
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("ended", onEnd);
    element.addEventListener("pause", onPause);
    element.addEventListener("play", onPlay);
    element.addEventListener("error", onError);
    return () => {
      element.pause();
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("ended", onEnd);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("error", onError);
    };
  }, [src]);

  const toggle = () => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  };

  const shown = playing || time > 0 ? time : total;
  const progress = total > 0 && (playing || time > 0) ? Math.min(100, (time / total) * 100) : 0;
  return (
    <div class="voice-note">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" class="voice-play" onClick={toggle} aria-label={playing ? "пауза" : "слушать"}>{playing ? "❚❚" : "▶"}</button>
      <span class="voice-bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
      <span class="voice-duration">{failed ? "не открывается" : clock(shown)}</span>
    </div>
  );
}

function MessageBubble({
  message,
  host,
  busy,
  onReply,
  onEdit,
  onDelete,
  onTranscribe,
  onJump,
}: {
  message: ChatMessage;
  host: ChatHostBridge;
  busy: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTranscribe: () => void;
  onJump: (id: number) => void;
}) {
  const photo = message.photo_url ? photoUrl(host.basePath, message.photo_url) : "";
  const audio = message.audio_url ? photoUrl(host.basePath, message.audio_url) : "";
  const quote = message.reply_to?.body || (message.reply_to?.has_audio ? "голосовое" : message.reply_to?.has_photo ? "фото" : "");
  return (
    <div class={`bubble-wrap${message.mine ? " mine" : ""}`} data-msg={message.id}>
      <div class={`bubble${message.mine ? " mine" : ""}${photo ? " has-photo" : ""}${audio ? " has-audio" : ""}`}>
        {message.reply_to ? <button type="button" class="bubble-quote" onClick={() => onJump(message.reply_to!.id)}>{quote || "сообщение"}</button> : null}
        {photo ? <a class="bubble-photo" href={photo} target="_blank" rel="noopener"><img src={photo} alt="" decoding="async" /></a> : null}
        {audio ? <VoiceNote src={audio} duration={message.audio_duration || 0} /> : null}
        {message.transcript ? <div class="bubble-transcript">{message.transcript}</div> : null}
        {message.body ? <div class="bubble-body">{message.body}</div> : null}
        <span class="time">
          {message.edited ? <span>изменено</span> : null}
          {chatTimeLabel(message.created_at)}
          {message.mine ? <i class={`receipt${message.read ? " on" : ""}`} title={message.read ? "прочитано" : "отправлено"}>{message.read ? "✓✓" : "✓"}</i> : null}
        </span>
      </div>
      <div class="bubble-actions">
        <button type="button" class="bubble-action" disabled={busy} onClick={onReply}>Ответить</button>
        {audio && !message.transcript ? <button type="button" class="bubble-action" disabled={busy} onClick={onTranscribe}>Расшифровать</button> : null}
        {message.mine && !audio ? <button type="button" class="bubble-action" disabled={busy} onClick={onEdit}>Изменить</button> : null}
        {message.mine ? <button type="button" class="bubble-action" disabled={busy} onClick={onDelete}>Удалить</button> : null}
      </div>
    </div>
  );
}

function ChatThread({ host, chatId, onUnmatchRequest }: { host: ChatHostBridge; chatId: number; onUnmatchRequest: (id: number) => void }) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const discardRecRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => () => {
    discardRecRef.current = true;
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recTimerRef.current) window.clearInterval(recTimerRef.current);
  }, []);

  const jumpTo = (id: number) => {
    const node = threadRef.current?.querySelector(`[data-msg="${id}"]`);
    if (!(node instanceof HTMLElement)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };

  const beginReply = (message: ChatMessage) => {
    setEditing(null);
    setReplyTo(message);
    inputRef.current?.focus();
  };

  const beginEdit = (message: ChatMessage) => {
    setReplyTo(null);
    setEditing(message);
    setDraft(message.body || "");
    inputRef.current?.focus();
  };

  const cancelComposeMode = () => {
    setReplyTo(null);
    setEditing(null);
  };

  const sendMessage = async (event: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || recording) return;
    setSending(true);
    try {
      if (editing) {
        await host.api(`/api/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
        setEditing(null);
      } else {
        await host.api("/api/messages", {
          method: "POST",
          body: JSON.stringify({ to_id: chatId, body, ...(replyTo?.id ? { reply_to_id: replyTo.id } : {}) }),
        });
        setReplyTo(null);
      }
      setDraft("");
      shouldScrollRef.current = true;
      await loadThread(true);
    } catch (caught) {
      host.toast(errorMessage(caught, editing ? "не удалось изменить сообщение" : "не удалось отправить сообщение"));
    } finally {
      setSending(false);
    }
  };

  const stopRecording = (discard: boolean) => {
    discardRecRef.current = discard;
    if (recTimerRef.current) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
    }
  };

  const sendVoiceBlob = async (blob: Blob, seconds: number) => {
    const form = new FormData();
    const type = blob.type || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    form.append("to_id", String(chatId));
    form.append("file", blob, `voice.${ext}`);
    form.append("duration", String(Math.max(1, Math.round(seconds))));
    if (replyTo?.id) form.append("reply_to_id", String(replyTo.id));
    await host.api("/api/messages/voice", { method: "POST", body: form });
    setReplyTo(null);
    shouldScrollRef.current = true;
    await loadThread(true);
  };

  const startRecording = async () => {
    if (sending || recording || editing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      host.toast("этот браузер не записывает голосовые");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRecRef.current = false;
      streamRef.current = stream;
      recorderRef.current = recorder;
      const started = Date.now();
      setRecSeconds(0);
      setRecording(true);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (discardRecRef.current || blob.size < 800) return;
        setSending(true);
        void sendVoiceBlob(blob, seconds).catch((caught) => {
          host.toast(errorMessage(caught, "не удалось отправить голосовое"));
        }).finally(() => setSending(false));
      };
      recorder.start();
      recTimerRef.current = window.setInterval(() => {
        const elapsed = Math.round((Date.now() - started) / 1000);
        setRecSeconds(elapsed);
        if (elapsed >= 90) stopRecording(false);
      }, 250);
    } catch {
      host.toast("разреши микрофон, чтобы записать голосовое");
    }
  };

  const removeMessage = async () => {
    if (!pendingDelete || sending) return;
    setSending(true);
    try {
      await host.api(`/api/messages/${pendingDelete.id}`, { method: "DELETE" });
      if (editing?.id === pendingDelete.id) setEditing(null);
      if (replyTo?.id === pendingDelete.id) setReplyTo(null);
      setPendingDelete(null);
      await loadThread();
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось удалить сообщение"));
    } finally {
      setSending(false);
    }
  };

  const transcribe = async (message: ChatMessage) => {
    if (sending) return;
    setSending(true);
    try {
      const response = await host.api(`/api/messages/${message.id}/transcribe`, { method: "POST" });
      setThread((current) => current ? {
        ...current,
        messages: current.messages.map((item) => item.id === message.id ? { ...item, transcript: response.transcript } : item),
      } : current);
    } catch (caught) {
      host.toast(errorMessage(caught, "не удалось расшифровать"));
    } finally {
      setSending(false);
    }
  };

  const sendPhotos = async (event: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const picked = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (!picked.length || sending || recording || editing) return;
    const files = picked.slice(0, 10);
    if (picked.length > 10) host.toast("за раз можно 10 фото");
    setSending(true);
    let sent = 0;
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("to_id", String(chatId));
        form.append("file", file, file.name || "photo.jpg");
        if (sent === 0 && draft.trim()) form.append("body", draft.trim().slice(0, 500));
        if (sent === 0 && replyTo?.id) form.append("reply_to_id", String(replyTo.id));
        await host.api("/api/messages/photo", { method: "POST", body: form });
        sent += 1;
      }
      setDraft("");
      setReplyTo(null);
      shouldScrollRef.current = true;
      await loadThread(true);
    } catch (caught) {
      if (sent) {
        setDraft("");
        setReplyTo(null);
        shouldScrollRef.current = true;
        await loadThread(true);
      }
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

  const modeTitle = editing ? "Изменить" : replyTo ? "Ответить" : "";
  const modePreview = editing ? (editing.body || "") : replyTo ? replyText(replyTo) : "";

  return (
    <section class="chat-screen">
      <header class={`chat-topbar${modeTitle ? " is-compose" : ""}`}>
        {modeTitle ? (
          <button class="chat-back" type="button" onClick={cancelComposeMode} aria-label="Отменить" title="Отменить"><ArrowIcon /></button>
        ) : (
          <a class="chat-back" href={host.hrefFor("matches")} onClick={navigate("matches")} aria-label="Вернуться к чатам" title="Чаты"><ArrowIcon /></a>
        )}
        {modeTitle ? (
          <div class="chat-peer">
            <span class="chat-peer-copy"><strong>{modeTitle}</strong><small>{modePreview.slice(0, 80)}</small></span>
          </div>
        ) : peer ? (
          <a class="chat-peer" href={host.hrefFor("person", { id: peer.id })} onClick={navigate("person", { id: peer.id })}>
            <img src={avatarUrl(host.basePath, peer.photo, peer.name)} alt="" />
            <span class="chat-peer-copy"><strong>{peer.name}</strong><small>взаимная симпатия</small></span>
          </a>
        ) : <div class="chat-peer"><span class="chat-peer-copy"><strong>Загрузка…</strong></span></div>}
        <div class="chat-top-actions">
          {!modeTitle && peer ? <a class="chat-top-action" href={host.hrefFor("person", { id: peer.id })} onClick={navigate("person", { id: peer.id })} aria-label="Открыть анкету" title="Анкета"><UserIcon /></a> : null}
          {!modeTitle && peer ? <button class="chat-top-action chat-remove-action" type="button" onClick={() => onUnmatchRequest(peer.id)} aria-label="Убрать чат" title="Убрать чат"><TrashIcon /></button> : null}
        </div>
      </header>
      {error ? <p class={styles.error}>{error}</p> : (
        <>
          <div class="thread" ref={threadRef}>
            {thread?.messages?.length ? thread.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                host={host}
                busy={sending || recording}
                onReply={() => beginReply(message)}
                onEdit={() => beginEdit(message)}
                onDelete={() => setPendingDelete(message)}
                onTranscribe={() => void transcribe(message)}
                onJump={jumpTo}
              />
            )) : thread ? (
              <>
                <p class="hint">Напиши первым. Подсказки по анкете — ткни, отредактируй и отправь.</p>
                <div class="openers">{(thread.openers || []).map((opener) => <button key={opener} type="button" class="ghost slim opener" onClick={() => setDraft(opener)}>{opener}</button>)}</div>
              </>
            ) : <p class="hint">загрузка…</p>}
          </div>
          <div class="composer-dock">
            {recording ? (
              <div class="composer is-recording" role="status">
                <button type="button" class="composer-text" onClick={() => stopRecording(true)}>Отмена</button>
                <span class="rec-time">запись {clock(recSeconds)}</span>
                <button type="button" class="composer-send" onClick={() => stopRecording(false)} aria-label="Отправить голосовое">Отправить</button>
              </div>
            ) : (
              <form class={`composer${sending ? " is-sending" : ""}${replyTo || editing ? " is-labeled" : ""}`} onSubmit={sendMessage} aria-busy={sending}>
                <label class="composer-attach" title="до 10 фото" aria-label="прикрепить фото, до 10">
                  <PhotoIcon />
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden disabled={sending || Boolean(editing)} onChange={sendPhotos} />
                </label>
                <button type="button" class="composer-attach" title="голосовое" aria-label="записать голосовое" disabled={sending || Boolean(editing)} onClick={() => void startRecording()}><MicIcon /></button>
                <input ref={inputRef} name="body" maxlength={1000} value={draft} onInput={(event) => setDraft(event.currentTarget.value)} placeholder={editing ? "новый текст" : replyTo ? "добавь ответ" : "написать сообщение"} autocomplete="off" enterKeyHint="send" disabled={sending} />
                <button class="composer-send" type="submit" aria-label={editing ? "Сохранить" : replyTo ? "Ответить" : "Отправить сообщение"} title={editing ? "Сохранить" : replyTo ? "Ответить" : "Отправить"} disabled={sending || !draft.trim()}>{editing ? "OK" : replyTo ? "Ответить" : <SendIcon />}</button>
              </form>
            )}
          </div>
          <Modal
            isOpen={pendingDelete !== null}
            onClose={() => !sending && setPendingDelete(null)}
            title="Удалить сообщение?"
            footer={<>
              <Button variant="ghost" slim disabled={sending} onClick={() => setPendingDelete(null)}>отмена</Button>
              <Button variant="solid" slim disabled={sending} loading={sending} onClick={() => void removeMessage()}>Удалить</Button>
            </>}
          >
            <p class={styles.modalHint}>Оно пропадёт из переписки у вас обоих. Голосовое при этом стирается.</p>
          </Modal>
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
