import React, { useEffect, useState } from 'react';
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
import {
  scaleTextMetric,
  useAppAppearance,
} from '../theme/appearanceStore';

export const CONVERSATION_COMPOSER_MIN_HEIGHT = 46;
export const CONVERSATION_COMPOSER_LINE_HEIGHT = 20;
export const CONVERSATION_COMPOSER_MAX_LINES = 10;
export const CONVERSATION_COMPOSER_MAX_HEIGHT =
  CONVERSATION_COMPOSER_LINE_HEIGHT *
    CONVERSATION_COMPOSER_MAX_LINES +
  22;


export const COMPOSER_EMOJIS = Object.freeze([
  '😀', '😃', '😄', '😁', '😂', '😊', '🙂', '😉',
  '😍', '🥰', '😎', '🤔', '😅', '😭', '😡', '👍',
  '👎', '👏', '🙌', '🙏', '💪', '🤝', '👌', '✅',
  '❌', '🎉', '🔥', '❤️', '💯', '👀', '🚀', '📌',
  '📎', '💡', '📝', '☕',
]);

export function buildComposerEmojiChoices(recentEmojis = []) {
  return [
    ...new Set([
      ...(recentEmojis || []).filter(Boolean),
      ...COMPOSER_EMOJIS,
    ]),
  ];
}

export function ConversationEmojiPicker({
  visible,
  recentEmojis = [],
  allEmojis = COMPOSER_EMOJIS,
  onSelect,
}) {
  const { palette } = useAppAppearance();
  if (!visible) return null;

  const recent = [...new Set(
    (recentEmojis || []).filter(Boolean)
  )].slice(0, 8);
  const all = [
    ...new Set((allEmojis || COMPOSER_EMOJIS).filter(Boolean)),
  ];

  function renderEmoji(emoji, prefix) {
    return (
      <Pressable
        key={`${prefix}-${emoji}`}
        accessibilityRole="button"
        accessibilityLabel={`Insert ${emoji}`}
        onPress={() => onSelect?.(emoji)}
        style={({ pressed }) => [
          styles.emojiChoice,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.emojiChoiceText}>
          {emoji}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.emojiPicker, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.emojiPickerContent}
      >
        {recent.length ? (
          <>
            <Text style={styles.emojiSectionLabel}>
              Recent
            </Text>
            <View style={styles.emojiGrid}>
              {recent.map((emoji) =>
                renderEmoji(emoji, 'recent')
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.emojiSectionLabel}>
          All emoji
        </Text>
        <View style={styles.emojiGrid}>
          {all.map((emoji) =>
            renderEmoji(emoji, 'all')
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function clampComposerHeight(
  value,
  maxHeight = CONVERSATION_COMPOSER_MAX_HEIGHT
) {
  const measured = Number(value || 0);
  if (!Number.isFinite(measured) || measured <= 0) {
    return CONVERSATION_COMPOSER_MIN_HEIGHT;
  }

  return Math.max(
    CONVERSATION_COMPOSER_MIN_HEIGHT,
    Math.min(
      maxHeight,
      Math.ceil(measured)
    )
  );
}

export function ConversationHeader({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel = 'Back',
  statusLabel = '',
  statusTone = 'offline',
  customStatus = '',
  rightAccessory = null,
  style = null,
}) {
  const { palette } = useAppAppearance();
  const showStatus = Boolean(statusLabel);
  const showCustomStatus = Boolean(customStatus);

  return (
    <View style={[styles.header, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
        onPress={onBack}
        style={({ pressed }) => [
          styles.headerButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.headerButtonText}>‹</Text>
      </Pressable>

      <View style={styles.headerCopy}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {showCustomStatus ? (
            <View style={styles.headerCustomStatus}>
              <Text style={styles.headerCustomStatusText} numberOfLines={1}>
                {customStatus}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerSubtitleRow}>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}

          {showStatus ? (
            <View
              style={[
                styles.statusPill,
                statusTone === 'connected'
                  ? styles.statusPillConnected
                  : statusTone === 'away'
                    ? styles.statusPillAway
                    : styles.statusPillOffline,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  statusTone === 'connected'
                    ? styles.statusDotConnected
                    : statusTone === 'away'
                      ? styles.statusDotAway
                      : styles.statusDotOffline,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  statusTone === 'connected'
                    ? styles.statusTextConnected
                    : statusTone === 'away'
                      ? styles.statusTextAway
                      : styles.statusTextOffline,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {rightAccessory ? (
        <View style={styles.headerAccessory}>
          {rightAccessory}
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );
}

export function ConversationComposer({
  inputRef,
  value,
  onChangeText,
  onFocus,
  placeholder = 'Message',
  maxLength = 8000,
  editable = true,
  onAttach,
  attachmentDisabled = false,
  attaching = false,
  onEmojiPress = null,
  emojiOpen = false,
  onSend,
  sendDisabled = false,
  sending = false,
  sendLabel = 'Send',
}) {
  const { textScale, palette } = useAppAppearance();
  const composerMaxHeight =
    scaleTextMetric(
      CONVERSATION_COMPOSER_LINE_HEIGHT,
      textScale
    ) *
      CONVERSATION_COMPOSER_MAX_LINES +
    22;

  const [inputHeight, setInputHeight] = useState(
    CONVERSATION_COMPOSER_MIN_HEIGHT
  );

  useEffect(() => {
    if (!value) {
      setInputHeight(CONVERSATION_COMPOSER_MIN_HEIGHT);
      return;
    }

    setInputHeight((current) =>
      Math.min(current, composerMaxHeight)
    );
  }, [composerMaxHeight, value]);

  const canUseAttachment =
    typeof onAttach === 'function' && !attachmentDisabled;
  const canUseEmoji = typeof onEmojiPress === 'function';

  return (
    <View style={[styles.composer, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach files"
        onPress={onAttach}
        disabled={!canUseAttachment}
        style={({ pressed }) => [
          styles.attachButton,
          !canUseAttachment ? styles.controlDisabled : null,
          pressed && canUseAttachment ? styles.pressed : null,
        ]}
      >
        {attaching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.attachButtonIcon}>＋</Text>
        )}
      </Pressable>

      <View style={styles.composerInputShell}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onContentSizeChange={(event) => {
            const nextHeight = clampComposerHeight(
              event.nativeEvent?.contentSize?.height,
              composerMaxHeight
            );
            setInputHeight(nextHeight);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            {
              height: inputHeight,
              maxHeight: composerMaxHeight,
              color: palette.textPrimary,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
            canUseEmoji ? styles.inputWithEmoji : null,
          ]}
          multiline
          maxLength={maxLength}
          editable={editable}
          textAlignVertical="top"
          scrollEnabled={
            inputHeight >= composerMaxHeight
          }
        />

        {canUseEmoji ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose emoji"
            accessibilityState={{ expanded: Boolean(emojiOpen) }}
            onPress={onEmojiPress}
            disabled={!editable}
            hitSlop={8}
            style={({ pressed }) => [
              styles.inlineEmojiButton,
              emojiOpen ? styles.inlineEmojiButtonOpen : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.inlineEmojiButtonText}>😊</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
        onPress={onSend}
        disabled={sendDisabled}
        style={({ pressed }) => [
          styles.sendButton,
          sendDisabled ? styles.controlDisabled : null,
          pressed && !sendDisabled ? styles.pressed : null,
        ]}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.sendText}>{sendLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function JumpToLatestButton({
  visible,
  onPress,
  unreadCount = 0,
}) {
  if (!visible) return null;

  const count = Math.max(0, Number(unreadCount || 0));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Jump to latest message"
      onPress={onPress}
      style={({ pressed }) => [
        styles.jumpToLatest,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.jumpToLatestIcon}>↓</Text>
      {count > 0 ? (
        <View style={styles.jumpBadge}>
          <Text style={styles.jumpBadgeText}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 72,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.22)',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  headerButtonText: {
    marginTop: -3,
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 38,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerCustomStatus: {
    maxWidth: '45%',
    marginLeft: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCustomStatusText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  headerSubtitleRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitle: {
    flexShrink: 1,
    color: '#C3D5E5',
    fontSize: 11,
  },
  headerAccessory: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  headerSpacer: {
    width: 40,
  },
  statusPill: {
    marginLeft: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPillConnected: {
    backgroundColor: '#0D5B47',
  },
  statusPillAway: {
    backgroundColor: '#6A4A1F',
  },
  statusPillOffline: {
    backgroundColor: '#3D4654',
  },
  statusDot: {
    width: 5,
    height: 5,
    marginRight: 4,
    borderRadius: 99,
  },
  statusDotConnected: {
    backgroundColor: colors.brandGreen,
  },
  statusDotAway: {
    backgroundColor: colors.brandOrange,
  },
  statusDotOffline: {
    backgroundColor: '#94A3B8',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },
  statusTextConnected: {
    color: '#CBFFF3',
  },
  statusTextAway: {
    color: '#FFE2BC',
  },
  statusTextOffline: {
    color: '#D7E0EA',
  },
  composer: {
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D2DDE7',
    backgroundColor: colors.surface,
  },
  attachButton: {
    width: 46,
    height: 46,
    marginRight: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C9DCEF',
    backgroundColor: '#EDF6FF',
  },
  attachButtonIcon: {
    marginTop: -2,
    color: colors.primary,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
  },
  composerInputShell: {
    flex: 1,
    position: 'relative',
  },
  input: {
    width: '100%',
    minHeight: CONVERSATION_COMPOSER_MIN_HEIGHT,
    maxHeight: CONVERSATION_COMPOSER_MAX_HEIGHT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.navy,
    fontSize: 14,
    lineHeight: CONVERSATION_COMPOSER_LINE_HEIGHT,
  },
  inputWithEmoji: {
    paddingRight: 44,
  },
  inlineEmojiButton: {
    position: 'absolute',
    right: 8,
    bottom: 7,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineEmojiButtonOpen: {
    backgroundColor: '#E6F2FF',
  },
  inlineEmojiButtonText: {
    fontSize: 21,
  },
  sendButton: {
    minWidth: 66,
    height: 46,
    marginLeft: 8,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  controlDisabled: {
    opacity: 0.35,
  },
  jumpToLatest: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D8E8',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0E2455',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  jumpToLatestIcon: {
    marginTop: -2,
    color: colors.primary,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '900',
  },
  jumpBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandOrange,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  jumpBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  emojiPicker: {
    maxHeight: 220,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  emojiPickerContent: {
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 11,
  },
  emojiSectionLabel: {
    marginBottom: 6,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emojiGrid: {
    marginBottom: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  emojiChoice: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4EBF2',
    backgroundColor: '#F7FAFD',
  },
  emojiChoiceText: {
    fontSize: 20,
  },
  pressed: {
    opacity: 0.78,
  },
});
