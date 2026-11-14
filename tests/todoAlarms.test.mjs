import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real scheduler while replacing only the platform boundary.
const createHarness = ({ hour = 1, exactAccess = true } = {}) => {
  const requests = new Map();
  const nativeSettings = [];
  let handler;
  let listener;
  let responseListener;
  const notifications = {
    AndroidNotificationPriority: { HIGH: 'high' },
    AndroidImportance: { HIGH: 4 },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: Object.fromEntries(
      ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'TIME_INTERVAL', 'DATE'].map((key) => [key, key]),
    ),
    setNotificationHandler: (value) => { handler = value; },
    addNotificationReceivedListener: (value) => { listener = value; return { remove() {} }; },
    addNotificationResponseReceivedListener: (value) => { responseListener = value; return { remove() {} }; },
    getPermissionsAsync: async () => ({ granted: true }),
    setNotificationChannelAsync: async () => {},
    getPresentedNotificationsAsync: async () => [],
    getAllScheduledNotificationsAsync: async () => [...requests.values()],
    scheduleNotificationAsync: async (request) => { requests.set(request.identifier, request); },
    cancelScheduledNotificationAsync: async (id) => { requests.delete(id); },
    cancelAllScheduledNotificationsAsync: async () => { requests.clear(); },
  };
  const realRequire = createRequire(import.meta.url);
  const modules = new Map();
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [2040, 8, 7, hour, 30])); }
  };
  const load = (path) => {
    if (modules.has(path)) return modules.get(path).exports;
    const module = { exports: {} };
    modules.set(path, module);
    const require = (id) => {
      if (id === 'expo-notifications') return notifications;
      if (id === 'react-native') return {
        Alert: { alert() {} }, Linking: {}, Platform: { OS: 'android' },
        NativeModules: { LocalTodoExactAlarm: {
          canScheduleExactAlarms: async () => exactAccess,
          setRoutineNotificationSettings: (...values) => { nativeSettings.push(values); return true; },
        } },
      };
      return id.startsWith('.') ? load(resolve(dirname(path), `${id}.ts`)) : realRequire(id);
    };
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require, Date: FixedDate, console }, { filename: path });
    return module.exports;
  };
  const alarms = load(resolve('src/todoAlarms.ts'));
  return { alarms, requests, notifications, nativeSettings, get handler() { return handler; }, get listener() { return listener; }, get responseListener() { return responseListener; } };
};

const routine = (id, interval) => ({
  id, text: id, content: '', done: false,
  createdAt: new Date(2040, 8, 1, 1, 35).getTime(),
  filters: { reminder: [`habit:${interval}`], date: [] },
});
const settings = (quiet, paused = false) => ({ habitQuietHoursEnabled: quiet, habitNotificationsPaused: paused });

test('routine notifications hide names and notes, use the saved label, and retain tap routing', async () => {
  const h = createHarness({ hour: 12 });
  const todo = { ...routine('private-name', '1d'), text: 'Private routine name', content: 'Private notes' };
  await h.alarms.reconcileTodoAlarms([todo]);
  let request = [...h.requests.values()][0];
  assert.equal(request.content.title, 'Routine');
  assert.equal(request.content.body, null);
  assert.equal(request.content.data.todoId, todo.id);
  h.alarms.setTodoAlarmSettings({ ...settings(false), habitNotificationText: '  Check in  ' });
  await h.alarms.reconcileTodoAlarms([todo]);
  request = [...h.requests.values()][0];
  assert.equal(request.content.title, 'Check in');
  assert.equal(request.content.body, null);
  await h.alarms.sendRoutineToggleNotification(todo, true);
  assert.equal(h.requests.get(`local-todo:routine-preview:${todo.id}`).content.title, 'Check in');
  const entries = [];
  h.alarms.addTodoAlarmReceivedListener(entry => entries.push(entry));
  h.listener({ date: Date.now(), request: { ...request, content: { ...request.content, title: todo.text, body: todo.content } } });
  assert.equal(entries[0].title, 'Check in');
  assert.equal(entries[0].body, '');
  h.alarms.setTodoAlarmSettings({ ...settings(false), habitNotificationText: ' ' });
  await h.alarms.reconcileTodoAlarms([todo]);
  assert.equal([...h.requests.values()][0].content.title, 'Routine');
});

test('ordinary reminders keep item titles and notes private', async () => {
  const h = createHarness({ hour: 12 });
  h.alarms.setTodoAlarmSettings({ ...settings(false), habitNotificationText: 'Check in' });
  const todo = { ...routine('normal', '1d'), text: 'Normal title', content: 'Normal notes', filters: { date: [], reminder: ['14:00'] } };
  await h.alarms.reconcileTodoAlarms([todo]);
  const request = [...h.requests.values()][0];
  assert.equal(request.content.title, 'Reminder');
  assert.equal(request.content.body, null);
  assert.equal(request.content.data.todoId, todo.id);
});

test('all calendar routine types created at night move to 07:00 when quiet hours are enabled', async () => {
  const h = createHarness();
  h.alarms.setTodoAlarmSettings(settings(true));
  await h.alarms.reconcileTodoAlarms(['1d', '1w', '1m'].map((interval) => routine(interval, interval)));
  assert.equal(h.requests.size, 3);
  for (const request of h.requests.values()) {
    assert.equal(request.trigger.hour, 7);
    assert.equal(request.trigger.minute, 0);
  }
  h.alarms.setTodoAlarmSettings(settings(false));
  await h.alarms.reconcileTodoAlarms(['1d', '1w', '1m'].map((interval) => routine(interval, interval)));
  for (const request of h.requests.values()) {
    assert.equal(request.trigger.hour, 1);
    assert.equal(request.trigger.minute, 35);
  }
});

test('without exact access routines still schedule using Android fallback and remove nighttime slots', async () => {
  const h = createHarness({ exactAccess: false });
  const id = 'local-todo:todo-alarm:a:habit:0';
  h.requests.set(id, { identifier: id, content: { data: { todoId: 'a', type: 'todo-reminder' } } });
  h.alarms.setTodoAlarmSettings(settings(true));
  await h.alarms.reconcileTodoAlarms([routine('a', '3h')]);
  assert.equal(h.requests.size, 5);
  assert.equal(h.requests.has(id), false);
});

test('quiet hours and pause suppress foreground routine sound, display, and history but preserve normal alerts', async () => {
  const h = createHarness();
  const entries = [];
  h.alarms.addTodoAlarmReceivedListener((entry) => entries.push(entry));
  const notification = {
    date: Date.now(),
    request: { identifier: 'local-todo:todo-alarm:a:habit:3', content: { data: { todoId: 'a', type: 'todo-reminder' } } },
  };
  h.alarms.setTodoAlarmSettings(settings(true));
  let behavior = await h.handler.handleNotification(notification);
  assert.equal(behavior.shouldPlaySound, false);
  assert.equal(behavior.shouldShowBanner, false);
  assert.equal(behavior.shouldShowList, false);
  h.listener(notification);
  assert.equal(entries.length, 0);
  h.alarms.setTodoAlarmSettings(settings(false));
  assert.equal((await h.handler.handleNotification(notification)).shouldPlaySound, true);
  h.alarms.setTodoAlarmSettings(settings(false, true));
  assert.equal((await h.handler.handleNotification(notification)).shouldPlaySound, false);
  notification.request.identifier = 'local-todo:todo-alarm:a';
  assert.equal((await h.handler.handleNotification(notification)).shouldPlaySound, true);
  assert.deepEqual(h.nativeSettings.at(-1), [true, false]);
});

test('07:00 releases routine alerts and pausing cancels all routine schedules', async () => {
  const h = createHarness({ hour: 7 });
  h.alarms.setTodoAlarmSettings(settings(true));
  assert.equal((await h.handler.handleNotification({ request: { identifier: 'local-todo:todo-alarm:a:habit:1d' } })).shouldPlaySound, true);
  await h.alarms.reconcileTodoAlarms([routine('a', '3h'), routine('b', '3h')]);
  assert.equal(h.requests.size, 10);
  h.alarms.setTodoAlarmSettings(settings(true, true));
  await h.alarms.reconcileTodoAlarms([routine('a', '3h'), routine('b', '3h')]);
  assert.equal(h.requests.size, 0);
});


test('failed schedule reads cannot create replacement alarms alongside unknown old slots', async () => {
  const h = createHarness();
  await h.alarms.reconcileTodoAlarms([routine('a', '3h')]);
  const original = [...h.requests.keys()];
  const read = h.notifications.getAllScheduledNotificationsAsync;
  h.notifications.getAllScheduledNotificationsAsync = async () => { throw new Error('read failed'); };
  await assert.rejects(h.alarms.syncTodoAlarm(routine('a', '1d')), /read failed/);
  assert.deepEqual([...h.requests.keys()], original);
  h.notifications.getAllScheduledNotificationsAsync = read;
  await h.alarms.syncTodoAlarm(routine('a', '1d'));
  assert.deepEqual([...h.requests.keys()], ['local-todo:todo-alarm:a:habit:1d']);
});

test('each routine toggle sends exactly one immediate preview, including off during quiet hours and pause', async () => {
  const h = createHarness({ hour: 1 });
  h.alarms.setTodoAlarmSettings(settings(true, true));
  const calls = [];
  h.notifications.scheduleNotificationAsync = async request => { calls.push(request); };
  const entries = [];
  h.alarms.addTodoAlarmReceivedListener(entry => entries.push(entry));
  for (const enabled of [true, false]) {
    const before = calls.length;
    await h.alarms.sendRoutineToggleNotification(routine('toggle-test', '3h'), enabled);
    assert.equal(calls.length, before + 1);
    const request = calls.at(-1);
    assert.equal(request.trigger.channelId, 'todo-alarms');
    assert.equal(request.trigger.repeats, undefined);
    assert.equal(request.content.data.todoId, 'toggle-test');
    assert.match(request.content.body, new RegExp(`alerts ${enabled ? 'on' : 'off'}`));
    assert.equal(request.identifier.includes(':habit:'), false);
    const notification = { date: Date.now(), request };
    assert.equal((await h.handler.handleNotification(notification)).shouldShowBanner, true);
    assert.equal((await h.handler.handleNotification(notification)).shouldPlaySound, true);
    h.listener(notification);
  }
  assert.equal(entries.length, 2);
  assert.equal(calls[0].identifier, calls[1].identifier);
});


test('duplicate preview requests coalesce while on/off changes replace one tray identifier', async () => {
  const h = createHarness();
  const calls = [];
  h.notifications.scheduleNotificationAsync = async request => {
    calls.push(request);
    h.requests.set(request.identifier, request);
  };
  const todo = routine('one-preview', '3h');
  await Promise.all([
    h.alarms.sendRoutineToggleNotification(todo, true),
    h.alarms.sendRoutineToggleNotification(todo, true),
  ]);
  await h.alarms.sendRoutineToggleNotification(todo, true);
  assert.equal(calls.length, 1);
  await h.alarms.sendRoutineToggleNotification(todo, false);
  assert.equal(calls.length, 2);
  assert.equal(h.requests.size, 1);
  assert.match([...h.requests.values()][0].content.body, /alerts off/);
});

test('old randomized preview notifications are removed only for the toggled routine', async () => {
  const h = createHarness();
  const dismissed = [];
  h.notifications.getPresentedNotificationsAsync = async () => [
    { request: { identifier: 'local-todo:routine-preview:cleanup:old-id' } },
    { request: { identifier: 'local-todo:routine-preview:another:old-id' } },
    { request: { identifier: 'local-todo:todo-alarm:cleanup:habit:3' } },
  ];
  h.notifications.dismissNotificationAsync = async id => { dismissed.push(id); };
  await h.alarms.sendRoutineToggleNotification(routine('cleanup', '3h'), false);
  assert.deepEqual(dismissed, ['local-todo:routine-preview:cleanup:old-id']);
});

test('dated items schedule at 07:00 by default or at their selected reminder time', async () => {
  const h = createHarness({ hour: 12 });
  const dated = { ...routine('dated', '1d'), filters: { date: ['2040-09-26'], reminder: [] } };
  const timed = { ...dated, id: 'timed', filters: { date: ['2040-09-26'], reminder: ['14:00'] } };
  await h.alarms.reconcileTodoAlarms([dated, timed]);
  const defaultDate = h.requests.get('local-todo:todo-alarm:dated').trigger.date;
  const timedDate = h.requests.get('local-todo:todo-alarm:timed').trigger.date;
  assert.deepEqual([defaultDate.getFullYear(), defaultDate.getMonth(), defaultDate.getDate(), defaultDate.getHours()], [2040, 8, 26, 7]);
  assert.deepEqual([timedDate.getFullYear(), timedDate.getMonth(), timedDate.getDate(), timedDate.getHours()], [2040, 8, 26, 14]);
  await h.alarms.reconcileTodoAlarms([{ ...dated, done: true }, { ...timed, filters: { date: [], reminder: [] } }]);
  assert.equal(h.requests.size, 0);
});


test('notification taps route ordinary and routine reminders to their item', async () => {
  const h = createHarness({ hour: 12 });
  const opened = [];
  h.alarms.addTodoAlarmResponseListener(id => opened.push(id));
  const normal = { ...routine('normal-tap', '1d'), filters: { date: [], reminder: ['14:00'] } };
  await h.alarms.reconcileTodoAlarms([normal, routine('routine-tap', '1d')]);
  for (const request of h.requests.values()) h.responseListener({ notification: { request, date: Date.now() } });
  assert.deepEqual(opened.sort(), ['normal-tap', 'routine-tap']);
});

test('daily items use a repeating morning alert, including dated and future-start items', async () => {
  const h = createHarness({ hour: 12 });
  const base = { ...routine('daily', '1d'), filters: { date: [], reminder: ['repeat:daily'] } };
  const future = { ...base, id: 'future', filters: { date: ['2040-09-26'], reminder: ['08:15|repeat:daily'] } };
  const past = { ...base, id: 'past', filters: { date: ['2040-09-01'], reminder: ['06:30|repeat:daily'] } };
  await h.alarms.reconcileTodoAlarms([base, future, past]);
  const daily = h.requests.get('local-todo:todo-alarm:daily');
  const later = h.requests.get('local-todo:todo-alarm:future');
  const earlier = h.requests.get('local-todo:todo-alarm:past');
  assert.equal(daily.trigger.type, 'DAILY');
  assert.equal(daily.trigger.hour, 7);
  assert.equal(later.trigger.type, 'DAILY');
  assert.equal(later.trigger.hour, 8);
  assert.equal(later.trigger.minute, 15);
  assert.equal(later.content.data.dailyStartAt, new Date(2040, 8, 26, 8, 15).getTime());
  assert.equal(earlier.trigger.type, 'DAILY');
  assert.equal(earlier.trigger.hour, 6);
});
