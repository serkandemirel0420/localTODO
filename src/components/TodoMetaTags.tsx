import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  type DateLabelAnchor,
  formatDateDisplayLabel,
  formatDateFilterValue,
  isDateFilterOverdue,
  type DateLabelDisplayMode,
} from '../dates';
import {
  getFilterColorTheme,
  type FilterColorKey,
  type FilterColorSettings,
} from '../filterColors';
import {
  formatCreatedAtMetaLabel,
  getCreatedAtMetaLookupValue,
  type MetaTagVisibility,
} from '../metaTags';
import {
  decodeTodoReminder,
  formatReminderClockLabel,
  formatRepeatLabel,
} from '../reminders';
import { formatListLabel } from '../todos';

const FONT_MEDIUM = '500' as const;
const REMINDER_STATUS_COLOR = '#4C78FF';
const REPEAT_STATUS_COLOR = '#2F6F62';

type MetaTagDescriptor = {
  displayLabel: string;
  filterKey: FilterColorKey;
  isOverdue?: boolean;
  lookupValue: string;
};

type StatusIconDescriptor = {
  accessibilityLabel: string;
  color: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  id: 'reminder' | 'repeat';
};

type TodoMetaTagsProps = {
  createdAt?: number;
  dateLabelAnchor?: DateLabelAnchor;
  dateLabel?: string;
  dateLabelDisplayMode?: DateLabelDisplayMode;
  done?: boolean;
  filterColors: FilterColorSettings;
  listLabel?: string;
  priorityLabel?: string;
  reminderValues?: string[];
  visibility: MetaTagVisibility;
};

const isOverdueStatusLabel = (label: string) => /overdue/i.test(label);

function MetaTag({
  descriptor,
  done,
  filterColors,
}: {
  descriptor: MetaTagDescriptor;
  done?: boolean;
  filterColors: FilterColorSettings;
}) {
  const theme = getFilterColorTheme(
    filterColors,
    descriptor.filterKey,
    descriptor.lookupValue,
  );
  const useOverdueStyle = descriptor.isOverdue === true;

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: useOverdueStyle ? '#FFF0EE' : theme?.tint ?? '#FFFFFF',
          borderColor: useOverdueStyle ? '#F0C8C3' : theme?.border ?? '#E8E2DA',
        },
        done && styles.tagDone,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tagText,
          { color: useOverdueStyle ? '#CF413A' : theme?.text ?? '#6A625A' },
          done && styles.tagTextDone,
        ]}
      >
        {descriptor.displayLabel}
      </Text>
    </View>
  );
}

function StatusIcon({
  descriptor,
  done,
}: {
  descriptor: StatusIconDescriptor;
  done?: boolean;
}) {
  return (
    <View
      accessibilityLabel={descriptor.accessibilityLabel}
      accessible
      style={[
        styles.statusIcon,
        done && styles.statusIconDone,
      ]}
    >
      <Ionicons
        color={descriptor.color}
        name={descriptor.iconName}
        size={12}
      />
    </View>
  );
}

function buildMetaTags(
  visibility: MetaTagVisibility,
  dateLabel: string | undefined,
  dateLabelAnchor: DateLabelAnchor,
  dateLabelDisplayMode: DateLabelDisplayMode,
  listLabel: string | undefined,
  priorityLabel: string | undefined,
  createdAt: number | undefined,
): MetaTagDescriptor[] {
  const tags: MetaTagDescriptor[] = [];
  const hasVisibleDateTag = Boolean(visibility.date && dateLabel);

  if (hasVisibleDateTag && dateLabel) {
    const now = new Date();
    const lookupValue = formatDateFilterValue(dateLabel);
    tags.push({
      displayLabel: formatDateDisplayLabel(
        dateLabel,
        dateLabelDisplayMode,
        now,
        dateLabelAnchor,
      ),
      filterKey: 'date',
      isOverdue: isOverdueStatusLabel(dateLabel)
        || isDateFilterOverdue(dateLabel, now, dateLabelAnchor),
      lookupValue: lookupValue || dateLabel,
    });
  }

  if (visibility.list && listLabel) {
    const formattedListLabel = formatListLabel(listLabel);
    tags.push({
      displayLabel: formattedListLabel,
      filterKey: 'list',
      lookupValue: formattedListLabel,
    });
  }

  if (visibility.priority && priorityLabel) {
    tags.push({
      displayLabel: priorityLabel,
      filterKey: 'priority',
      lookupValue: priorityLabel,
    });
  }

  if (!hasVisibleDateTag && visibility.createdAt && typeof createdAt === 'number') {
    tags.push({
      displayLabel: formatCreatedAtMetaLabel(createdAt),
      filterKey: 'date',
      lookupValue: getCreatedAtMetaLookupValue(createdAt),
    });
  }

  return tags;
}

function buildStatusIcons(
  reminderValues: string[] | undefined,
): StatusIconDescriptor[] {
  const { time, repeat } = decodeTodoReminder(reminderValues ?? []);
  const icons: StatusIconDescriptor[] = [];

  if (time) {
    icons.push({
      accessibilityLabel: `Reminder ${formatReminderClockLabel(time)}`,
      color: REMINDER_STATUS_COLOR,
      iconName: 'notifications-outline',
      id: 'reminder',
    });
  }

  if (repeat !== 'none') {
    icons.push({
      accessibilityLabel: `Repeating ${formatRepeatLabel(repeat)}`,
      color: REPEAT_STATUS_COLOR,
      iconName: 'repeat-outline',
      id: 'repeat',
    });
  }

  return icons;
}

function TodoMetaTagsComponent({
  createdAt,
  dateLabel,
  dateLabelAnchor,
  dateLabelDisplayMode = 'exact',
  done,
  filterColors,
  listLabel,
  priorityLabel,
  reminderValues,
  visibility,
}: TodoMetaTagsProps) {
  const tags = buildMetaTags(
    visibility,
    dateLabel,
    dateLabelAnchor,
    dateLabelDisplayMode,
    listLabel,
    priorityLabel,
    createdAt,
  );
  const statusIcons = buildStatusIcons(reminderValues);

  if (tags.length === 0 && statusIcons.length === 0) {
    return null;
  }

  return (
    <View style={styles.metaRow}>
      {tags.map((descriptor) => (
        <MetaTag
          key={`${descriptor.filterKey}-${descriptor.lookupValue}-${descriptor.displayLabel}`}
          descriptor={descriptor}
          done={done}
          filterColors={filterColors}
        />
      ))}
      {statusIcons.map((descriptor) => (
        <StatusIcon
          key={descriptor.id}
          descriptor={descriptor}
          done={done}
        />
      ))}
    </View>
  );
}

export const TodoMetaTags = React.memo(TodoMetaTagsComponent);

const styles = StyleSheet.create({
  metaRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    marginTop: 4,
    minWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  tag: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    maxWidth: '100%',
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagDone: {
    opacity: 0.55,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
    minWidth: 0,
  },
  tagTextDone: {
    opacity: 0.9,
  },
  statusIcon: {
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    borderColor: '#E1E5EA',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  statusIconDone: {
    opacity: 0.55,
  },
});
