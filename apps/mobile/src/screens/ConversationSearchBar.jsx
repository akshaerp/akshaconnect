import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import Text from '../theme/AppText';
import TextInput from '../theme/AppTextInput';
import { colors } from '../theme/colors';

function formatSearchTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationSearchBar({
  visible,
  query,
  onChangeQuery,
  onSubmit,
  onClose,
  loading = false,
  error = '',
  results = [],
  currentIndex = -1,
  mode = 'matches',
  onModeChange,
  onSelectResult,
  onPrevious,
  onNext,
}) {
  if (!visible) return null;

  const count = results.length;
  const hasSelection = currentIndex >= 0 && currentIndex < count;
  const previousDisabled = !hasSelection || currentIndex >= count - 1;
  const nextDisabled = !hasSelection || currentIndex <= 0;

  return (
    <View
      style={[
        styles.shell,
        mode === 'matches' ? styles.shellMatches : null,
      ]}
    >
      <View style={styles.searchRow}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search messages"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          autoCapitalize="none"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run message search"
          onPress={onSubmit}
          disabled={loading || !String(query || '').trim()}
          style={({ pressed }) => [
            styles.searchButton,
            loading || !String(query || '').trim()
              ? styles.disabled
              : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close message search"
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.navigationRow}>
        <View style={styles.modeSwitch}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'matches' }}
            onPress={() => onModeChange?.('matches')}
            style={[
              styles.modeButton,
              mode === 'matches' ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === 'matches' ? styles.modeTextActive : null,
              ]}
            >
              Matches
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'conversation' }}
            onPress={() => onModeChange?.('conversation')}
            style={[
              styles.modeButton,
              mode === 'conversation' ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === 'conversation' ? styles.modeTextActive : null,
              ]}
            >
              Full chat
            </Text>
          </Pressable>
        </View>

        <Text style={styles.counter}>
          {count === 0 ? '0 / 0' : `${currentIndex + 1} / ${count}`}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous search result"
          disabled={previousDisabled}
          onPress={onPrevious}
          style={[
            styles.arrowButton,
            previousDisabled ? styles.disabled : null,
          ]}
        >
          <Text style={styles.arrowText}>↑</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next search result"
          disabled={nextDisabled}
          onPress={onNext}
          style={[
            styles.arrowButton,
            nextDisabled ? styles.disabled : null,
          ]}
        >
          <Text style={styles.arrowText}>↓</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'matches' ? (
        <View style={styles.resultsCard}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {count
                ? `${count} ${count === 1 ? 'match' : 'matches'}`
                : 'Search results'}
            </Text>
            {count ? (
              <Text style={styles.resultsHint}>
                Tap a message to open it
              </Text>
            ) : null}
          </View>

          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
          {results.map((item, index) => (
            <Pressable
              key={item.message_id}
              accessibilityRole="button"
              accessibilityLabel={`Open search result ${index + 1} of ${count}`}
              onPress={() => onSelectResult?.(index)}
              style={({ pressed }) => [
                styles.resultRow,
                index === currentIndex ? styles.resultRowSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.resultTopRow}>
                <Text style={styles.resultSender} numberOfLines={1}>
                  {item.sender_display_name || 'Member'}
                </Text>
                <Text style={styles.resultTime}>{formatSearchTime(item.created_at)}</Text>
              </View>
              <Text style={styles.resultBody} numberOfLines={3}>
                {item.body_text ||
                  (item.message_type === 'ATTACHMENT' ? 'Attachment' : '')}
              </Text>
              {item.reply_to_message_id ? (
                <Text style={styles.threadLabel}>Thread reply</Text>
              ) : null}
            </Pressable>
          ))}

            {!loading && String(query || '').trim() && count === 0 ? (
              <Text style={styles.empty}>No matching messages.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.shell,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 9,
  },
  shellMatches: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: '#DDE7F0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 10,
    color: colors.navy,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
  },
  searchButton: {
    minWidth: 74,
    minHeight: 42,
    marginLeft: 5,
    paddingHorizontal: 11,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  closeButton: {
    width: 40,
    height: 40,
    marginLeft: 5,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F8',
  },
  closeText: {
    marginTop: -2,
    color: colors.navy,
    fontSize: 24,
    lineHeight: 26,
  },
  navigationRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeSwitch: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    backgroundColor: '#EEF3F8',
  },
  modeButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C8D9EA',
  },
  modeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  modeTextActive: {
    color: colors.primary,
  },
  counter: {
    minWidth: 54,
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  arrowButton: {
    width: 36,
    height: 34,
    marginLeft: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D5E1EC',
    backgroundColor: '#F8FBFE',
  },
  arrowText: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  resultsCard: {
    flex: 1,
    minHeight: 0,
    marginTop: 9,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DEE8F1',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  resultsHeader: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7EDF3',
    backgroundColor: '#F9FBFD',
  },
  resultsTitle: {
    color: colors.navy,
    fontSize: 11.5,
    fontWeight: '900',
  },
  resultsHint: {
    color: colors.textMuted,
    fontSize: 9.5,
    fontWeight: '700',
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  resultRow: {
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7EDF3',
  },
  resultRowSelected: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brandOrange,
    backgroundColor: '#FFF8EE',
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultSender: {
    flex: 1,
    color: colors.navy,
    fontSize: 12,
    fontWeight: '900',
  },
  resultTime: {
    marginLeft: 8,
    color: colors.textMuted,
    fontSize: 9,
  },
  resultBody: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  threadLabel: {
    marginTop: 4,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
  },
  error: {
    marginTop: 7,
    color: colors.danger,
    fontSize: 10,
  },
  empty: {
    paddingVertical: 18,
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 11,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.75,
  },
});
