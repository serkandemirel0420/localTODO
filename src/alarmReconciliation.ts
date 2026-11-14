export type IdentifiedAlarmRequest = {
  identifier: string;
};

export type AlarmReconciliationFailure = {
  error: unknown;
  identifier: string;
};

export type AlarmReconciliationResult = {
  cancellationFailures: AlarmReconciliationFailure[];
  schedulingFailures: AlarmReconciliationFailure[];
};

/**
 * Updates desired alarms independently, then removes obsolete alarms. Existing
 * desired alarms remain intact if their replacement cannot be scheduled.
 */
export const reconcileAlarmRequests = async <TRequest extends IdentifiedAlarmRequest>(
  existingIdentifiers: Iterable<string>,
  desiredRequests: readonly TRequest[],
  schedule: (request: TRequest) => Promise<unknown>,
  cancel: (identifier: string) => Promise<unknown>,
): Promise<AlarmReconciliationResult> => {
  const requestsByIdentifier = new Map<string, TRequest>();
  desiredRequests.forEach((request) => {
    requestsByIdentifier.set(request.identifier, request);
  });

  const schedulingFailures: AlarmReconciliationFailure[] = [];
  for (const request of requestsByIdentifier.values()) {
    try {
      await schedule(request);
    } catch (error) {
      schedulingFailures.push({ error, identifier: request.identifier });
    }
  }

  const cancellationFailures: AlarmReconciliationFailure[] = [];
  for (const identifier of new Set(existingIdentifiers)) {
    if (requestsByIdentifier.has(identifier)) {
      continue;
    }

    try {
      await cancel(identifier);
    } catch (error) {
      cancellationFailures.push({ error, identifier });
    }
  }

  return { cancellationFailures, schedulingFailures };
};
