import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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

export const CONVERSATION_COMPOSER_MIN_HEIGHT = 44;
export const CONVERSATION_COMPOSER_LINE_HEIGHT = 20;
export const CONVERSATION_COMPOSER_MAX_LINES = 6;
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
  const {
    textScale,
    palette,
  } = useAppAppearance();

  const composerMaxHeight =
    scaleTextMetric(
      CONVERSATION_COMPOSER_LINE_HEIGHT,
      textScale
    ) *
      CONVERSATION_COMPOSER_MAX_LINES +
    22;

  const [
    inputHeight,
    setInputHeight,
  ] = useState(
    CONVERSATION_COMPOSER_MIN_HEIGHT
  );

  const [
    keyboardVisible,
    setKeyboardVisible,
  ] = useState(
    Boolean(
      Keyboard.isVisible?.()
    )
  );

  useEffect(() => {
    const showSubscription =
      Keyboard.addListener(
        'keyboardDidShow',
        () => {
          setKeyboardVisible(
            true
          );
        },
      );

    const hideSubscription =
      Keyboard.addListener(
        'keyboardDidHide',
        () => {
          setKeyboardVisible(
            false
          );
        },
      );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!value) {
      setInputHeight(
        CONVERSATION_COMPOSER_MIN_HEIGHT
      );
      return;
    }

    setInputHeight(
      (current) =>
        Math.min(
          current,
          composerMaxHeight
        )
    );
  }, [
    composerMaxHeight,
    value,
  ]);

  const canUseAttachment =
    typeof onAttach === 'function' &&
    !attachmentDisabled;

  const canUseEmoji =
    typeof onEmojiPress ===
    'function';

  const composing =
    keyboardVisible;

  function renderAttachButton({
    toolbar = false,
  } = {}) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach files"
        onPress={onAttach}
        disabled={
          !canUseAttachment
        }
        style={({
          pressed,
        }) => [
          styles.attachButton,
          toolbar
            ? styles.toolbarAttachButton
            : null,
          {
            backgroundColor:
              palette.surfaceRaised,
            borderColor:
              palette.border,
          },
          !canUseAttachment
            ? styles.controlDisabled
            : null,
          pressed &&
          canUseAttachment
            ? styles.pressed
            : null,
        ]}
      >
        {attaching ? (
          <ActivityIndicator
            size="small"
            color={
              colors.primary
            }
          />
        ) : (
          <Text
            style={
              styles.attachButtonIcon
            }
          >
            ＋
          </Text>
        )}
      </Pressable>
    );
  }

  function renderEmojiButton({
    toolbar = false,
  } = {}) {
    if (
      !canUseEmoji
    ) {
      return null;
    }

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose emoji"
        accessibilityState={{
          expanded:
            Boolean(
              emojiOpen
            ),
        }}
        onPress={
          onEmojiPress
        }
        disabled={
          !editable
        }
        hitSlop={8}
        style={({
          pressed,
        }) => [
          styles.composerActionButton,
          toolbar
            ? null
            : styles.compactEmojiButton,
          {
            backgroundColor:
              emojiOpen
                ? palette.surfaceRaised
                : palette.input,
            borderColor:
              palette.border,
          },
          pressed
            ? styles.pressed
            : null,
        ]}
      >
        <Text
          style={
            styles.inlineEmojiButtonText
          }
        >
          😊
        </Text>
      </Pressable>
    );
  }

  function renderSendButton({
    toolbar = false,
  } = {}) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          sendLabel
        }
        onPress={
          onSend
        }
        disabled={
          sendDisabled
        }
        style={({
          pressed,
        }) => [
          styles.sendButton,
          toolbar
            ? styles.toolbarSendButton
            : null,
          sendLabel !== 'Send'
            ? styles.sendButtonWide
            : null,
          sendDisabled
            ? styles.controlDisabled
            : null,
          pressed &&
          !sendDisabled
            ? styles.pressed
            : null,
        ]}
      >
        {sending ? (
          <ActivityIndicator
            color="#FFFFFF"
          />
        ) : sendLabel ===
          'Send' ? (
          <Text
            style={
              styles.sendArrow
            }
          >
            ↑
          </Text>
        ) : (
          <Text
            style={
              styles.sendText
            }
          >
            {sendLabel}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.composer,
        composing
          ? styles.composerExpanded
          : styles.composerCompact,
        {
          backgroundColor:
            palette.surface,
          borderTopColor:
            palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.composerInputRow,
          composing
            ? styles.composerInputRowExpanded
            : null,
        ]}
      >
        <View
          style={[
            styles.compactLeadingSlot,
            composing
              ? styles.composerCompactSlotHidden
              : null,
          ]}
        >
          {renderAttachButton()}
        </View>

        <View
          style={[
            styles.composerInputShell,
            composing
              ? styles.composerInputShellExpanded
              : null,
            {
              backgroundColor:
                palette.input,
              borderColor:
                palette.border,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={
              onChangeText
            }
            onFocus={(
              event
            ) => {
              onFocus?.(
                event
              );
            }}
            onContentSizeChange={(
              event
            ) => {
              const nextHeight =
                clampComposerHeight(
                  event
                    .nativeEvent
                    ?.contentSize
                    ?.height,
                  composerMaxHeight
                );

              setInputHeight(
                nextHeight
              );
            }}
            placeholder={
              placeholder
            }
            placeholderTextColor={
              palette.textMuted
            }
            style={[
              styles.input,
              {
                height:
                  inputHeight,
                maxHeight:
                  composerMaxHeight,
                color:
                  palette.textPrimary,
                backgroundColor:
                  'transparent',
              },
            ]}
            multiline
            maxLength={
              maxLength
            }
            editable={
              editable
            }
            textAlignVertical="top"
            scrollEnabled={
              inputHeight >=
              composerMaxHeight
            }
          />
        </View>

        <View
          style={[
            styles.compactActions,
            composing
              ? styles.composerCompactSlotHidden
              : null,
          ]}
        >
          {renderEmojiButton()}
          {renderSendButton()}
        </View>
      </View>

      {composing ? (
        <View
          style={
            styles.composerToolbar
          }
        >
          {renderAttachButton({
            toolbar: true,
          })}

          <View
            style={
              styles.composerToolbarSpacer
            }
          />

          {renderEmojiButton({
            toolbar: true,
          })}

          {renderSendButton({
            toolbar: true,
          })}
        </View>
      ) : null}
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
    minHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor: '#D2DDE7',
    backgroundColor: colors.surface,
  },
  attachButton: {
    width: 44,
    height: 44,
    marginRight: 7,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    minHeight:
      CONVERSATION_COMPOSER_MIN_HEIGHT,
    position: 'relative',
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  input: {
    width: '100%',
    minHeight:
      CONVERSATION_COMPOSER_MIN_HEIGHT,
    maxHeight:
      CONVERSATION_COMPOSER_MAX_HEIGHT,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.navy,
    fontSize: 14,
    lineHeight:
      CONVERSATION_COMPOSER_LINE_HEIGHT,
  },
  inputWithEmoji: {
    paddingRight: 44,
  },
  inlineEmojiButton: {
    position: 'absolute',
    right: 6,
    bottom: 5,
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
    width: 44,
    height: 44,
    marginLeft: 7,
    paddingHorizontal: 0,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendButtonWide: {
    width: 'auto',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  sendArrow: {
    marginTop: -2,
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '800',
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
  },
  composerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerExpanded: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: 8,
    paddingBottom: 7,
  },
  composerInputRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  composerInputRowExpanded: {
    alignItems: 'stretch',
  },
  compactLeadingSlot: {
    flexShrink: 0,
  },
  compactActions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerCompactSlotHidden: {
    display: 'none',
  },
  composerInputShellExpanded: {
    width: '100%',
  },
  composerToolbar: {
    width: '100%',
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerToolbarSpacer: {
    flex: 1,
  },
  composerActionButton: {
    width: 40,
    height: 40,
    marginLeft: 7,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactEmojiButton: {
    marginLeft: 7,
  },
  toolbarAttachButton: {
    marginRight: 0,
  },
  toolbarSendButton: {
    marginLeft: 7,
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
