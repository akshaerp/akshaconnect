import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import Text from '../theme/AppText';
import { useAppAppearance } from '../theme/appearanceStore';

export default function MentionSuggestions({
  visible,
  items = [],
  loading = false,
  error = '',
  prefix = '@',
  onSelect,
}) {
  const { palette } = useAppAppearance();

  if (!visible) return null;

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.label,
            { color: palette.textMuted },
          ]}
        >
          {prefix === '@'
            ? 'Mention a person'
            : 'Reference a channel'}
        </Text>
        {loading ? <ActivityIndicator size="small" /> : null}
      </View>

      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.items}
      >
        {error ? (
          <Text style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <Text
            style={[
              styles.empty,
              { color: palette.textMuted },
            ]}
          >
            No matches
          </Text>
        ) : null}

        {!error
          ? items.map((item) => {
              const label =
                item.display_name ||
                item.channel_name ||
                item.label ||
                'Mention';

              return (
                <Pressable
                  key={item.target_id}
                  accessibilityRole="button"
                  accessibilityLabel={`${prefix}${label}`}
                  onPress={() => onSelect?.(item)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surfaceRaised,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.choiceText,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {prefix}{label}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    minHeight: 30,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
  },
  items: {
    minHeight: 46,
    paddingHorizontal: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  choice: {
    maxWidth: 220,
    marginRight: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 18,
  },
  choiceText: {
    fontSize: 12,
    fontWeight: '800',
  },
  empty: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 11,
  },
  errorText: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    fontSize: 11,
    color: '#B42318',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
