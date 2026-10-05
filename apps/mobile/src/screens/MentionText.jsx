import React from 'react';
import { StyleSheet } from 'react-native';
import Text from '../theme/AppText';
import { colors } from '../theme/colors';
import { useAppAppearance } from '../theme/appearanceStore';
import { splitMentionText } from '../mentions/mentionUtils';

export default function MentionText({
  value,
  mentions = [],
  style,
  onMentionPress,
}) {
  const { darkMode } = useAppAppearance();
  const segments = splitMentionText(
    value,
    mentions
  );

  const mentionColor =
    darkMode
      ? '#62B5FF'
      : colors.primary;

  return (
    <Text style={style}>
      {segments.map(
        (segment, index) => {
          const actionable =
            Boolean(
              segment.mention &&
              onMentionPress
            );

          return (
            <Text
              key={`${index}-${segment.text}`}
              accessibilityRole={
                actionable
                  ? 'link'
                  : undefined
              }
              accessibilityLabel={
                actionable
                  ? `Open ${segment.text}`
                  : undefined
              }
              onPress={
                actionable
                  ? (event) => {
                      event
                        ?.stopPropagation
                        ?.();

                      onMentionPress(
                        segment.mention
                      );
                    }
                  : undefined
              }
              style={
                segment.mention
                  ? [
                      styles.mention,
                      {
                        color:
                          mentionColor,
                      },
                    ]
                  : null
              }
            >
              {segment.text}
            </Text>
          );
        }
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  mention: {
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
