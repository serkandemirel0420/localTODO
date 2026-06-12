import * as Notifications from 'expo-notifications';
import {
  Alert,
  Linking,
  NativeModules,
  Platform,
} from 'react-native';

import {
  resolveDateFilterValueDate,
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

type ExactAlarmNativeModule = {
  canScheduleExactAlarms?: () => Promise<boolean>;
  openExactAlarmSettings?: () => Promise<void>;
};

let channelPromise: Promise<void> | null = null;
let permissionPromise: Promise<boolean> | null = null;
let exactAlarmPromptVisible = false;
let exactAlarmPromptShown = false;

const exactAlarmModule = NativeModules.LocalTodoExactAlarm as
  | ExactAlarmNativeModule
  | undefined;

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
  return ensureExactAlarmAccess();
};

const getTodoAlarmIdentifier = (todoId: string) =>
  `${TODO_ALARM_IDENTIFIER_PREFIX}${todoId}`;

const getTodoIdFromAlarmIdentifier = (identifier: string) => (
  identifier.startsWith(TODO_ALARM_IDENTIFIER_PREFIX)
    ? identifier.slice(TODO_ALARM_IDENTIFIER_PREFIX.length)
    : null
);

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
  const label = dateLabels[0]?.trim();
  return label ? resolveDateFilterValueDate(label, now, anchor) : null;
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

  const date = resolveTodoAlarmDate(todo.filters.date, now, todo.createdAt);

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
  const title = todo.text.trim() || 'Todo';
  const body = todo.content.trim() || null;

  return {
    content: {
      body,
      data: {
        todoId: todo.id,
        type: 'todo-reminder',
      },
      priority: Notifications.AndroidNotificationPriority.HIGH,
      sound: 'default',
      subtitle: `${formatReminderClockLabel(reminder.time)}${repeatLabel}`,
      title,
    },
    identifier: getTodoAlarmIdentifier(todo.id),
    trigger,
  };
};

export const consumeLastTodoAlarmNotificationResponse = async () => {
  if (!canScheduleNotifications()) {
    return null;
  }

  const todoId = getTodoAlarmResponseTodoId(
    await Notifications.getLastNotificationResponseAsync(),
  );

  if (todoId) {
    await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }

  return todoId;
};

export const addTodoAlarmResponseListener = (
  openTodo: (todoId: string) => void,
) => {
  if (!canScheduleNotifications()) {
    return { remove: () => undefined };
  }

  return Notifications.addNotificationResponseReceivedListener((response) => {
    const todoId = getTodoAlarmResponseTodoId(response);
    if (todoId) {
      openTodo(todoId);
    }
  });
};

export const cancelTodoAlarm = async (todoId: string) => {
  if (!canScheduleNotifications()) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(
    getTodoAlarmIdentifier(todoId),
  );
  await dismissPresentedTodoAlarmNotifications((notificationTodoId) => (
    notificationTodoId === todoId
  ));
};

export const syncTodoAlarm = async (todo: Todo) => {
  if (!canScheduleNotifications()) {
    return;
  }

  const request = createTodoAlarmRequest(todo);
  if (!request) {
    await cancelTodoAlarm(todo.id);
    return;
  }

  if (!(await ensureTodoAlarmSchedulingReady())) {
    return;
  }

  await cancelTodoAlarm(todo.id);
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

  const currentTodoIds = new Set(todos.map((todo) => todo.id));
  await dismissPresentedTodoAlarmNotifications((todoId) => !currentTodoIds.has(todoId));

  if (requests.length === 0) {
    return;
  }

  if (!(await ensureTodoAlarmSchedulingReady())) {
    return;
  }

  for (const request of requests) {
    await Notifications.cancelScheduledNotificationAsync(request.identifier!);
    await Notifications.scheduleNotificationAsync(request);
  }
};
