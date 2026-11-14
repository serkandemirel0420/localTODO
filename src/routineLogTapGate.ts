export function createRoutineLogTapGate() {
  let target: string | null = null;
  let count = 0;
  let lastTap = 0;
  let startedAt = 0;
  const reset = () => { target = null; count = 0; lastTap = 0; startedAt = 0; };
  return {
    reset,
    tap(id: string, now = Date.now()): boolean {
      if (id !== target || now < lastTap || now - lastTap > 1500 || now - startedAt > 4500) {
        target = id; count = 0; startedAt = now;
      }
      lastTap = now;
      count += 1;
      if (count !== 4) return false;
      reset();
      return true;
    },
  };
}
