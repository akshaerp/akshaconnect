import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  listMessages,
  sendMessage,
} from '../api/client';
import { colors } from '../theme/colors';

const MAX_MESSAGE_CHARS = 8000;

function makeClientMessageId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMessageTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageDateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
}

function formatMessageDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const key = messageDateKey(value);

  if (key === messageDateKey(today)) return 'Today';
  if (key === messageDateKey(yesterday)) return 'Yesterday';

  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year:
      parsed.getFullYear() === today.getFullYear()
        ? undefined
        : 'numeric',
  });
}

function mergeMessages(rows) {
  const seen = new Set();

  return rows.filter((message) => {
    if (!message?.message_id || seen.has(message.message_id)) {
      return false;
    }

    seen.add(message.message_id);
    return true;
  });
}

export default function ConversationScreen({
  session,
  serverUrl,
  conversation,
  onBack,
}) {
  const token = session?.access_token || '';
  const currentMemberId =
    session?.membership?.workspace_member_id || '';

  const scrollRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState({
    has_more: false,
    next_before_message_id: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const loadLatest = useCallback(
    async ({ refresh = false } = {}) => {
      if (!token || !conversation?.conversationId) return;

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const result = await listMessages(
          serverUrl,
          token,
          conversation.conversationId,
          { limit: 50 }
        );

        setMessages(result.messages || []);
        setPage(
          result.page || {
            has_more: false,
            next_before_message_id: null,
          }
        );
      } catch (requestError) {
        setError(
          requestError?.message || 'Could not load message history'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [conversation?.conversationId, serverUrl, token]
  );

  useEffect(() => {
    setMessages([]);
    setPage({
      has_more: false,
      next_before_message_id: null,
    });
    setDraft('');
    setError('');
    loadLatest();
  }, [loadLatest]);

  async function loadOlder() {
    if (
      loadingOlder ||
      !page.has_more ||
      !page.next_before_message_id
    ) {
      return;
    }

    setLoadingOlder(true);
    setError('');

    try {
      const result = await listMessages(
        serverUrl,
        token,
        conversation.conversationId,
        {
          limit: 50,
          before: page.next_before_message_id,
        }
      );

      setMessages((current) =>
        mergeMessages([...(result.messages || []), ...current])
      );
      setPage(
        result.page || {
          has_more: false,
          next_before_message_id: null,
        }
      );
    } catch (requestError) {
      setError(
        requestError?.message || 'Could not load older messages'
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submitMessage() {
    const bodyText = draft.trim();

    if (!bodyText || sending) return;

    setSending(true);
    setError('');

    try {
      const result = await sendMessage(
        serverUrl,
        token,
        conversation.conversationId,
        {
          bodyText,
          clientMessageId: makeClientMessageId(),
        }
      );

      if (result?.message) {
        setMessages((current) =>
          mergeMessages([...current, result.message])
        );
      } else {
        await loadLatest({ refresh: true });
      }

      setDraft('');

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    } catch (requestError) {
      setError(requestError?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  const canSend =
    draft.trim().length > 0 &&
    draft.length <= MAX_MESSAGE_CHARS &&
    !sending;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {conversation.kind === 'channel'
                ? `# ${conversation.title}`
                : conversation.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {conversation.subtitle}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => loadLatest({ refresh: true })}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.refreshText}>
              {refreshing ? '…' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.history}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>
                Loading messages…
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.messageList}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadLatest({ refresh: true })}
                  tintColor={colors.accent}
                />
              }
              onContentSizeChange={() => {
                if (messages.length <= 50) {
                  scrollRef.current?.scrollToEnd({
                    animated: false,
                  });
                }
              }}
            >
              {page.has_more ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={loadOlder}
                  disabled={loadingOlder}
                  style={({ pressed }) => [
                    styles.loadOlderButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {loadingOlder ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.accent}
                    />
                  ) : (
                    <Text style={styles.loadOlderText}>
                      Load older messages
                    </Text>
                  )}
                </Pressable>
              ) : null}

              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>
                    No messages yet
                  </Text>
                  <Text style={styles.emptyText}>
                    Start the conversation below.
                  </Text>
                </View>
              ) : (
                messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const showDate =
                    index === 0 ||
                    messageDateKey(previous?.created_at) !==
                      messageDateKey(message.created_at);

                  const own =
                    message.sender_type === 'HUMAN' &&
                    message.sender_member_id === currentMemberId;

                  const system =
                    message.sender_type === 'SYSTEM';

                  return (
                    <React.Fragment key={message.message_id}>
                      {showDate ? (
                        <View style={styles.dateRow}>
                          <View style={styles.dateLine} />
                          <Text style={styles.dateText}>
                            {formatMessageDate(
                              message.created_at
                            )}
                          </Text>
                          <View style={styles.dateLine} />
                        </View>
                      ) : null}

                      <MessageBubble
                        message={message}
                        own={own}
                        system={system}
                      />
                    </React.Fragment>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={MAX_MESSAGE_CHARS}
            editable={!sending}
          />

          <Pressable
            accessibilityRole="button"
            onPress={submitMessage}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend ? styles.sendButtonDisabled : null,
              pressed && canSend ? styles.sendButtonPressed : null,
            ]}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>

        {draft.length >= MAX_MESSAGE_CHARS - 500 ? (
          <Text style={styles.characterCount}>
            {draft.length}/{MAX_MESSAGE_CHARS}
          </Text>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, own, system }) {
  if (system) {
    return (
      <View style={styles.systemMessage}>
        <Text style={styles.systemSender}>
          {message.sender_display_name || 'System'}
        </Text>
        <Text style={styles.systemBody}>
          {message.body_text || 'System event'}
        </Text>
        <Text style={styles.systemTime}>
          {formatMessageTime(message.created_at)}
        </Text>
      </View>
    );
  }

  const attachment = message.message_type === 'ATTACHMENT';
  const deleted = Boolean(message.deleted_at);

  return (
    <View
      style={[
        styles.messageRow,
        own ? styles.messageRowOwn : null,
      ]}
    >
      <View
        style={[
          styles.bubble,
          own ? styles.ownBubble : styles.otherBubble,
        ]}
      >
        <Text
          style={[
            styles.sender,
            own ? styles.ownSender : null,
          ]}
        >
          {own
            ? 'You'
            : message.sender_display_name || 'Member'}
        </Text>

        <Text
          style={[
            styles.body,
            own ? styles.ownBody : null,
            deleted ? styles.deletedBody : null,
          ]}
        >
          {deleted
            ? 'Message deleted'
            : attachment
              ? `Attachment: ${message.body_text || 'file'}`
              : message.body_text || ''}
        </Text>

        <Text
          style={[
            styles.time,
            own ? styles.ownTime : null,
          ]}
        >
          {formatMessageTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#263247',
    backgroundColor: colors.shell,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1C2739',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    marginTop: -3,
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 38,
  },
  headerCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  refreshButton: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#1C2739',
  },
  refreshText: {
    color: '#DCE5F3',
    fontSize: 11,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  history: {
    flex: 1,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
  },
  loadOlderButton: {
    alignSelf: 'center',
    minHeight: 38,
    marginBottom: 14,
    paddingHorizontal: 16,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C2739',
  },
  loadOlderText: {
    color: '#BFD2F5',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 12,
  },
  dateRow: {
    marginVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A374C',
  },
  dateText: {
    marginHorizontal: 10,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  messageRow: {
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  messageRowOwn: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 8,
    borderRadius: 16,
  },
  otherBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 5,
  },
  ownBubble: {
    backgroundColor: '#2463C7',
    borderBottomRightRadius: 5,
  },
  sender: {
    marginBottom: 4,
    color: '#8FB1EA',
    fontSize: 10,
    fontWeight: '800',
  },
  ownSender: {
    color: '#D7E6FF',
  },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  ownBody: {
    color: '#FFFFFF',
  },
  deletedBody: {
    fontStyle: 'italic',
    opacity: 0.72,
  },
  time: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'right',
  },
  ownTime: {
    color: '#BFD3F7',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#172133',
  },
  systemSender: {
    color: '#A9BAD4',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  systemBody: {
    marginTop: 3,
    color: '#D2DCEB',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  systemTime: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
  },
  errorBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#3A1E24',
    borderWidth: 1,
    borderColor: '#6C2937',
  },
  errorText: {
    color: '#FFB4C2',
    fontSize: 11,
    lineHeight: 16,
  },
  composer: {
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#263247',
    backgroundColor: '#111A29',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendButton: {
    minWidth: 66,
    height: 46,
    marginLeft: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendButtonPressed: {
    opacity: 0.82,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  characterCount: {
    paddingRight: 12,
    paddingBottom: 5,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'right',
    backgroundColor: '#111A29',
  },
});
