export type BacklogState = {
  history: string[];
  cursor: number;
  ratings: Record<string, number>;
};

export const emptyBacklog = (): BacklogState => ({ history: [], cursor: -1, ratings: {} });

export const normalizeBacklog = (value: unknown): BacklogState => {
  if (!value || typeof value !== 'object') return emptyBacklog();
  const input = value as Partial<BacklogState>;
  const history = Array.isArray(input.history) ? [...new Set(input.history.filter((id): id is string => typeof id === 'string' && !!id))] : [];
  const ratings: Record<string, number> = {};
  if (input.ratings && typeof input.ratings === 'object') {
    for (const [id, rating] of Object.entries(input.ratings)) {
      if (Number.isInteger(rating) && rating >= 1 && rating <= 10) ratings[id] = rating;
    }
  }
  const cursor = Number.isInteger(input.cursor) ? Math.max(-1, Math.min(input.cursor!, history.length)) : history.length - 1;
  return { history, cursor, ratings };
};

export const nextBacklog = (state: BacklogState, ids: string[], random = Math.random): BacklogState => {
  const eligible = new Set(ids);
  for (let i = state.cursor + 1; i < state.history.length; i++) {
    if (eligible.has(state.history[i])) return { ...state, cursor: i };
  }
  const seen = new Set(state.history);
  const remaining = ids.filter(id => !seen.has(id));
  if (!remaining.length) return { ...state, cursor: state.history.length };
  const id = remaining[Math.min(remaining.length - 1, Math.floor(random() * remaining.length))];
  return { ...state, history: [...state.history, id], cursor: state.history.length };
};

export const previousBacklog = (state: BacklogState, ids: string[]): BacklogState => {
  const eligible = new Set(ids);
  for (let i = Math.min(state.cursor - 1, state.history.length - 1); i >= 0; i--) {
    if (eligible.has(state.history[i])) return { ...state, cursor: i };
  }
  return state;
};
