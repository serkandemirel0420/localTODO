import { DATE_FILTER_PRESETS } from '../dates';
import { PRIORITY_MENU_ITEMS } from '../todoOptions';
import { makeTodo, type Todo } from '../todos';

export const DEV_TEST_TODO_COUNT = 20;
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
    const priority = PRIORITY_MENU_ITEMS[index % PRIORITY_MENU_ITEMS.length];
    const todo = makeTodo(
      DEV_TEST_TITLES[index % DEV_TEST_TITLES.length],
      {
        date: [date],
        list: [list],
        priority: [priority],
        reminder: [],
      },
      `Dev test note ${index + 1}.`,
      now - index * 45_000,
      index % 5 === 0,
    );

    return {
      ...todo,
      id: `${DEV_TEST_TODO_ID_PREFIX}${index + 1}`,
      done: index % 8 === 0,
    };
  });
};
