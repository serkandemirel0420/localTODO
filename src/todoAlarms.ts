import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  CUSTOM_DATE_LABEL,
  formatDateFilterValue,
  LATER_DATE_LABEL,
  parseISODateLabel,
  startOfDay,
} from './dates';
import {
  decodeTodoReminder,
  formatReminderClockLabel,
  formatRepeatLabel,
  type ReminderTime,
  type RepeatPreset,
} from './reminders';
import { type Todo } from './todos';

const TODO_ALARM_CHANNEL_ID = 'todo-alarms';
const TODO_ALARM_IDENTIFIER_PREFIX = 'local-todo:todo-alarm:';
const MINIMUM_ONE_TIME_DELAY_MS = 1000;

const RELATIVE_DATE_OFFSETS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  'this week': 2,
  'next week': 7,
};

let channelPromise: Promise<void> | null = null;
let permissionPromise: Promise<boolean> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    priority: Notifications.AndroidNotificationPriority.HIGH,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const canScheduleNotifications = () => Platform.OS !== 'web';

const getTodoAlarmIdentifier = (todoId: string) =>
  `${TODO_ALARM_IDENTIFIER_PREFIX}${todoId}`;

const getTodoIdFromAlarmIdentifier = (identifier: string) => (
  identifier.startsWith(TODO_ALARM_IDENTIFIER_PREFIX)
    ? identifier.slice(TODO_ALARM_IDENTIFIER_PREFIX.length)
    : null
);

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

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const resolveTodoAlarmDate = (
  dateLabels: string[],
  now = new Date(),
): Date | null => {
  const label = dateLabels[0]?.trim();
  const normalizedLabel = label ? formatDateFilterValue(label) : '';
  if (
    !normalizedLabel
    || normalizedLabel === LATER_DATE_LABEL
    || normalizedLabel === CUSTOM_DATE_LABEL
  ) {
    return null;
  }

  const customDate = parseISODateLabel(normalizedLabel);
  if (customDate) {
    return startOfDay(customDate);
  }

  const dayOffset = RELATIVE_DATE_OFFSETS[normalizedLabel.toLocaleLowerCase()];
  if (dayOffset === undefined) {
    return null;
  }

  return addDays(startOfDay(now), dayOffset);
};

const getOneTimeAlarmDate = (
  time: ReminderTime,
  explicitDate: Date | null,
  now = new Date(),
) => {
  const scheduledDate = new Date(explicitDate ?? now);
  scheduledDate.setHours(time.hours, time.minutes, 0, 0);

  if (!explicitDate && scheduledDate.getTime() <= now.getTime()) {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
  }

  return scheduledDate.getTime() - now.getTime() >= MINIMUM_ONE_TIME_DELAY_MS
    ? scheduledDate
    : null;
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

const createTodoAlarmTrigger = (
  todo: Todo,
  now = new Date(),
): Notifications.NotificationTriggerInput => {
  const { repeat, time } = decodeTodoReminder(todo.filters.reminder);
  if (!time) {
    return null;
  }

  const date = resolveTodoAlarmDate(todo.filters.date, now);

  if (repeat !== 'none') {
    return createRepeatingTrigger(repeat, time, date, now);
  }

  const alarmDate = getOneTimeAlarmDate(time, date, now);
  if (!alarmDate) {
    return null;
  }

  return {
    channelId: TODO_ALARM_CHANNEL_ID,
    date: alarmDate,
    type: Notifications.SchedulableTriggerInputTypes.DATE,
  };
};

const createTodoAlarmRequest = (
  todo: Todo,
  now = new Date(),
): Notifications.NotificationRequestInput | null => {
  if (todo.done) {
    return null;
  }

  const reminder = decodeTodoReminder(todo.filters.reminder);
  if (!reminder.time) {
    return null;
  }

  const trigger = createTodoAlarmTrigger(todo, now);
  if (!trigger) {
    return null;
  }

  const repeatLabel = reminder.repeat === 'none'
    ? ''
    : ` (${formatRepeatLabel(reminder.repeat)})`;

  return {
    content: {
      body: todo.content || todo.text,
      data: {
        todoId: todo.id,
        type: 'todo-reminder',
      },
      priority: Notifications.AndroidNotificationPriority.HIGH,
      sound: 'default',
      subtitle: `${formatReminderClockLabel(reminder.time)}${repeatLabel}`,
      title: 'Todo reminder',
    },
    identifier: getTodoAlarmIdentifier(todo.id),
    trigger,
  };
};

export const cancelTodoAlarm = async (todoId: string) => {
  if (!canScheduleNotifications()) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(
    getTodoAlarmIdentifier(todoId),
  );
};

export const syncTodoAlarm = async (todo: Todo) => {
  if (!canScheduleNotifications()) {
    return;
  }

  await cancelTodoAlarm(todo.id);
  const request = createTodoAlarmRequest(todo);
  if (!request) {
    return;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return;
  }

  await ensureNotificationChannel();
  await Notifications.scheduleNotificationAsync(request);
};

export const reconcileTodoAlarms = async (todos: Todo[]) => {
  if (!canScheduleNotifications()) {
    return;
  }

  const now = new Date();
  const requests = todos
    .map((todo) => createTodoAlarmRequest(todo, now))
    .filter((request): request is Notifications.NotificationRequestInput => (
      request !== null && Boolean(request.identifier)
    ));
  const expectedIdentifiers = new Set(
    requests.map((request) => request.identifier!),
  );
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  await Promise.all(
    scheduled
      .filter((request) => {
        const todoId = getTodoIdFromAlarmIdentifier(request.identifier);
        return todoId !== null && !expectedIdentifiers.has(request.identifier);
      })
      .map((request) => (
        Notifications.cancelScheduledNotificationAsync(request.identifier)
      )),
  );

  if (requests.length === 0) {
    return;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return;
  }

  await ensureNotificationChannel();

  for (const request of requests) {
    await Notifications.cancelScheduledNotificationAsync(request.identifier!);
    await Notifications.scheduleNotificationAsync(request);
  }
};
