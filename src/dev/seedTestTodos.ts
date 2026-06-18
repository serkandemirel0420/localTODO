import { DATE_FILTER_PRESETS } from '../dates';
import {
  encodeTodoReminder,
  REPEATING_ITEMS_FILTER_VALUE,
  type RepeatPreset,
} from '../reminders';
import {
  type ListOrderMode,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type TodoGroupMode,
  type TodoSortMode,
} from '../storage/appSettingsStore';
import { PRIORITY_MENU_ITEMS } from '../todoOptions';
import {
  cloneTodoFilters,
  makeTodo,
  type Todo,
  type TodoFilters,
} from '../todos';

export const DEV_TEST_TODO_COUNT = 48;
export const DEV_TEST_TODO_ID_PREFIX = 'dev-test-';
export const DEV_TEST_MENU_PRESET_ID_PREFIX = 'dev-test-preset-';
export const DEV_TEST_LIST_KEYWORD = 'dev-test-list';
export const DEV_TEST_MENU_PRESET_COUNT = 5;

const DEV_TEST_LIST_MENU_TREE: StoredListMenuNode[] = [
  {
    label: 'Status',
    iconName: 'progress-check',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} open blocked done state`,
    groupMode: 'status',
    sortMode: 'newest',
  },
  {
    label: 'Focus',
    iconName: 'target',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} deep work priority`,
    children: [
      {
        label: 'Deep Work',
        iconName: 'brain',
        searchKeywords: `${DEV_TEST_LIST_KEYWORD} focus blocks`,
      },
      {
        label: 'Quick Wins',
        iconName: 'flash-outline',
        searchKeywords: `${DEV_TEST_LIST_KEYWORD} short tasks`,
      },
    ],
    groupMode: 'priority',
    sortMode: 'priority',
  },
  {
    label: 'Client',
    iconName: 'briefcase-outline',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} customer external`,
    groupMode: 'date',
    sortMode: 'date',
  },
  {
    label: 'Maintenance',
    iconName: 'tools',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} recurring upkeep`,
    groupMode: 'list',
    sortMode: 'date',
  },
  {
    label: 'Backlog',
    iconName: 'archive-outline',
    showInNavbar: false,
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} hidden someday later`,
    groupMode: 'none',
    sortMode: 'oldest',
  },
];

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

const emptyFilters = (): TodoFilters => cloneTodoFilters();

const getLabelKey = (label: string) => label.trim().toLocaleLowerCase();

const collectTreeLabels = (nodes: StoredListMenuNode[]) => {
  const labels: string[] = [];

  const walk = (items: StoredListMenuNode[]) => {
    items.forEach((item) => {
      labels.push(item.label);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return labels;
};

const cloneMissingSeedListNode = (
  node: StoredListMenuNode,
  seenLabels: Set<string>,
): StoredListMenuNode | null => {
  const key = getLabelKey(node.label);
  if (seenLabels.has(key)) {
    return null;
  }

  seenLabels.add(key);
  const children = node.children
    ?.map((child) => cloneMissingSeedListNode(child, seenLabels))
    .filter((child): child is StoredListMenuNode => Boolean(child));

  return {
    label: node.label,
    ...(node.iconName ? { iconName: node.iconName } : {}),
    ...(node.showInNavbar === false ? { showInNavbar: false } : {}),
    ...(node.searchKeywords ? { searchKeywords: node.searchKeywords } : {}),
    ...(node.sortMode ? { sortMode: node.sortMode } : {}),
    ...(node.groupMode ? { groupMode: node.groupMode } : {}),
    ...(children && children.length > 0 ? { children } : {}),
  };
};

const isDevSeedListNode = (node: StoredListMenuNode) =>
  node.searchKeywords?.includes(DEV_TEST_LIST_KEYWORD) === true;

export const countDevTestListMenuNodes = (nodes: StoredListMenuNode[]): number =>
  nodes.reduce((count, node) => (
    count
      + (isDevSeedListNode(node) ? 1 : 0)
      + (node.children ? countDevTestListMenuNodes(node.children) : 0)
  ), 0);

export const mergeDevTestListMenuTree = (
  currentTree: StoredListMenuNode[],
): StoredListMenuNode[] => {
  const seenLabels = new Set(collectTreeLabels(currentTree).map(getLabelKey));
  const seedNodes = DEV_TEST_LIST_MENU_TREE
    .map((node) => cloneMissingSeedListNode(node, seenLabels))
    .filter((node): node is StoredListMenuNode => Boolean(node));

  return seedNodes.length > 0 ? [...seedNodes, ...currentTree] : currentTree;
};

export const removeDevTestListMenuNodes = (
  nodes: StoredListMenuNode[],
): StoredListMenuNode[] => (
  nodes
    .filter((node) => !isDevSeedListNode(node))
    .map((node) => {
      const children = node.children ? removeDevTestListMenuNodes(node.children) : undefined;
      return {
        ...node,
        ...(children && children.length > 0 ? { children } : { children: undefined }),
      };
    })
);

export const isDevTestMenuPreset = (preset: StoredMenuPreset) =>
  preset.id.startsWith(DEV_TEST_MENU_PRESET_ID_PREFIX);

const pickListLabel = (
  availableLabels: string[],
  preferredLabel: string,
  fallbackIndex: number,
) => (
  availableLabels.includes(preferredLabel)
    ? preferredLabel
    : availableLabels[fallbackIndex % Math.max(availableLabels.length, 1)] ?? 'Inbox'
);

const makeDevTestMenuPreset = ({
  id,
  label,
  filters,
  createdAt,
  requiredFilters = emptyFilters(),
  avoidedFilters = emptyFilters(),
  listOrderMode = 'manual',
  todoGroupMode = 'none',
  todoSortMode = 'newest',
}: {
  id: string;
  label: string;
  filters: TodoFilters;
  createdAt: number;
  requiredFilters?: TodoFilters;
  avoidedFilters?: TodoFilters;
  listOrderMode?: ListOrderMode;
  todoGroupMode?: TodoGroupMode;
  todoSortMode?: TodoSortMode;
}): StoredMenuPreset => ({
  id: `${DEV_TEST_MENU_PRESET_ID_PREFIX}${id}`,
  label,
  filters: cloneTodoFilters(filters),
  requiredFilters: cloneTodoFilters(requiredFilters),
  avoidedFilters: cloneTodoFilters(avoidedFilters),
  listOrderMode,
  todoGroupMode,
  todoSortMode,
  createdAt,
});

export const createDevTestMenuPresets = (
  listLabels: string[],
  now = Date.now(),
): StoredMenuPreset[] => {
  const availableLabels = listLabels.length > 0
    ? listLabels
    : collectTreeLabels(DEV_TEST_LIST_MENU_TREE);
  const statusList = pickListLabel(availableLabels, 'Status', 0);
  const focusList = pickListLabel(availableLabels, 'Focus', 1);
  const clientList = pickListLabel(availableLabels, 'Client', 2);
  const maintenanceList = pickListLabel(availableLabels, 'Maintenance', 3);
  const backlogList = pickListLabel(availableLabels, 'Backlog', 4);

  return [
    makeDevTestMenuPreset({
      id: 'status-board',
      label: 'Dev: Status board',
      filters: { ...emptyFilters(), list: [statusList] },
      createdAt: now - 5_000,
      todoGroupMode: 'status',
      todoSortMode: 'newest',
    }),
    makeDevTestMenuPreset({
      id: 'today-focus',
      label: 'Dev: Today focus',
      filters: {
        ...emptyFilters(),
        date: ['Today'],
        list: [focusList],
        priority: ['High', 'Medium'],
      },
      createdAt: now - 4_000,
      requiredFilters: { ...emptyFilters(), date: ['Today'], list: [focusList] },
      todoGroupMode: 'priority',
      todoSortMode: 'priority',
    }),
    makeDevTestMenuPreset({
      id: 'client-waiting',
      label: 'Dev: Client waiting',
      filters: {
        ...emptyFilters(),
        list: [clientList],
        priority: ['High'],
      },
      avoidedFilters: { ...emptyFilters(), date: ['Someday'] },
      createdAt: now - 3_000,
      todoGroupMode: 'date',
      todoSortMode: 'date',
    }),
    makeDevTestMenuPreset({
      id: 'repeating-upkeep',
      label: 'Dev: Repeating upkeep',
      filters: {
        ...emptyFilters(),
        list: [maintenanceList],
        reminder: [REPEATING_ITEMS_FILTER_VALUE],
      },
      createdAt: now - 2_000,
      todoGroupMode: 'date',
      todoSortMode: 'date',
    }),
    makeDevTestMenuPreset({
      id: 'backlog-low',
      label: 'Dev: Backlog low priority',
      filters: {
        ...emptyFilters(),
        list: [backlogList],
        priority: ['Low', 'None'],
      },
      createdAt: now - 1_000,
      todoGroupMode: 'list',
      todoSortMode: 'oldest',
    }),
  ];
};

export const mergeDevTestMenuPresets = (
  currentPresets: StoredMenuPreset[],
  listLabels: string[],
  now = Date.now(),
): StoredMenuPreset[] => [
  ...createDevTestMenuPresets(listLabels, now),
  ...currentPresets.filter((preset) => !isDevTestMenuPreset(preset)),
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
