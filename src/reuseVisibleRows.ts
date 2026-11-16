// Reuse unchanged rows so a section toggle does not invalidate every cell.
export function reuseVisibleRows<T extends { id: string; type: string }>(previous: T[], next: T[]): T[] {
  const byKey = new Map(previous.map((row) => [`${row.type}:${row.id}`, row]));
  return next.map((row) => {
    const old = byKey.get(`${row.type}:${row.id}`);
    if (!old) return row;
    const keys = Object.keys(row) as (keyof T)[];
    if (keys.length !== Object.keys(old).length) return row;
    const equal = keys.every((key) => {
      const a = old[key];
      const b = row[key];
      return Array.isArray(a) && Array.isArray(b)
        ? a.length === b.length && a.every((item, index) => item === b[index])
        : a === b;
    });
    return equal ? old : row;
  });
}
