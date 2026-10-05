import React from 'react';
import { StyleSheet } from 'react-native';
import Text from '../theme/AppText';
import { splitMentionText } from '../mentions/mentionUtils';

export default function MentionText({ value, mentions = [], style }) {
  const segments = splitMentionText(value, mentions);
  return (
    <Text style={style}>
      {segments.map((segment, index) => (
        <Text
          key={`${index}-${segment.text}`}
          style={segment.mention ? styles.mention : null}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  mention: { fontWeight: '900', textDecorationLine: 'underline' },
});
