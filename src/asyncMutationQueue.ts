export type EnqueueAsyncMutation = <T>(mutation: () => Promise<T>) => Promise<T>;

export const createAsyncMutationQueue = (): EnqueueAsyncMutation => {
  let tail: Promise<void> = Promise.resolve();

  return <T>(mutation: () => Promise<T>) => {
    const queuedMutation = tail.then(mutation, mutation);
    tail = queuedMutation.then(
      () => undefined,
      () => undefined,
    );
    return queuedMutation;
  };
};
