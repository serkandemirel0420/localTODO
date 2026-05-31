import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  formatCompactDateFilterLabel,
  formatCreatedMetaLabel,
  formatDateFilterValue,
  isDateFilterOverdue,
} from '../dates';
import {
  getFilterColorTheme,
  type FilterColorKey,
  type FilterColorSettings,
} from '../filterColors';
import {
  getCreatedAtMetaLookupValue,
  type MetaTagVisibility,
} from '../metaTags';
import { formatListLabel } from '../todos';

const FONT_MEDIUM = '500' as const;

type MetaTagDescriptor = {
  displayLabel: string;
  filterKey: FilterColorKey;
  isOverdue?: boolean;
  lookupValue: string;
};

type TodoMetaTagsProps = {
  createdAt?: number;
  dateLabel?: string;
  done?: boolean;
  filterColors: FilterColorSettings;
  listLabel?: string;
  priorityLabel?: string;
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
          backgroundColor: useOverdueStyle ? '#FFF0EE' : theme.tint,
          borderColor: useOverdueStyle ? '#F0C8C3' : theme.border,
        },
        done && styles.tagDone,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tagText,
          { color: useOverdueStyle ? '#CF413A' : theme.text },
          done && styles.tagTextDone,
        ]}
      >
        {descriptor.displayLabel}
      </Text>
    </View>
  );
}

function buildMetaTags(
  visibility: MetaTagVisibility,
  dateLabel: string | undefined,
  listLabel: string | undefined,
  priorityLabel: string | undefined,
  createdAt: number | undefined,
): MetaTagDescriptor[] {
  const tags: MetaTagDescriptor[] = [];

  if (visibility.date && dateLabel) {
    const lookupValue = formatDateFilterValue(dateLabel);
    tags.push({
      displayLabel: formatCompactDateFilterLabel(dateLabel),
      filterKey: 'date',
      isOverdue: isOverdueStatusLabel(dateLabel)
        || isDateFilterOverdue(dateLabel),
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

  if (visibility.createdAt && typeof createdAt === 'number') {
    tags.push({
      displayLabel: formatCreatedMetaLabel(createdAt),
      filterKey: 'date',
      lookupValue: getCreatedAtMetaLookupValue(createdAt),
    });
  }

  return tags;
}

function TodoMetaTagsComponent({
  createdAt,
  dateLabel,
  done,
  filterColors,
  listLabel,
  priorityLabel,
  visibility,
}: TodoMetaTagsProps) {
  const tags = buildMetaTags(
    visibility,
    dateLabel,
    listLabel,
    priorityLabel,
    createdAt,
  );

  if (tags.length === 0) {
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
    </View>
  );
}

export const TodoMetaTags = React.memo(TodoMetaTagsComponent);

const styles = StyleSheet.create({
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tag: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagDone: {
    opacity: 0.55,
  },
  tagText: {
    fontSize: 10,
    fontWeight: FONT_MEDIUM,
    lineHeight: 13,
  },
  tagTextDone: {
    opacity: 0.9,
  },
});
