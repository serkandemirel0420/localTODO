export const normalizeRoutineNotificationText = (value: unknown): string =>
  (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '') || 'Routine';
