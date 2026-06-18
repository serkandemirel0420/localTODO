import { DATE_FILTER_PRESETS } from '../dates';
import { encodeTodoReminder, type RepeatPreset } from '../reminders';
import { PRIORITY_MENU_ITEMS } from '../todoOptions';
import { makeTodo, type Todo } from '../todos';

export const DEV_TEST_TODO_COUNT = 48;
export const DEV_TEST_TODO_ID_PREFIX = 'dev-test-';

const DEV_TEST_TITLES = [
  'Review quarterly budget',
  'Call dentist for checkup',
  'Buy groceries for the week',
  'Plan weekend hike',
  'Finish slide deck',
  'Water house plants',
  'Reply to client email',
  'Schedule car service',
  'Read two book chapters',
  'Organize desk drawers',
  'Pay utility bills',
  'Prep team standup notes',
  'Order birthday gift',
  'Clean kitchen shelves',
  'Update project roadmap',
  'Walk 30 minutes',
  'Backup phone photos',
  'Draft blog outline',
  'Fix leaky faucet',
  'Sort inbox labels',
  'Compare grocery prices',
  'Refine workout plan',
  'Book travel window',
  'Check renewal notice',
  'Review saved article',
  'Send invoice reminder',
  'Plan monthly reset',
  'Update packing list',
];

const DEV_TEST_REPEAT_PATTERN: RepeatPreset[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const DEV_TEST_REMINDER_TIMES = [
  null,
  { hours: 9, minutes: 0 },
  { hours: 12, minutes: 30 },
  { hours: 18, minutes: 15 },
];

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDateOptions = (anchor: Date) => {
  const presetDates = DATE_FILTER_PRESETS.filter((label) => label !== 'Custom date');
  const offsets = [-5, -2, -1, 1, 2, 4, 7, 10, 14, 21];

  return [
    ...presetDates,
    ...offsets.map((offset) => {
      const date = new Date(anchor);
      date.setDate(date.getDate() + offset);
      return formatIsoDate(date);
    }),
  ];
};

export const isDevTestTodo = (todo: Todo) => todo.id.startsWith(DEV_TEST_TODO_ID_PREFIX);

export const createDevTestTodos = (
  listLabels: string[],
  count = DEV_TEST_TODO_COUNT,
  now = Date.now(),
): Todo[] => {
  const lists = listLabels.length > 0
    ? listLabels
    : ['Inbox', 'Work', 'Personal', 'Home', 'Errands'];
  const dateOptions = buildDateOptions(new Date(now));

  return Array.from({ length: count }, (_, index) => {
    const date = dateOptions[index % dateOptions.length];
    const list = lists[index % lists.length];
    const secondaryList = lists[(index + 3) % lists.length];
    const priority = PRIORITY_MENU_ITEMS[index % PRIORITY_MENU_ITEMS.length];
    const repeat = index % 4 === 0
      ? DEV_TEST_REPEAT_PATTERN[(index / 4) % DEV_TEST_REPEAT_PATTERN.length] ?? 'none'
      : 'none';
    const reminderTime = index % 3 === 0
      ? DEV_TEST_REMINDER_TIMES[index % DEV_TEST_REMINDER_TIMES.length]
      : null;
    const reminder = encodeTodoReminder({ repeat, time: reminderTime });
    const listFilters = index % 9 === 0 && secondaryList !== list
      ? [list, secondaryList]
      : [list];
    const dateFilters = index % 10 === 0 ? [] : [date];
    const priorityFilters = index % 7 === 0 ? [] : [priority];
    const todo = makeTodo(
      DEV_TEST_TITLES[index % DEV_TEST_TITLES.length],
      {
        date: dateFilters,
        list: listFilters,
        priority: priorityFilters,
        reminder,
      },
      [
        `Dev test note ${index + 1}.`,
        `Lists: ${listFilters.join(', ') || 'None'}.`,
        `Date: ${dateFilters.join(', ') || 'None'}.`,
        `Priority: ${priorityFilters.join(', ') || 'None'}.`,
        `Reminder: ${reminder.join(', ') || 'None'}.`,
      ].join('\n'),
      now - index * 45_000,
      index % 11 === 0,
    );

    return {
      ...todo,
      id: `${DEV_TEST_TODO_ID_PREFIX}${index + 1}`,
      done: index % 8 === 0,
    };
  });
};
