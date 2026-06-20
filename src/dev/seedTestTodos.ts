import { DATE_FILTER_PRESETS, DATED_DATE_LABEL, OVERDUE_DATE_LABEL } from '../dates';
import {
  encodeTodoReminder,
  REPEATING_ITEMS_FILTER_VALUE,
  type RepeatPreset,
} from '../reminders';
import {
  cloneMetaTagVisibility,
  type MetaTagVisibility,
} from '../metaTags';
import {
  type ListOrderMode,
  type StoredListMenuNode,
  type StoredMenuPreset,
  type StoredMenuPresetSection,
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

export const DEV_TEST_TODO_COUNT = 64;
export const DEV_TEST_TODO_ID_PREFIX = 'dev-test-';
export const DEV_TEST_MENU_PRESET_ID_PREFIX = 'dev-test-preset-';
export const DEV_TEST_LIST_KEYWORD = 'dev-test-list';
export const DEV_TEST_MENU_PRESET_COUNT = 5;

const DEV_TEST_LIST_MENU_TREE: StoredListMenuNode[] = [
  {
    label: 'Ideas',
    iconName: 'lightbulb-outline',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} ideas list created order specific saved preset`,
    groupMode: 'none',
    sortMode: 'oldest',
  },
  {
    label: 'Reading',
    iconName: 'book-open-page-variant-outline',
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} reading notes article created order`,
    groupMode: 'none',
    sortMode: 'oldest',
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
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} excluded backlog hidden later`,
    groupMode: 'none',
    sortMode: 'oldest',
  },
  {
    label: 'Archive',
    iconName: 'archive-clock-outline',
    showInNavbar: false,
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} excluded archive hidden completed`,
    groupMode: 'none',
    sortMode: 'oldest',
  },
  {
    label: 'Someday',
    iconName: 'calendar-blank-outline',
    showInNavbar: false,
    searchKeywords: `${DEV_TEST_LIST_KEYWORD} excluded someday hidden later`,
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

const cloneSeedListNode = (node: StoredListMenuNode): StoredListMenuNode => {
  const children = node.children?.map(cloneSeedListNode);
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

const removeListMenuNodesByLabelKeys = (
  nodes: StoredListMenuNode[],
  labelKeys: Set<string>,
): StoredListMenuNode[] => (
  nodes
    .filter((node) => !labelKeys.has(getLabelKey(node.label)))
    .map((node) => {
      const children = node.children
        ? removeListMenuNodesByLabelKeys(node.children, labelKeys)
        : undefined;
      return {
        ...node,
        ...(children && children.length > 0 ? { children } : { children: undefined }),
      };
    })
);

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
  const seedLabelKeys = new Set(collectTreeLabels(DEV_TEST_LIST_MENU_TREE).map(getLabelKey));
  const userTree = removeListMenuNodesByLabelKeys(
    removeDevTestListMenuNodes(currentTree),
    seedLabelKeys,
  );
  const seedNodes = DEV_TEST_LIST_MENU_TREE.map(cloneSeedListNode);

  return seedNodes.length > 0 ? [...seedNodes, ...userTree] : userTree;
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
  metaTagVisibility,
  sections,
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
  metaTagVisibility?: MetaTagVisibility;
  sections?: StoredMenuPresetSection[];
  todoGroupMode?: TodoGroupMode;
  todoSortMode?: TodoSortMode;
}): StoredMenuPreset => ({
  id: `${DEV_TEST_MENU_PRESET_ID_PREFIX}${id}`,
  label,
  filters: cloneTodoFilters(filters),
  requiredFilters: cloneTodoFilters(requiredFilters),
  avoidedFilters: cloneTodoFilters(avoidedFilters),
  listOrderMode,
  ...(metaTagVisibility ? { metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility) } : {}),
  todoGroupMode,
  todoSortMode,
  createdAt,
  ...(sections && sections.length > 0 ? { sections } : {}),
});

const makeDevTestMenuPresetSection = ({
  id,
  label,
  filters,
  createdAt,
  requiredFilters = emptyFilters(),
  avoidedFilters = emptyFilters(),
  listOrderMode = 'manual',
  metaTagVisibility,
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
  metaTagVisibility?: MetaTagVisibility;
  todoGroupMode?: TodoGroupMode;
  todoSortMode?: TodoSortMode;
}): StoredMenuPresetSection => ({
  id: `${DEV_TEST_MENU_PRESET_ID_PREFIX}section-${id}`,
  label,
  filters: cloneTodoFilters(filters),
  requiredFilters: cloneTodoFilters(requiredFilters),
  avoidedFilters: cloneTodoFilters(avoidedFilters),
  listOrderMode,
  ...(metaTagVisibility ? { metaTagVisibility: cloneMetaTagVisibility(metaTagVisibility) } : {}),
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
  const ideasList = pickListLabel(availableLabels, 'Ideas', 0);
  const readingList = pickListLabel(availableLabels, 'Reading', 1);
  const backlogList = pickListLabel(availableLabels, 'Backlog', 2);
  const archiveList = pickListLabel(availableLabels, 'Archive', 3);
  const somedayList = pickListLabel(availableLabels, 'Someday', 4);

  return [
    makeDevTestMenuPreset({
      id: 'ideas-created-order',
      label: 'Dev: Ideas created order',
      filters: { ...emptyFilters(), list: [ideasList] },
      createdAt: now - 5_000,
      todoGroupMode: 'none',
      todoSortMode: 'oldest',
    }),
    makeDevTestMenuPreset({
      id: 'repeating-dates',
      label: 'Dev: Repeating dates',
      filters: {
        ...emptyFilters(),
        reminder: [REPEATING_ITEMS_FILTER_VALUE],
      },
      requiredFilters: { ...emptyFilters(), reminder: [REPEATING_ITEMS_FILTER_VALUE] },
      createdAt: now - 4_000,
      sections: [
        makeDevTestMenuPresetSection({
          id: 'repeating-overdue',
          label: `Repeating · ${OVERDUE_DATE_LABEL}`,
          filters: {
            ...emptyFilters(),
            date: [OVERDUE_DATE_LABEL],
            reminder: [REPEATING_ITEMS_FILTER_VALUE],
          },
          requiredFilters: {
            ...emptyFilters(),
            date: [OVERDUE_DATE_LABEL],
            reminder: [REPEATING_ITEMS_FILTER_VALUE],
          },
          createdAt: now - 3_900,
          todoGroupMode: 'none',
          todoSortMode: 'priority',
        }),
        makeDevTestMenuPresetSection({
          id: 'repeating-tomorrow',
          label: 'Repeating · Tomorrow',
          filters: {
            ...emptyFilters(),
            date: ['Tomorrow'],
            reminder: [REPEATING_ITEMS_FILTER_VALUE],
          },
          requiredFilters: {
            ...emptyFilters(),
            date: ['Tomorrow'],
            reminder: [REPEATING_ITEMS_FILTER_VALUE],
          },
          createdAt: now - 3_800,
          todoGroupMode: 'none',
          todoSortMode: 'priority',
        }),
      ],
      todoGroupMode: 'none',
      todoSortMode: 'priority',
    }),
    makeDevTestMenuPreset({
      id: 'dated-non-repeating',
      label: 'Dev: Dated non-repeating',
      filters: {
        ...emptyFilters(),
        date: [DATED_DATE_LABEL],
      },
      requiredFilters: { ...emptyFilters(), date: [DATED_DATE_LABEL] },
      avoidedFilters: { ...emptyFilters(), reminder: [REPEATING_ITEMS_FILTER_VALUE] },
      createdAt: now - 3_000,
      todoGroupMode: 'date',
      todoSortMode: 'priority',
    }),
    makeDevTestMenuPreset({
      id: 'all-except-backlog',
      label: 'Dev: All except backlog',
      filters: emptyFilters(),
      avoidedFilters: { ...emptyFilters(), list: [backlogList, archiveList, somedayList] },
      createdAt: now - 2_000,
      todoGroupMode: 'none',
      todoSortMode: 'priorityDate',
    }),
    makeDevTestMenuPreset({
      id: 'reading-created-order',
      label: 'Dev: Reading created order',
      filters: { ...emptyFilters(), list: [readingList] },
      createdAt: now - 1_000,
      todoGroupMode: 'none',
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
  const ideasList = pickListLabel(lists, 'Ideas', 0);
  const readingList = pickListLabel(lists, 'Reading', 1);
  const maintenanceList = pickListLabel(lists, 'Maintenance', 2);
  const clientList = pickListLabel(lists, 'Client', 3);
  const focusList = pickListLabel(lists, 'Focus', 4);
  const backlogList = pickListLabel(lists, 'Backlog', 5);
  const archiveList = pickListLabel(lists, 'Archive', 6);
  const somedayList = pickListLabel(lists, 'Someday', 7);
  const dateOptions = buildDateOptions(new Date(now));
  const isoDateFromToday = (offset: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return formatIsoDate(date);
  };
  const showcaseSpecs: Array<{
    content: string;
    date: string[];
    done?: boolean;
    list: string[];
    pinned?: boolean;
    priority: string[];
    reminder: string[];
    title: string;
  }> = [
    {
      title: 'Collect list preset ideas',
      list: [ideasList],
      date: [isoDateFromToday(-5)],
      priority: ['High'],
      reminder: [],
      pinned: true,
      content: 'Specific Ideas list row. Oldest-first saved list should keep this near the top.',
    },
    {
      title: 'Sketch menu bar structure',
      list: [ideasList],
      date: [isoDateFromToday(-2)],
      priority: ['Medium'],
      reminder: [],
      content: 'Specific Ideas list row with a later created time.',
    },
    {
      title: 'Try saved list sections',
      list: [ideasList],
      date: [isoDateFromToday(1)],
      priority: ['Low'],
      reminder: [],
      content: 'Specific Ideas list row with tomorrow as a normal date.',
    },
    {
      title: 'Read saved list notes',
      list: [readingList],
      date: [isoDateFromToday(-4)],
      priority: ['Medium'],
      reminder: [],
      content: 'Reading list row used by the second created-order saved list.',
    },
    {
      title: 'Review filter model article',
      list: [readingList],
      date: [isoDateFromToday(2)],
      priority: ['High'],
      reminder: [],
      content: 'Reading list row with a newer created time.',
    },
    {
      title: 'Daily dashboard sweep',
      list: [maintenanceList],
      date: [isoDateFromToday(-3)],
      priority: ['High'],
      reminder: encodeTodoReminder({ repeat: 'daily', time: { hours: 9, minutes: 0 } }),
      content: 'Repeating overdue item for the repeating saved-list section.',
    },
    {
      title: 'Weekly battery check',
      list: [maintenanceList],
      date: [isoDateFromToday(1)],
      priority: ['Medium'],
      reminder: encodeTodoReminder({ repeat: 'weekly', time: { hours: 10, minutes: 30 } }),
      content: 'Repeating tomorrow item for the repeating saved-list section.',
    },
    {
      title: 'Monthly invoice review',
      list: [clientList],
      date: [isoDateFromToday(-1)],
      priority: ['Low'],
      reminder: encodeTodoReminder({ repeat: 'monthly', time: { hours: 14, minutes: 0 } }),
      content: 'Another repeating overdue row with a different priority.',
    },
    {
      title: 'Yearly warranty reminder',
      list: [maintenanceList],
      date: [isoDateFromToday(1)],
      priority: ['High'],
      reminder: encodeTodoReminder({ repeat: 'yearly', time: null }),
      content: 'Another repeating tomorrow row to prove priority sorting inside that section.',
    },
    {
      title: 'Plan dated non repeating high',
      list: [focusList],
      date: [isoDateFromToday(-2)],
      priority: ['High'],
      reminder: [],
      content: 'Dated and not repeating. Date grouping should keep it in an overdue section.',
    },
    {
      title: 'Plan dated non repeating medium',
      list: [clientList],
      date: ['Today'],
      priority: ['Medium'],
      reminder: [],
      content: 'Dated and not repeating. Priority sort should apply inside the date section.',
    },
    {
      title: 'Plan dated non repeating low',
      list: [focusList],
      date: [isoDateFromToday(4)],
      priority: ['Low'],
      reminder: [],
      content: 'Dated and not repeating with a future custom date.',
    },
    {
      title: 'Undated non repeating should stay out',
      list: [clientList],
      date: [],
      priority: ['High'],
      reminder: [],
      content: 'This row proves Dated items does not include undated non-repeating rows.',
    },
    {
      title: 'Backlog excluded high',
      list: [backlogList],
      date: [isoDateFromToday(3)],
      priority: ['High'],
      reminder: [],
      content: 'This row should be excluded by the all-except saved list.',
    },
    {
      title: 'Archive excluded medium',
      list: [archiveList],
      date: [isoDateFromToday(5)],
      priority: ['Medium'],
      reminder: [],
      content: 'This row should also be excluded by the all-except saved list.',
    },
    {
      title: 'Someday excluded low',
      list: [somedayList],
      date: ['Later'],
      priority: ['Low'],
      reminder: [],
      content: 'This row should also be excluded by the all-except saved list.',
    },
    {
      title: 'Included priority then date high',
      list: [focusList],
      date: [isoDateFromToday(6)],
      priority: ['High'],
      reminder: [],
      content: 'This row stays in the all-except saved list and sorts by priority first.',
    },
    {
      title: 'Included priority then date medium',
      list: [clientList],
      date: [isoDateFromToday(1)],
      priority: ['Medium'],
      reminder: [],
      content: 'This row stays in the all-except saved list and breaks ties by date.',
    },
  ];
  const makeDevTodoFromSpec = (
    spec: (typeof showcaseSpecs)[number],
    index: number,
  ): Todo => {
    const createdAt = now - (showcaseSpecs.length - index) * 75_000;
    const todo = makeTodo(
      spec.title,
      {
        date: spec.date,
        list: spec.list,
        priority: spec.priority,
        reminder: spec.reminder,
      },
      spec.content,
      createdAt,
      spec.pinned === true,
    );

    return {
      ...todo,
      id: `${DEV_TEST_TODO_ID_PREFIX}${index + 1}`,
      done: spec.done === true,
    };
  };
  const showcaseTodos = showcaseSpecs
    .slice(0, count)
    .map((spec, index) => makeDevTodoFromSpec(spec, index));
  const generatedCount = Math.max(count - showcaseTodos.length, 0);

  const generatedTodos = Array.from({ length: generatedCount }, (_, generatedIndex) => {
    const index = showcaseTodos.length + generatedIndex;
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

  return [...showcaseTodos, ...generatedTodos];
};
