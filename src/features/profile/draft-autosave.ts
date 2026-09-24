export type SaveState = {
  phase: "idle" | "waiting" | "saving" | "saved" | "error";
  local: boolean;
  error: string;
};

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
type Options<T, R> = {
  key: string;
  initial: T;
  restored: boolean;
  storage: () => Storage;
  save: (value: T, publish: boolean) => Promise<R>;
  onSaved: (response: R) => void;
  onState: (state: SaveState) => void;
  delay?: number;
};

// Preserve request order even when the profile is unmounted and opened again.
const queues = new Map<string, Promise<unknown>>();
function serialize<R>(key: string, action: () => Promise<R>): Promise<R> {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  }).catch(() => {});
  return next;
}

export function createDraftAutosave<T, R>(options: Options<T, R>) {
  let value = options.initial;
  let revision = 0;
  let savedRevision = options.restored ? -1 : 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: { revision: number; publish: boolean; promise: Promise<R | undefined> } | undefined;
  let state: SaveState = { phase: options.restored ? "waiting" : "idle", local: options.restored, error: "" };

  const emit = (patch: Partial<SaveState>) => {
    state = { ...state, ...patch };
    if (!disposed) options.onState(state);
  };
  const cancelTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const persist = () => {
    try {
      options.storage().setItem(options.key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const schedule = () => {
    cancelTimer();
    if (disposed || revision === savedRevision) return;
    timer = setTimeout(() => { void save().catch(() => {}); }, options.delay ?? 1400);
  };

  const save = (publish = false): Promise<R | undefined> => {
    cancelTimer();
    if (disposed || (!publish && revision === savedRevision)) return Promise.resolve(undefined);
    if (current?.revision === revision && current.publish === publish) return current.promise;
    const snapshot = value;
    const version = revision;
    const serialized = JSON.stringify(snapshot);
    emit({ phase: "saving", local: persist(), error: "" });
    const promise = serialize(options.key, async () => {
      // Obsolete drafts waiting behind a request need not overwrite newer work.
      if (disposed || (!publish && version !== revision)) return undefined;
      try {
        const response = await options.save(snapshot, publish);
        if (disposed) return response;
        if (version === revision) {
          savedRevision = version;
          try {
            const storage = options.storage();
            if (storage.getItem(options.key) === serialized) storage.removeItem(options.key);
          } catch { /* A confirmed server save is still safe if storage is unavailable. */ }
          emit({ phase: "saved", error: "" });
          options.onSaved(response);
        }
        return response;
      } catch (error) {
        if (!disposed && version === revision) {
          emit({ phase: "error", error: error instanceof Error ? error.message : "Не удалось сохранить анкету" });
        }
        throw error;
      }
    });
    current = { revision: version, publish, promise };
    void promise.finally(() => {
      if (current?.promise === promise) current = undefined;
    }).catch(() => {});
    return promise;
  };

  return {
    get value() { return value; },
    get state() { return state; },
    start() { schedule(); },
    update(next: T) {
      if (disposed || JSON.stringify(next) === JSON.stringify(value)) return;
      value = next;
      revision += 1;
      emit({ phase: "waiting", local: persist(), error: "" });
      schedule();
    },
    save,
    dispose() { disposed = true; cancelTimer(); },
  };
}
