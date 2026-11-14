export type RoutineLog = { id: string; text: string; createdAt: number };

export const normalizeRoutineLogs = (value: unknown): RoutineLog[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): RoutineLog[] => {
    if (!entry || typeof entry.id !== 'string' || !entry.id ||
        typeof entry.text !== 'string' || !entry.text.trim() ||
        typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt) ||
        seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{ id: entry.id, text: entry.text.trim(), createdAt: entry.createdAt }];
  }).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
};
