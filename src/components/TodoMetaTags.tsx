import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  type DateLabelAnchor,
  formatDateDisplayLabelParts,
  formatDateFilterValue,
  formatOverdueDaysLabel,
  isDateFilterDueToday,
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
  formatHabitIntervalLabel,
  formatHabitIntervalShortLabel,
  formatReminderClockLabel,
  formatRepeatLabel,
} from '../reminders';
import { formatListLabel } from '../todos';

const FONT_MEDIUM = '500' as const;
const REMINDER_STATUS_COLOR = '#4C78FF';
const REPEAT_STATUS_COLOR = '#2F6F62';
const PIN_STATUS_COLOR = '#4C78FF';
const DATE_TAG_COLORS = {
  due: {
    background: '#ECF9F1',
    border: '#BFE6CD',
    text: '#237A43',
  },
  overdue: {
    background: '#FFF0EE',
    border: '#F0C8C3',
    text: '#CF413A',
  },
} as const;

type MetaTagDescriptor = {
  dateTone?: keyof typeof DATE_TAG_COLORS;
  displayLabel: string;
  filterKey?: FilterColorKey;
  lookupValue: string;
  secondaryLabel?: string;
};

type StatusIconDescriptor = {
  accessibilityLabel: string;
  color: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  id: 'reminder' | 'repeat' | 'pin';
  label?: string;
};

type TodoMetaTagsProps = {
  createdAt?: number;
  dateLabelAnchor?: DateLabelAnchor;
  dateLabel?: string;
  dateLabelDisplayMode?: DateLabelDisplayMode;
  dateStatusKey: string;
  done?: boolean;
  filterColors: FilterColorSettings;
  listLabel?: string;
  pinned?: boolean;
  priorityLabel?: string;
  reminderValues?: string[];
  showOverdueMetaTags?: boolean;
  showReminderTimeLabel?: boolean;
  tagLabels?: string[];
  visibility: MetaTagVisibility;
  wrap?: boolean;
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
  const isPriorityTag = descriptor.filterKey === 'priority';
  const isDateTag = descriptor.filterKey === 'date';
  const colorMetaTag = descriptor.filterKey === 'date' || isPriorityTag;
  const colorTheme = colorMetaTag
    ? getFilterColorTheme(
      filterColors,
      descriptor.filterKey ?? 'date',
      descriptor.lookupValue,
    )
    : null;
  const priorityBackgroundTheme = isPriorityTag
    ? getFilterColorTheme(filterColors, 'priorityBackground', descriptor.lookupValue)
    : null;
  const priorityBorderTheme = isPriorityTag
    ? getFilterColorTheme(filterColors, 'priorityBorder', descriptor.lookupValue)
    : null;
  const dateToneColors = descriptor.dateTone
    ? DATE_TAG_COLORS[descriptor.dateTone]
    : null;
  const backgroundColor = dateToneColors
    ? dateToneColors.background
    : isPriorityTag
      ? priorityBackgroundTheme?.tint ?? '#FFFFFF'
      : colorTheme?.tint ?? '#FFFFFF';
  const borderColor = dateToneColors
    ? dateToneColors.border
    : isPriorityTag
      ? priorityBorderTheme?.accent ?? '#E8E2DA'
      : colorTheme?.border ?? '#E8E2DA';
  const textColor = dateToneColors ? dateToneColors.text : colorTheme?.text ?? '#6A625A';

  return (
    <View
      style={[
        styles.tag,
        isDateTag && styles.dateTag,
        {
          backgroundColor,
          borderColor,
        },
        done && styles.tagDone,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tagText,
          isDateTag && styles.dateTagText,
          { color: textColor },
          done && styles.tagTextDone,
        ]}
      >
        {descriptor.displayLabel}
        {descriptor.secondaryLabel ? (
          <Text
            style={[
              styles.tagSecondaryText,
              isDateTag && styles.dateTagSecondaryText,
              { color: textColor },
              done && styles.tagTextDone,
            ]}
          >
            {` ${descriptor.secondaryLabel}`}
          </Text>
        ) : null}
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
        descriptor.label && styles.statusIconWithLabel,
        done && styles.statusIconDone,
      ]}
    >
      <Ionicons
        color={descriptor.color}
        name={descriptor.iconName}
        size={12}
      />
      {descriptor.label ? (
        <Text
          numberOfLines={1}
          style={[
            styles.statusIconLabel,
            { color: descriptor.color },
          ]}
        >
          {descriptor.label}
        </Text>
      ) : null}
    </View>
  );
}

function buildMetaTags(
  visibility: MetaTagVisibility,
  dateLabel: string | undefined,
  dateLabelAnchor: DateLabelAnchor,
  dateLabelDisplayMode: DateLabelDisplayMode,
  showOverdueMetaTags: boolean,
  listLabel: string | undefined,
  priorityLabel: string | undefined,
  tagLabels: string[] | undefined,
  createdAt: number | undefined,
): MetaTagDescriptor[] {
  const tags: MetaTagDescriptor[] = [];
  const hasVisibleDateTag = Boolean(visibility.date && dateLabel);

  if (hasVisibleDateTag && dateLabel) {
    const now = new Date();
    const lookupValue = formatDateFilterValue(dateLabel);
    const isOverdue = isOverdueStatusLabel(dateLabel)
      || isDateFilterOverdue(dateLabel, now, dateLabelAnchor);
    const isDueToday = !isOverdue && isDateFilterDueToday(dateLabel, now, dateLabelAnchor);
    const overdueLabel = showOverdueMetaTags
      ? formatOverdueDaysLabel(dateLabel, now, dateLabelAnchor)
      : null;
    const displayLabelParts = overdueLabel
      ? { primary: overdueLabel }
      : formatDateDisplayLabelParts(
        dateLabel,
        dateLabelDisplayMode,
        now,
        dateLabelAnchor,
      );
    tags.push({
      dateTone: isOverdue ? 'overdue' : isDueToday ? 'due' : undefined,
      displayLabel: displayLabelParts.primary,
      filterKey: 'date',
      lookupValue: lookupValue || dateLabel,
      secondaryLabel: displayLabelParts.secondary,
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

  if (visibility.tags) {
    tagLabels?.forEach((label) => {
      tags.push({
        displayLabel: `#${label}`,
        lookupValue: label,
      });
    });
  }

  return tags;
}

function buildStatusIcons(
  reminderValues: string[] | undefined,
  pinned: boolean | undefined,
  showReminderTimeLabel: boolean,
): StatusIconDescriptor[] {
  const { habitHours, time, repeat } = decodeTodoReminder(reminderValues ?? []);
  const icons: StatusIconDescriptor[] = [];

  if (habitHours) {
    icons.push({
      accessibilityLabel: `Habit ${formatHabitIntervalLabel(habitHours)}`,
      color: REMINDER_STATUS_COLOR,
      iconName: 'notifications-outline',
      id: 'reminder',
      label: formatHabitIntervalShortLabel(habitHours),
    });
  }

  if (time && !habitHours) {
    const reminderTimeLabel = formatReminderClockLabel(time);
    icons.push({
      accessibilityLabel: `Reminder ${reminderTimeLabel}`,
      color: REMINDER_STATUS_COLOR,
      iconName: 'notifications-outline',
      id: 'reminder',
      label: showReminderTimeLabel ? reminderTimeLabel : undefined,
    });
  }

  if (repeat !== 'none') {
    const repeatLabel = formatRepeatLabel(repeat);
    icons.push({
      accessibilityLabel: `Repeating ${repeatLabel}`,
      color: REPEAT_STATUS_COLOR,
      iconName: 'repeat-outline',
      id: 'repeat',
      label: repeatLabel,
    });
  }

  if (pinned) {
    icons.push({
      accessibilityLabel: 'Pinned todo',
      color: PIN_STATUS_COLOR,
      iconName: 'pin',
      id: 'pin',
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
  pinned,
  priorityLabel,
  reminderValues,
  showOverdueMetaTags = true,
  showReminderTimeLabel = false,
  tagLabels,
  visibility,
  wrap = false,
}: TodoMetaTagsProps) {
  const tags = buildMetaTags(
    visibility,
    dateLabel,
    dateLabelAnchor,
    dateLabelDisplayMode,
    showOverdueMetaTags,
    listLabel,
    priorityLabel,
    tagLabels,
    createdAt,
  );
  const statusIcons = buildStatusIcons(reminderValues, pinned, showReminderTimeLabel);

  if (tags.length === 0 && statusIcons.length === 0) {
    return null;
  }

  return (
    <View style={[styles.metaRow, wrap && styles.metaRowWrap]}>
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
    marginTop: 7,
    minWidth: 0,
    overflow: 'hidden',
    width: '100%',
  },
  metaRowWrap: {
    flexWrap: 'wrap',
    overflow: 'visible',
    rowGap: 5,
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
  dateTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
    minWidth: 0,
  },
  dateTagText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  tagSecondaryText: {
    fontSize: 8,
    lineHeight: 10,
  },
  dateTagSecondaryText: {
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
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
    flexDirection: 'row',
    flexShrink: 0,
    gap: 2,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  statusIconWithLabel: {
    paddingHorizontal: 4,
    width: 'auto',
  },
  statusIconLabel: {
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
  },
  statusIconDone: {
    opacity: 0.55,
  },
});
