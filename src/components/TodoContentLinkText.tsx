import React from 'react';
import {
  type GestureResponderEvent,
  StyleSheet,
  Text,
  type TextProps,
} from 'react-native';

const TODO_CONTENT_URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>{}\[\]"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>{}\[\]"']*)?/giu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:]+$/u;

type TodoContentTextSegment = {
  text: string;
  url?: string;
};

const trimTrailingUrlPunctuation = (value: string) => {
  let nextValue = value.replace(TRAILING_URL_PUNCTUATION_PATTERN, '');
  const pairs: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ];

  pairs.forEach(([open, close]) => {
    while (nextValue.endsWith(close)) {
      const openCount = [...nextValue].filter((char) => char === open).length;
      const closeCount = [...nextValue].filter((char) => char === close).length;

      if (closeCount <= openCount) {
        break;
      }

      nextValue = nextValue.slice(0, -1);
    }
  });

  return nextValue;
};

export const normalizeTodoContentUrl = (value: string) => (
  /^https?:\/\//iu.test(value) ? value : `https://${value}`
);

export const getTodoContentTextSegments = (text: string): TodoContentTextSegment[] => {
  const segments: TodoContentTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TODO_CONTENT_URL_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const matchedText = match[0];

    if (matchIndex > 0 && text[matchIndex - 1] === '@') {
      continue;
    }

    const linkText = trimTrailingUrlPunctuation(matchedText);
    if (!linkText) {
      continue;
    }

    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex) });
    }

    segments.push({
      text: linkText,
      url: normalizeTodoContentUrl(linkText),
    });

    cursor = matchIndex + linkText.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text }];
};

type TodoContentLinkTextProps = Omit<TextProps, 'children'> & {
  onOpenLinkOptions: (url: string) => void;
  renderTextSegment?: (text: string, key: string) => React.ReactNode;
  skipTrailingTruncatedLink?: boolean;
  text: string;
};

export function TodoContentLinkText({
  onOpenLinkOptions,
  renderTextSegment,
  skipTrailingTruncatedLink = false,
  style,
  text,
  ...textProps
}: TodoContentLinkTextProps) {
  const segments = getTodoContentTextSegments(text);
  const renderSegment = renderTextSegment ?? ((value: string) => value);

  return (
    <Text {...textProps} style={style}>
      {segments.map((segment, index) => {
        const key = `content-segment-${index}`;
        const trailingText = segments
          .slice(index + 1)
          .map((nextSegment) => nextSegment.text)
          .join('');
        const isTruncatedTrailingLink =
          skipTrailingTruncatedLink &&
          Boolean(segment.url) &&
          /^\.{3}$/u.test(trailingText);

        if (!segment.url || isTruncatedTrailingLink) {
          return (
            <React.Fragment key={key}>
              {renderSegment(segment.text, key)}
            </React.Fragment>
          );
        }

        const handlePress = (event: GestureResponderEvent) => {
          event.stopPropagation();
          onOpenLinkOptions(segment.url!);
        };

        return (
          <Text
            accessibilityLabel={`Link: ${segment.text}`}
            accessibilityRole="link"
            key={key}
            onPress={handlePress}
            style={styles.link}
          >
            {renderSegment(segment.text, key)}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#315FCC',
    textDecorationLine: 'underline',
  },
});
