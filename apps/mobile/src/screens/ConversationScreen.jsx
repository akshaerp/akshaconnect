import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
  markRead,
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

function compareMessages(left, right) {
  const leftTime = Date.parse(left?.created_at || '');
  const rightTime = Date.parse(right?.created_at || '');

  if (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    leftTime !== rightTime
  ) {
    return leftTime - rightTime;
  }

  return String(left?.message_id || '').localeCompare(
    String(right?.message_id || '')
  );
}

function mergeMessages(rows) {
  const byId = new Map();

  for (const message of rows) {
    if (!message?.message_id) continue;
    byId.set(message.message_id, message);
  }

  return [...byId.values()].sort(compareMessages);
}

function realtimeLabel(status) {
  if (status === 'connected') return 'Live';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'reconnecting') return 'Reconnecting…';
  return 'Offline';
}

export default function ConversationScreen({
  session,
  serverUrl,
  conversation,
  realtimeStatus,
  realtimeEvents,
  reconcileEpoch,
  onConversationRead,
  onBack,
}) {
  const token = session?.access_token || '';
  const currentMemberId =
    session?.membership?.workspace_member_id || '';

  const scrollRef = useRef(null);
  const lastRealtimeSequenceRef = useRef(0);
  const lastReconcileEpochRef = useRef(0);
  const lastMarkedReadMessageIdRef = useRef(null);
  const arrivalDividerReadyRef = useRef(false);

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
  const [newMessageDividerId, setNewMessageDividerId] =
    useState(null);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated });
    }, 30);
  }, []);

  useEffect(() => {
    const eventName =
      Platform.OS === 'ios'
        ? 'keyboardWillShow'
        : 'keyboardDidShow';

    const subscription = Keyboard.addListener(
      eventName,
      () => {
        scrollToBottom(false);
      }
    );

    return () => {
      subscription.remove();
    };
  }, [scrollToBottom]);

  const markMessageRead = useCallback(
    (messageId) => {
      if (
        !messageId ||
        !token ||
        !conversation?.conversationId ||
        lastMarkedReadMessageIdRef.current === messageId
      ) {
        return;
      }

      lastMarkedReadMessageIdRef.current = messageId;

      markRead(
        serverUrl,
        token,
        conversation.conversationId,
        messageId
      )
        .then(() => {
          onConversationRead?.(conversation.conversationId);
        })
        .catch(() => {
          if (lastMarkedReadMessageIdRef.current === messageId) {
            lastMarkedReadMessageIdRef.current = null;
          }
        });
    },
    [
      conversation?.conversationId,
      onConversationRead,
      serverUrl,
      token,
    ]
  );

  const loadLatest = useCallback(
    async ({
      refresh = false,
      reconcile = false,
    } = {}) => {
      if (!token || !conversation?.conversationId) return;

      if (refresh) {
        setRefreshing(true);
      } else if (!reconcile) {
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

        setMessages((current) =>
          mergeMessages([
            ...current,
            ...(result.messages || []),
          ])
        );

        setPage(
          result.page || {
            has_more: false,
            next_before_message_id: null,
          }
        );

        const latestRows = mergeMessages(
          result.messages || []
        );
        const latest =
          latestRows[latestRows.length - 1];

        if (latest?.message_id) {
          markMessageRead(latest.message_id);
        }
      } catch (requestError) {
        setError(
          requestError?.message || 'Could not load message history'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      conversation?.conversationId,
      markMessageRead,
      serverUrl,
      token,
    ]
  );

  useEffect(() => {
    let active = true;

    setMessages([]);
    setPage({
      has_more: false,
      next_before_message_id: null,
    });
    setDraft('');
    setError('');
    setNewMessageDividerId(null);

    arrivalDividerReadyRef.current = false;
    lastRealtimeSequenceRef.current = 0;
    lastMarkedReadMessageIdRef.current = null;

    loadLatest().finally(() => {
      if (active) {
        arrivalDividerReadyRef.current = true;
      }
    });

    return () => {
      active = false;
    };
  }, [
    conversation?.conversationId,
    loadLatest,
  ]);

  useEffect(() => {
    const pending = (realtimeEvents || []).filter(
      (envelope) =>
        Number(envelope?.sequence || 0) >
        lastRealtimeSequenceRef.current
    );

    if (pending.length === 0) {
      return;
    }

    lastRealtimeSequenceRef.current = Math.max(
      ...pending.map((envelope) =>
        Number(envelope.sequence)
      )
    );

    const incoming = pending
      .map((envelope) => envelope.payload)
      .filter(
        (payload) =>
          payload?.type === 'message.created' &&
          payload.conversation_id ===
            conversation?.conversationId &&
          payload.message
      )
      .map((payload) => payload.message);

    if (incoming.length === 0) {
      return;
    }

    const incomingFromOthers = incoming.filter(
      (message) =>
        !(
          message.sender_type === 'HUMAN' &&
          message.sender_member_id === currentMemberId
        )
    );

    if (
      arrivalDividerReadyRef.current &&
      incomingFromOthers.length > 0
    ) {
      const firstExternalIncoming =
        mergeMessages(incomingFromOthers)[0];

      if (firstExternalIncoming?.message_id) {
        setNewMessageDividerId(
          (current) =>
            current ||
            firstExternalIncoming.message_id
        );
      }
    }

    setMessages((current) =>
      mergeMessages([
        ...current,
        ...incoming,
      ])
    );

    const sortedIncoming = mergeMessages(incoming);
    const latestIncoming =
      sortedIncoming[sortedIncoming.length - 1];

    if (latestIncoming?.message_id) {
      markMessageRead(latestIncoming.message_id);
    }

    scrollToBottom(true);
  }, [
    conversation?.conversationId,
    currentMemberId,
    markMessageRead,
    realtimeEvents,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (
      reconcileEpoch <= lastReconcileEpochRef.current
    ) {
      return;
    }

    lastReconcileEpochRef.current = reconcileEpoch;

    loadLatest({
      reconcile: true,
    });
  }, [
    loadLatest,
    reconcileEpoch,
  ]);

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
        mergeMessages([
          ...(result.messages || []),
          ...current,
        ])
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
          mergeMessages([
            ...current,
            result.message,
          ])
        );
      } else {
        await loadLatest({ refresh: true });
      }

      setDraft('');
      scrollToBottom(true);
    } catch (requestError) {
      setError(
        requestError?.message || 'Could not send message'
      );
    } finally {
      setSending(false);
    }
  }

  const canSend =
    draft.trim().length > 0 &&
    draft.length <= MAX_MESSAGE_CHARS &&
    !sending;

  const live = realtimeStatus === 'connected';

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
        keyboardVerticalOffset={0}
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
            <Text
              style={styles.title}
              numberOfLines={1}
            >
              {conversation.kind === 'channel'
                ? `# ${conversation.title}`
                : conversation.title}
            </Text>

            <View style={styles.subtitleRow}>
              <Text
                style={styles.subtitle}
                numberOfLines={1}
              >
                {conversation.subtitle}
              </Text>

              <View
                style={[
                  styles.realtimePill,
                  live
                    ? styles.realtimePillConnected
                    : styles.realtimePillOffline,
                ]}
              >
                <View
                  style={[
                    styles.realtimeDot,
                    live
                      ? styles.realtimeDotConnected
                      : styles.realtimeDotOffline,
                  ]}
                />
                <Text
                  style={[
                    styles.realtimeText,
                    live
                      ? styles.realtimeTextConnected
                      : styles.realtimeTextOffline,
                  ]}
                >
                  {realtimeLabel(realtimeStatus)}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              loadLatest({ refresh: true })
            }
            disabled={refreshing}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.refreshText}>
              {refreshing ? '…' : '↻'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.history}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator
                color={colors.accent}
              />
              <Text style={styles.loadingText}>
                Loading messages…
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={
                styles.messageList
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios'
                  ? 'interactive'
                  : 'on-drag'
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() =>
                    loadLatest({
                      refresh: true,
                    })
                  }
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
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  {loadingOlder ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.accent}
                    />
                  ) : (
                    <Text
                      style={
                        styles.loadOlderText
                      }
                    >
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
                messages.map(
                  (message, index) => {
                    const previous =
                      messages[index - 1];

                    const showDate =
                      index === 0 ||
                      messageDateKey(
                        previous?.created_at
                      ) !==
                        messageDateKey(
                          message.created_at
                        );

                    const own =
                      message.sender_type ===
                        'HUMAN' &&
                      message.sender_member_id ===
                        currentMemberId;

                    const system =
                      message.sender_type ===
                      'SYSTEM';

                    const showNewMessages =
                      message.message_id ===
                      newMessageDividerId;

                    return (
                      <React.Fragment
                        key={message.message_id}
                      >
                        {showDate ? (
                          <View
                            style={styles.dateRow}
                          >
                            <View
                              style={
                                styles.dateLine
                              }
                            />
                            <Text
                              style={
                                styles.dateText
                              }
                            >
                              {formatMessageDate(
                                message.created_at
                              )}
                            </Text>
                            <View
                              style={
                                styles.dateLine
                              }
                            />
                          </View>
                        ) : null}

                        {showNewMessages ? (
                          <View
                            style={
                              styles.newMessagesRow
                            }
                          >
                            <View
                              style={
                                styles.newMessagesLine
                              }
                            />

                            <Text
                              style={
                                styles.newMessagesText
                              }
                            >
                              New messages
                            </Text>

                            <View
                              style={
                                styles.newMessagesLine
                              }
                            />
                          </View>
                        ) : null}

                        <MessageBubble
                          message={message}
                          own={own}
                          system={system}
                        />
                      </React.Fragment>
                    );
                  }
                )
              )}
            </ScrollView>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onFocus={() => {
              scrollToBottom(false);
            }}
            placeholder="Message"
            placeholderTextColor={
              colors.textMuted
            }
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
              !canSend
                ? styles.sendButtonDisabled
                : null,
              pressed && canSend
                ? styles.sendButtonPressed
                : null,
            ]}
          >
            {sending ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text style={styles.sendText}>
                Send
              </Text>
            )}
          </Pressable>
        </View>

        {draft.length >=
        MAX_MESSAGE_CHARS - 500 ? (
          <Text
            style={styles.characterCount}
          >
            {draft.length}/{MAX_MESSAGE_CHARS}
          </Text>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  own,
  system,
}) {
  if (system) {
    return (
      <View style={styles.systemMessage}>
        <Text style={styles.systemSender}>
          {message.sender_display_name ||
            'System'}
        </Text>

        <Text style={styles.systemBody}>
          {message.body_text ||
            'System event'}
        </Text>

        <Text style={styles.systemTime}>
          {formatMessageTime(
            message.created_at
          )}
        </Text>
      </View>
    );
  }

  const attachment =
    message.message_type === 'ATTACHMENT';

  const deleted = Boolean(
    message.deleted_at
  );

  return (
    <View
      style={[
        styles.messageRow,
        own
          ? styles.messageRowOwn
          : null,
      ]}
    >
      <View
        style={[
          styles.bubble,
          own
            ? styles.ownBubble
            : styles.otherBubble,
        ]}
      >
        <Text
          style={[
            styles.sender,
            own
              ? styles.ownSender
              : null,
          ]}
        >
          {own
            ? 'You'
            : message.sender_display_name ||
              'Member'}
        </Text>

        <Text
          style={[
            styles.body,
            own
              ? styles.ownBody
              : null,
            deleted
              ? styles.deletedBody
              : null,
          ]}
        >
          {deleted
            ? 'Message deleted'
            : attachment
              ? `Attachment: ${
                  message.body_text ||
                  'file'
                }`
              : message.body_text || ''}
        </Text>

        <Text
          style={[
            styles.time,
            own
              ? styles.ownTime
              : null,
          ]}
        >
          {formatMessageTime(
            message.created_at
          )}
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
    minHeight: 72,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderBottomWidth: 3,
    borderBottomColor: colors.teal,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#163D6A',
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
    fontSize: 17,
    fontWeight: '900',
  },
  subtitleRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    flexShrink: 1,
    color: '#C3D5E5',
    fontSize: 11,
  },
  realtimePill: {
    marginLeft: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  realtimePillConnected: {
    backgroundColor: '#0E4C4A',
  },
  realtimePillOffline: {
    backgroundColor: '#4A3823',
  },
  realtimeDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    marginRight: 4,
  },
  realtimeDotConnected: {
    backgroundColor: '#50E3C2',
  },
  realtimeDotOffline: {
    backgroundColor: colors.orange,
  },
  realtimeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  realtimeTextConnected: {
    color: '#CBFFF3',
  },
  realtimeTextOffline: {
    color: '#FFE2BC',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#163D6A',
  },
  refreshText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  newMessagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    marginBottom: 11,
  },
  newMessagesLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#FF8A00',
    opacity: 0.55,
  },
  newMessagesText: {
    marginHorizontal: 10,
    color: '#D96E00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  history: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 13,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  loadOlderText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
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
    backgroundColor: '#CFD9E3',
  },
  dateText: {
    marginHorizontal: 10,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
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
    borderRadius: 17,
    borderWidth: 1,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE5ED',
    borderBottomLeftRadius: 5,
  },
  ownBubble: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
    borderBottomRightRadius: 5,
  },
  sender: {
    marginBottom: 4,
    color: colors.navy,
    fontSize: 10,
    fontWeight: '900',
  },
  ownSender: {
    color: '#E9FFFB',
  },
  body: {
    color: '#243B53',
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
    color: '#D6FFF8',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8E6E4',
    backgroundColor: '#ECF8F6',
  },
  systemSender: {
    color: colors.navy,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  systemBody: {
    marginTop: 3,
    color: '#47637D',
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
    backgroundColor: '#FFF0F1',
    borderWidth: 1,
    borderColor: '#F3BBC0',
  },
  errorText: {
    color: '#A23B43',
    fontSize: 11,
    lineHeight: 16,
  },
  composer: {
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D2DDE7',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    color: colors.navy,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sendButton: {
    minWidth: 66,
    height: 46,
    marginLeft: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
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
    fontWeight: '900',
  },
  characterCount: {
    paddingRight: 12,
    paddingBottom: 5,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'right',
    backgroundColor: '#FFFFFF',
  },
});
