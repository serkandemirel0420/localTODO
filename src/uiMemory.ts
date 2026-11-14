import type { TodoFilters } from './todos';
import { createAsyncMutationQueue } from './asyncMutationQueue';

export type NewItemDraft = {
  text: string; content: string; pinned: boolean; tags: string[]; filters: TodoFilters;
};
type Memory = { offsets: Record<string, number>; draft: NewItemDraft | null };
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
const storageKey = 'local-todo.ui-memory.v1';

export function createUiMemoryStore(storage: Storage) {
  let memory: Memory = { offsets: {}, draft: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const enqueue = createAsyncMutationQueue();
  const ready = storage.getItem(storageKey).then(raw => {
    if (!raw) return;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return;
    if (value.offsets && typeof value.offsets === 'object') {
      for (const [key, offset] of Object.entries(value.offsets)) {
        if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 0) memory.offsets[key] = offset;
      }
    }
    const draft = value.draft;
    if (draft && typeof draft.text === 'string' && typeof draft.content === 'string' &&
        draft.filters && typeof draft.filters === 'object') {
      memory.draft = { text: draft.text, content: draft.content, pinned: draft.pinned === true,
        tags: Array.isArray(draft.tags) ? draft.tags.filter((tag: unknown) => typeof tag === 'string') : [],
        filters: draft.filters };
    }
  }).catch(() => undefined);
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    await ready;
    const snapshot = JSON.stringify(memory);
    await enqueue(() => storage.setItem(storageKey, snapshot));
  };
  const changed = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush().catch(() => undefined); }, 200);
  };
  return {
    ready: () => ready,
    flush,
    offset: (key: string) => memory.offsets[key],
    rememberOffset(key: string, offset: number) {
      if (!Number.isFinite(offset) || offset < 0) return;
      memory.offsets[key] = offset;
      changed();
    },
    draft: () => memory.draft ? JSON.parse(JSON.stringify(memory.draft)) as NewItemDraft : null,
    rememberDraft(draft: NewItemDraft | null) {
      memory.draft = draft && (draft.text.length || draft.content.length)
        ? JSON.parse(JSON.stringify(draft)) : null;
      changed();
    },
    clearSubmittedDraft(draft: NewItemDraft) {
      if (JSON.stringify(memory.draft) !== JSON.stringify(draft)) return;
      memory.draft = null;
      changed();
    },
  };
}
