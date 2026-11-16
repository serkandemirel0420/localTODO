import * as Notifications from 'expo-notifications';
import {
  Alert,
  Linking,
  NativeModules,
  Platform,
} from 'react-native';

import { reconcileAlarmRequests } from './alarmReconciliation';
import { normalizeRoutineNotificationText } from './routineNotificationText';
import { createAsyncMutationQueue } from './asyncMutationQueue';
import {
  resolveDateFilterValueDate,
} from './dates';
import {
  getClockAlignedHabitHours,
  getHabitAnchorClock,
  shouldSuppressHabitNotification,
} from './habitAlarmSchedule';
import {
  decodeTodoReminder,
  formatHabitIntervalLabel,
  formatReminderClockLabel,
  formatRepeatLabel,
  getHabitIntervalParts,
  type HabitIntervalHours,
  type ReminderTime,
  type RepeatPreset,
} from './reminders';
import { type NotificationLogEntry } from './storage/notificationLogStore';
import { addRepeatInterval } from './todoRecurrence';
import { type Todo } from './todos';

const TODO_ALARM_CHANNEL_ID = 'todo-alarms';
const TODO_ALARM_IDENTIFIER_PREFIX = 'local-todo:todo-alarm:';
const HABIT_ALARM_IDENTIFIER_PART = ':habit:';
const MINIMUM_ONE_TIME_DELAY_MS = 1000;
export const DEFAULT_HABIT_QUIET_HOURS_START = 0;
export const DEFAULT_HABIT_QUIET_HOURS_END = 7;

export type TodoAlarmSettings = {
  habitNotificationsPaused: boolean;
  habitQuietHoursEnabled: boolean;
  habitNotificationText?: string;
};

type ExactAlarmNativeModule = {
  canScheduleExactAlarms?: () => Promise<boolean>;
  openExactAlarmSettings?: () => Promise<void>;
  setRoutineNotificationSettings?: (paused: boolean, quiet: boolean) => boolean;
  setRoutineNotificationText?: (text: string) => boolean;
  setNotificationContentVisibility?: (routine: boolean, item: boolean) => boolean;
};

let notificationContentVisibility = { routine: false, item: false };
export const setNotificationContentVisibility = (routine: boolean, item: boolean) => {
  if (exactAlarmModule?.setNotificationContentVisibility?.(routine, item) === false) throw new Error('Could not save notification privacy');
  notificationContentVisibility = { routine, item };
};

let channelPromise: Promise<void> | null = null;
let permissionPromise: Promise<boolean> | null = null;
let exactAlarmPromptVisible = false;
let exactAlarmPromptShown = false;
let todoAlarmSettings: TodoAlarmSettings = {
  habitNotificationsPaused: false,
  habitQuietHoursEnabled: true,
};

export const setTodoAlarmSettings = (settings: TodoAlarmSettings) => {
  todoAlarmSettings = { ...settings };
  exactAlarmModule?.setRoutineNotificationText?.(normalizeRoutineNotificationText(settings.habitNotificationText));
  if (exactAlarmModule?.setRoutineNotificationSettings?.(
    settings.habitNotificationsPaused,
    settings.habitQuietHoursEnabled,
  ) === false) {
    console.warn('[todo-alarms] Could not persist native routine notification settings.');
  }
};

const exactAlarmModule = NativeModules.LocalTodoExactAlarm as
  | ExactAlarmNativeModule
  | undefined;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const suppressed = shouldSuppressHabitNotification(
      notification.request.identifier,
      todoAlarmSettings,
      new Date().getHours(),
    );
    return {
      priority: Notifications.AndroidNotificationPriority.HIGH,
      shouldPlaySound: !suppressed,
      shouldSetBadge: false,
      shouldShowBanner: !suppressed,
      shouldShowList: !suppressed,
    };
  },
});

const canScheduleNotifications = () => Platform.OS !== 'web';

const enqueueAlarmMutation = createAsyncMutationQueue();

const canScheduleExactAlarms = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  const checker = exactAlarmModule?.canScheduleExactAlarms;
  if (!checker) {
    return true;
  }

  return checker().catch(() => true);
};

const openExactAlarmSettings = async () => {
  const opener = exactAlarmModule?.openExactAlarmSettings;
  if (opener) {
    await opener();
    return;
  }

  await Linking.openSettings();
};

const showExactAlarmAccessPrompt = () => {
  if (Platform.OS !== 'android' || exactAlarmPromptVisible || exactAlarmPromptShown) {
    return;
  }

  exactAlarmPromptVisible = true;
  exactAlarmPromptShown = true;
  Alert.alert(
    'Allow on-time reminders?',
    'Android may delay todo alerts while Local Todo is closed unless Alarms & reminders access is allowed.',
    [
      {
        onPress: () => {
          exactAlarmPromptVisible = false;
        },
        style: 'cancel',
        text: 'Not now',
      },
      {
        onPress: () => {
          exactAlarmPromptVisible = false;
          openExactAlarmSettings().catch(() => undefined);
        },
        text: 'Open settings',
      },
    ],
    {
      onDismiss: () => {
        exactAlarmPromptVisible = false;
      },
    },
  );
};

const ensureExactAlarmAccess = async () => {
  if (await canScheduleExactAlarms()) {
    return true;
  }

  showExactAlarmAccessPrompt();
  return false;
};

const ensureTodoAlarmSchedulingReady = async () => {
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return false;
  }

  await ensureNotificationChannel();
  // Exact access improves timing; Expo supports inexact alarms without it.
  // Do not silently leave enabled reminders entirely unscheduled.
  await ensureExactAlarmAccess();
  return true;
};

// One tray entry per routine; coalesce duplicate press callbacks without
// suppressing a deliberate change to the opposite state.
const routinePreviewAttempts = new Map<string, {
  enabled: boolean; requestedAt: number; promise: Promise<void>;
}>();
export const sendRoutineToggleNotification = (todo: Todo, enabled: boolean): Promise<void> => {
  const requestedAt = Date.now();
  const previous = routinePreviewAttempts.get(todo.id);
  if (previous?.enabled === enabled && requestedAt - previous.requestedAt < 1500) {
    return previous.promise;
  }
  const promise = enqueueAlarmMutation(async () => {
    if (!canScheduleNotifications()) return;
    if (!await ensureNotificationPermission()) throw new Error('Notification permission denied');
    await ensureNotificationChannel();
    const reminder = decodeTodoReminder(todo.filters.reminder);
    if (!reminder.habitHours) return;
    const previewIdentifier = `local-todo:routine-preview:${todo.id}`;
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(presented
      .filter(notification => notification.request.identifier.startsWith(`${previewIdentifier}:`))
      .map(notification => Notifications.dismissNotificationAsync(notification.request.identifier)));
    await Notifications.scheduleNotificationAsync({
      identifier: previewIdentifier,
      content: {
        title: notificationContentVisibility.routine ? todo.text : normalizeRoutineNotificationText(todoAlarmSettings.habitNotificationText),
        subtitle: formatHabitIntervalLabel(reminder.habitHours),
        body: `Routine alerts ${enabled ? 'on' : 'off'} · Test notification`,
        data: { type: 'todo-reminder', todoId: todo.id },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: TODO_ALARM_CHANNEL_ID } : null,
    });
  });
  routinePreviewAttempts.set(todo.id, { enabled, requestedAt, promise });
  void promise.catch(() => {
    if (routinePreviewAttempts.get(todo.id)?.promise === promise) routinePreviewAttempts.delete(todo.id);
  });
  return promise;
};

const getTodoAlarmIdentifier = (todoId: string) =>
  `${TODO_ALARM_IDENTIFIER_PREFIX}${todoId}`;

const getHabitAlarmIdentifier = (todoId: string, intervalKey: number | string) =>
  `${getTodoAlarmIdentifier(todoId)}${HABIT_ALARM_IDENTIFIER_PART}${intervalKey}`;

const getTodoIdFromAlarmIdentifier = (identifier: string) => {
  if (!identifier.startsWith(TODO_ALARM_IDENTIFIER_PREFIX)) {
    return null;
  }

  const value = identifier.slice(TODO_ALARM_IDENTIFIER_PREFIX.length);
  const habitPartIndex = value.lastIndexOf(HABIT_ALARM_IDENTIFIER_PART);
  return habitPartIndex >= 0 ? value.slice(0, habitPartIndex) : value;
};

const getTodoAlarmRequestTodoId = (
  request: Notifications.NotificationRequest | null | undefined,
) => {
  if (!request) {
    return null;
  }

  const { data } = request.content;
  const todoId = typeof data.todoId === 'string' ? data.todoId.trim() : '';
  if (data.type === 'todo-reminder' && todoId) {
    return todoId;
  }

  return getTodoIdFromAlarmIdentifier(request.identifier);
};

const getTodoAlarmResponseTodoId = (
  response: Notifications.NotificationResponse | null | undefined,
) => getTodoAlarmRequestTodoId(response?.notification.request);

const getTodoAlarmNotificationLogEntry = (
  notification: Notifications.Notification | null | undefined,
): NotificationLogEntry | null => {
  if (!notification) {
    return null;
  }

  const { request } = notification;
  const todoId = getTodoAlarmRequestTodoId(request);
  if (!todoId) {
    return null;
  }

  const receivedAt = (
    typeof notification.date === 'number' &&
    Number.isFinite(notification.date) &&
    notification.date > 0
  )
    ? notification.date
    : Date.now();
  const requestIdentifier = request.identifier || getTodoAlarmIdentifier(todoId);
  const isRoutine = requestIdentifier.includes(HABIT_ALARM_IDENTIFIER_PART) ||
    requestIdentifier.startsWith('local-todo:routine-preview:');
  const showContent = isRoutine ? notificationContentVisibility.routine : notificationContentVisibility.item;

  return {
    body: showContent ? (request.content.body?.trim() ?? '') : '',
    id: `${requestIdentifier}:${receivedAt}`,
    receivedAt,
    requestIdentifier,
    subtitle: request.content.subtitle?.trim() ?? '',
    title: showContent ? (request.content.title?.trim() || (isRoutine ? 'Routine' : 'Reminder'))
      : isRoutine ? normalizeRoutineNotificationText(todoAlarmSettings.habitNotificationText) : 'Reminder',
    todoId,
  };
};

const dismissPresentedTodoAlarmNotifications = async (
  shouldDismiss: (todoId: string) => boolean,
) => {
  if (!canScheduleNotifications()) {
    return;
  }

  const presentedNotifications = await Notifications
    .getPresentedNotificationsAsync()
    .catch(() => []);
  const dismissals = presentedNotifications.flatMap((notification) => {
    const todoId = getTodoAlarmRequestTodoId(notification.request);

    if (!todoId || !shouldDismiss(todoId)) {
      return [];
    }

    return [
      Notifications
        .dismissNotificationAsync(notification.request.identifier)
        .catch(() => undefined),
    ];
  });

  await Promise.all(dismissals);
};

const getScheduledTodoAlarmIdentifiers = async (
  shouldCancel: (todoId: string) => boolean,
) => {
  const scheduledNotifications = await Notifications
    .getAllScheduledNotificationsAsync();
  const identifiers = new Set<string>();

  scheduledNotifications.forEach((request) => {
    const todoId = getTodoAlarmRequestTodoId(request);
    if (todoId && shouldCancel(todoId)) {
      identifiers.add(request.identifier);
    }
  });

  return identifiers;
};

const getAllScheduledNotificationIdentifiers = async () => {
  const scheduledNotifications = await Notifications
    .getAllScheduledNotificationsAsync();

  return new Set(
    scheduledNotifications
      .map((request) => request.identifier)
      .filter((identifier): identifier is string => Boolean(identifier)),
  );
};

const cancelScheduledTodoAlarmNotifications = async (
  shouldCancel: (todoId: string) => boolean,
  extraIdentifiers: string[] = [],
) => {
  const identifiers = await getScheduledTodoAlarmIdentifiers(shouldCancel);
  extraIdentifiers.forEach((identifier) => identifiers.add(identifier));

  await Promise.all(
    [...identifiers].map((identifier) => (
      Notifications.cancelScheduledNotificationAsync(identifier)
    )),
  );
};

const allowsNotifications = (
  status: Notifications.NotificationPermissionsStatus,
) => (
  status.granted ||
  status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
);

const ensureNotificationPermission = async () => {
  if (!canScheduleNotifications()) {
    return false;
  }

  if (!permissionPromise) {
    permissionPromise = (async () => {
      const existing = await Notifications.getPermissionsAsync();
      if (allowsNotifications(existing)) {
        return true;
      }

      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      return allowsNotifications(requested);
    })().finally(() => {
      permissionPromise = null;
    });
  }

  return permissionPromise;
};

const ensureNotificationChannel = async () => {
  if (Platform.OS !== 'android') {
    return;
  }

  if (!channelPromise) {
    channelPromise = Notifications.setNotificationChannelAsync(
      TODO_ALARM_CHANNEL_ID,
      {
        enableVibrate: true,
        importance: Notifications.AndroidImportance.HIGH,
        name: 'Todo alarms',
        sound: 'default',
      },
    ).then(() => undefined);
  }

  return channelPromise;
};

const resolveTodoAlarmDate = (
  dateLabels: string[],
  now = new Date(),
  anchor?: number,
): Date | null => {
  for (const rawLabel of dateLabels) {
    const label = rawLabel.trim();
    if (!label) {
      continue;
    }

    const date = resolveDateFilterValueDate(label, now, anchor);
    if (date) {
      return date;
    }
  }

  return null;
};

const hasTodoAlarmDateLabel = (dateLabels: string[]) =>
  dateLabels.some((label) => label.trim().length > 0);

const getTimedAlarmDate = (date: Date, time: ReminderTime) => {
  const alarmDate = new Date(date);
  alarmDate.setHours(time.hours, time.minutes, 0, 0);

  return alarmDate;
};

const getOneTimeAlarmDate = (
  time: ReminderTime,
  explicitDate: Date | null,
  now = new Date(),
) => {
  const scheduledDate = getTimedAlarmDate(explicitDate ?? now, time);

  if (!explicitDate && scheduledDate.getTime() <= now.getTime()) {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
  }

  return scheduledDate.getTime() - now.getTime() >= MINIMUM_ONE_TIME_DELAY_MS
    ? scheduledDate
    : null;
};

const getRepeatingAlarmDate = (
  time: ReminderTime,
  repeat: Exclude<RepeatPreset, 'none'>,
  explicitDate: Date,
  now = new Date(),
) => {
  const minimumAlarmTime = now.getTime() + MINIMUM_ONE_TIME_DELAY_MS;
  let dueDate = new Date(explicitDate);
  let alarmDate = getTimedAlarmDate(dueDate, time);
  let safety = 0;

  while (alarmDate.getTime() < minimumAlarmTime && safety < 5000) {
    dueDate = addRepeatInterval(dueDate, repeat);
    alarmDate = getTimedAlarmDate(dueDate, time);
    safety += 1;
  }

  return alarmDate.getTime() >= minimumAlarmTime ? alarmDate : null;
};

const getExpoWeekday = (date: Date) => date.getDay() + 1;

const getMonthlyTriggerDay = (date: Date) => (
  Math.min(date.getDate(), 28)
);

const createRepeatingTrigger = (
  repeat: RepeatPreset,
  time: ReminderTime,
  date: Date | null,
  now = new Date(),
): Notifications.SchedulableNotificationTriggerInput | null => {
  const baseDate = date ?? now;

  if (repeat === 'daily') {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      hour: time.hours,
      minute: time.minutes,
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
    };
  }

  if (repeat === 'weekly') {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      hour: time.hours,
      minute: time.minutes,
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: getExpoWeekday(baseDate),
    };
  }

  if (repeat === 'monthly') {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      day: getMonthlyTriggerDay(baseDate),
      hour: time.hours,
      minute: time.minutes,
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
    };
  }

  if (repeat === 'yearly') {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      day: baseDate.getDate(),
      hour: time.hours,
      minute: time.minutes,
      month: baseDate.getMonth(),
      type: Notifications.SchedulableTriggerInputTypes.YEARLY,
    };
  }

  return null;
};

const createHabitClockTrigger = (
  hour: number,
): Notifications.SchedulableNotificationTriggerInput => ({
  channelId: TODO_ALARM_CHANNEL_ID,
  hour,
  minute: 0,
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
});

export const getHabitNotificationHours = (
  habitInterval: HabitIntervalHours,
  _createdAt: number,
  quietHoursEnabled = true,
): number[] => {
  const { amount, unit } = getHabitIntervalParts(habitInterval);
  if (unit !== 'h') {
    return [];
  }

  return getClockAlignedHabitHours(
    amount,
    quietHoursEnabled,
    DEFAULT_HABIT_QUIET_HOURS_START,
    DEFAULT_HABIT_QUIET_HOURS_END,
  );
};

const createLongHabitTrigger = (
  habitInterval: HabitIntervalHours,
  createdAt: number,
): Notifications.SchedulableNotificationTriggerInput | null => {
  const { amount, unit } = getHabitIntervalParts(habitInterval);
  if (unit === 'h') {
    return null;
  }

  const anchor = new Date(createdAt);
  const clock = getHabitAnchorClock(createdAt, todoAlarmSettings.habitQuietHoursEnabled);
  if (unit === 'd' && amount === 1) {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      ...clock,
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
    };
  }

  if (unit === 'w' && amount === 1) {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      ...clock,
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: anchor.getDay() + 1,
    };
  }

  if (unit === 'm') {
    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      day: anchor.getDate(),
      ...clock,
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
    };
  }

  const secondsPerUnit = unit === 'd' ? 86_400 : 604_800;
  return {
    channelId: TODO_ALARM_CHANNEL_ID,
    repeats: true,
    seconds: amount * secondsPerUnit,
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  };
};

const createTodoAlarmTrigger = (
  todo: Todo,
  now = new Date(),
): Notifications.NotificationTriggerInput => {
  const { repeat, time: reminderTime } = decodeTodoReminder(todo.filters.reminder);
  const date = resolveTodoAlarmDate(todo.filters.date, now, todo.createdAt);
  // A dated item without an explicit reminder is due at 07:00 local time.
  const time = reminderTime ?? (date || repeat === 'daily' ? { hours: 7, minutes: 0 } : null);
  if (!time) {
    return null;
  }
  if (repeat === 'daily') {
    return createRepeatingTrigger(repeat, time, date, now);
  }
  if (date) {
    const alarmDate = repeat === 'none'
      ? getOneTimeAlarmDate(time, date, now)
      : getRepeatingAlarmDate(time, repeat, date, now);
    if (!alarmDate) {
      return null;
    }

    return {
      channelId: TODO_ALARM_CHANNEL_ID,
      date: alarmDate,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    };
  }

  if (hasTodoAlarmDateLabel(todo.filters.date)) {
    return null;
  }

  if (repeat !== 'none') {
    return createRepeatingTrigger(repeat, time, null, now);
  }

  const alarmDate = getOneTimeAlarmDate(time, null, now);
  if (!alarmDate) {
    return null;
  }

  return {
    channelId: TODO_ALARM_CHANNEL_ID,
    date: alarmDate,
    type: Notifications.SchedulableTriggerInputTypes.DATE,
  };
};

type IdentifiedTodoAlarmRequest = Notifications.NotificationRequestInput & {
  identifier: string;
};

const createTodoAlarmRequests = (
  todo: Todo,
  now = new Date(),
): IdentifiedTodoAlarmRequest[] => {
  if (todo.done) {
    return [];
  }

  const reminder = decodeTodoReminder(todo.filters.reminder);
  const dated = resolveTodoAlarmDate(todo.filters.date, now, todo.createdAt);
  if (!reminder.time && !reminder.habitHours && !dated && reminder.repeat !== 'daily') {
    return [];
  }

  const repeatLabel = reminder.repeat === 'none'
    ? ''
    : ` (${formatRepeatLabel(reminder.repeat)})`;
  const subtitle = reminder.habitHours
    ? formatHabitIntervalLabel(reminder.habitHours)
    : reminder.time || dated || reminder.repeat === 'daily'
      ? `${formatReminderClockLabel(reminder.time ?? { hours: 7, minutes: 0 })}${repeatLabel}`
      : '';
  const showContent = reminder.habitHours ? notificationContentVisibility.routine : notificationContentVisibility.item;
  const title = showContent ? todo.text : reminder.habitHours
    ? normalizeRoutineNotificationText(todoAlarmSettings.habitNotificationText) : 'Reminder';
  const body = showContent ? (todo.content?.trim() || null) : null;
  const content: Notifications.NotificationContentInput = {
    body,
    data: {
      todoId: todo.id,
      type: 'todo-reminder',
      ...(Platform.OS === 'android' && reminder.repeat === 'daily' && dated
        ? { dailyStartAt: getTimedAlarmDate(dated, reminder.time ?? { hours: 7, minutes: 0 }).getTime() }
        : {}),
    },
    priority: Notifications.AndroidNotificationPriority.HIGH,
    sound: 'default',
    subtitle,
    title,
  };

  if (reminder.habitHours) {
    if (
      todoAlarmSettings.habitNotificationsPaused ||
      !reminder.habitNotificationsEnabled
    ) {
      return [];
    }

    const { unit } = getHabitIntervalParts(reminder.habitHours);
    if (unit === 'h') {
      return getHabitNotificationHours(
        reminder.habitHours,
        todo.createdAt,
        todoAlarmSettings.habitQuietHoursEnabled,
      ).map((hour) => ({
        content,
        identifier: getHabitAlarmIdentifier(todo.id, hour),
        trigger: createHabitClockTrigger(hour),
      }));
    }

    const trigger = createLongHabitTrigger(reminder.habitHours, todo.createdAt);
    return trigger ? [{
      content,
      identifier: getHabitAlarmIdentifier(todo.id, reminder.habitHours),
      trigger,
    }] : [];
  }

  const trigger = createTodoAlarmTrigger(todo, now);
  if (!trigger) {
    return [];
  }

  return [{
    content: {
      ...content,
    },
    identifier: getTodoAlarmIdentifier(todo.id),
    trigger,
  }];
};

export const consumeLastTodoAlarmNotificationResponse = async (
  onNotification?: (entry: NotificationLogEntry) => void,
) => {
  if (!canScheduleNotifications()) {
    return null;
  }

  const response = await Notifications.getLastNotificationResponseAsync();
  const todoId = getTodoAlarmResponseTodoId(response);

  if (todoId) {
    const logEntry = getTodoAlarmNotificationLogEntry(response?.notification);
    if (logEntry) {
      onNotification?.(logEntry);
    }
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }

  return todoId;
};

export const addTodoAlarmResponseListener = (
  openTodo: (todoId: string) => void,
  onNotification?: (entry: NotificationLogEntry) => void,
) => {
  if (!canScheduleNotifications()) {
    return { remove: () => undefined };
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    const todoId = getTodoAlarmResponseTodoId(response);
    if (todoId) {
      const logEntry = getTodoAlarmNotificationLogEntry(response.notification);
      if (logEntry) {
        onNotification?.(logEntry);
      }
      openTodo(todoId);
    }
  });
};

export const addTodoAlarmReceivedListener = (
  onNotification: (entry: NotificationLogEntry) => void,
) => {
  if (!canScheduleNotifications()) {
    return { remove: () => undefined };
  }

  return Notifications.addNotificationReceivedListener((notification) => {
    if (shouldSuppressHabitNotification(
      notification.request.identifier,
      todoAlarmSettings,
      new Date().getHours(),
    )) {
      return;
    }
    const logEntry = getTodoAlarmNotificationLogEntry(notification);
    if (logEntry) {
      onNotification(logEntry);
    }
  });
};

export const getPresentedTodoAlarmNotificationLogEntries = async () => {
  if (!canScheduleNotifications()) {
    return [];
  }

  const presentedNotifications = await Notifications
    .getPresentedNotificationsAsync()
    .catch(() => []);

  return presentedNotifications
    .map(getTodoAlarmNotificationLogEntry)
    .filter((entry): entry is NotificationLogEntry => Boolean(entry));
};

const cancelTodoAlarmNow = async (todoId: string) => {
  if (!canScheduleNotifications()) {
    return;
  }

  await cancelScheduledTodoAlarmNotifications(
    (notificationTodoId) => notificationTodoId === todoId,
    [getTodoAlarmIdentifier(todoId)],
  );
  await dismissPresentedTodoAlarmNotifications((notificationTodoId) => (
    notificationTodoId === todoId
  ));
};

export const cancelTodoAlarm = (todoId: string) => enqueueAlarmMutation(
  () => cancelTodoAlarmNow(todoId),
);

const formatAlarmMutationFailure = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

const warnAboutAlarmMutationFailures = (
  operation: string,
  failures: Awaited<ReturnType<typeof reconcileAlarmRequests>>,
) => {
  failures.schedulingFailures.forEach(({ error, identifier }) => {
    console.warn(
      `[todo-alarms] ${operation} could not schedule ${identifier}: ${
        formatAlarmMutationFailure(error)
      }`,
    );
  });
  failures.cancellationFailures.forEach(({ error, identifier }) => {
    console.warn(
      `[todo-alarms] ${operation} could not cancel ${identifier}: ${
        formatAlarmMutationFailure(error)
      }`,
    );
  });
};

const syncTodoAlarmNow = async (todo: Todo) => {
  if (!canScheduleNotifications()) {
    return;
  }

  const requests = createTodoAlarmRequests(todo);
  if (requests.length === 0) {
    await cancelTodoAlarmNow(todo.id);
    return;
  }

  const schedulingReady = await ensureTodoAlarmSchedulingReady();

  const existingIdentifiers = await getScheduledTodoAlarmIdentifiers(
    (notificationTodoId) => notificationTodoId === todo.id,
  );
  const result = await reconcileAlarmRequests(
    existingIdentifiers,
    requests,
    (request) => schedulingReady ? Notifications.scheduleNotificationAsync(request) : Promise.resolve(),
    (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
  );
  warnAboutAlarmMutationFailures(`syncing todo ${todo.id}`, result);
};

export const syncTodoAlarm = (todo: Todo) => enqueueAlarmMutation(
  () => syncTodoAlarmNow(todo),
);

const reconcileTodoAlarmsNow = async (todos: Todo[]) => {
  if (!canScheduleNotifications()) {
    return;
  }

  const now = new Date();
  const requests = todos
    .flatMap((todo) => createTodoAlarmRequests(todo, now));
  const currentTodoIds = new Set(todos.map((todo) => todo.id));

  await dismissPresentedTodoAlarmNotifications((todoId) => !currentTodoIds.has(todoId));

  if (requests.length === 0) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const schedulingReady = await ensureTodoAlarmSchedulingReady();

  const existingIdentifiers = await getAllScheduledNotificationIdentifiers();
  const result = await reconcileAlarmRequests(
    existingIdentifiers,
    requests,
    (request) => schedulingReady ? Notifications.scheduleNotificationAsync(request) : Promise.resolve(),
    (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
  );
  warnAboutAlarmMutationFailures('reconciling alarms', result);
};

export const reconcileTodoAlarms = (todos: Todo[]) => enqueueAlarmMutation(
  () => reconcileTodoAlarmsNow(todos),
);
