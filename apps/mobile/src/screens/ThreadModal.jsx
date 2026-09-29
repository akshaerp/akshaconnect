import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  keepLocalCopy,
  pick,
  types as documentTypes,
} from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  downloadAttachmentToCache,
  listThread,
  sendMessage,
  uploadAttachment,
} from '../api/client';
import { colors } from '../theme/colors';
import {
  ConversationComposer,
  ConversationHeader,
  JumpToLatestButton,
} from './ConversationChrome.jsx';

const MAX_PENDING_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const PICK_TYPES = [
  documentTypes.images,
  documentTypes.pdf,
  documentTypes.plainText,
  documentTypes.csv,
  documentTypes.docx,
  documentTypes.xlsx,
  documentTypes.pptx,
].flat();

function makeClientMessageId() {
  return `mobile-thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.message_id) map.set(row.message_id, row);
  }
  return [...map.values()].sort((a, b) => {
    const byTime = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
    return byTime || String(a.message_id).localeCompare(String(b.message_id));
  });
}

function localPathFromUri(value) {
  const raw = String(value || '').replace(/^file:\/\//, '');
  try { return decodeURI(raw); } catch { return raw; }
}

async function prepareLocalCopy(item) {
  const result = await keepLocalCopy({
    files: [{ uri: item.uri, fileName: item.name || `thread-${item.clientMessageId}` }],
    destination: 'cachesDirectory',
  });
  const copy = result?.[0];
  if (!copy || copy.status !== 'success' || !copy.localUri) {
    throw new Error(copy?.copyError || 'Could not prepare attachment');
  }
  return localPathFromUri(copy.localUri);
}

function sameIdentityValue(left, right) {
  const normalizedLeft = String(left || '').trim().toLowerCase();
  const normalizedRight = String(right || '').trim().toLowerCase();

  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    normalizedLeft === normalizedRight
  );
}

function ThreadMessage({
  message,
  currentMemberId,
  currentPrimaryEmail,
  onOpenAttachment,
}) {
  const deleted = Boolean(message.deleted_at);
  const own =
    message.sender_type === 'HUMAN' &&
    (
      sameIdentityValue(
        message.sender_member_id,
        currentMemberId
      ) ||
      sameIdentityValue(
        message.sender_primary_email,
        currentPrimaryEmail
      )
    );

  return (
    <View
      style={[
        styles.v16oMessageRow,
        own ? styles.v16oMessageRowOwn : styles.v16oMessageRowOther,
      ]}
    >
      {!own ? (
        <View style={styles.v16oAvatar}>
          <Text style={styles.v16oAvatarText}>
            {String(message.sender_display_name || 'M')
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.v16oMessageBubble,
          own
            ? styles.v16oMessageBubbleOwn
            : styles.v16oMessageBubbleOther,
        ]}
      >
        <View style={styles.v16oMetaRow}>
          <Text
            style={[
              styles.v16oSender,
              own ? styles.v16oSenderOwn : null,
            ]}
          >
            {own ? 'You' : message.sender_display_name || 'Member'}
          </Text>

          <Text style={styles.v16oTime}>
            {formatTime(message.created_at)}
          </Text>

          {message.edited_at && !deleted ? (
            <Text style={styles.v16oEdited}>edited</Text>
          ) : null}
        </View>

        {deleted ? (
          <Text style={styles.v16oDeleted}>Message deleted</Text>
        ) : message.message_type !== 'ATTACHMENT' ? (
          <Text style={styles.v16oBody}>
            {message.body_text || ''}
          </Text>
        ) : null}

        {!deleted && Array.isArray(message.attachments)
          ? message.attachments.map((attachment) => (
              <Pressable
                key={attachment.attachment_id}
                style={[
                  styles.v16oAttachment,
                  own ? styles.v16oAttachmentOwn : null,
                ]}
                onPress={() => onOpenAttachment(attachment)}
              >
                <Text
                  style={styles.v16oAttachmentName}
                  numberOfLines={1}
                >
                  {attachment.file_name}
                </Text>
                <Text style={styles.v16oAttachmentMeta}>
                  {formatSize(attachment.size_bytes)} · Open
                </Text>
              </Pressable>
            ))
          : null}

        {own && Number(message.read_by_count || 0) > 0 ? (
          <Text style={styles.v16oReadReceipt}>
            ✓✓ Read by {Number(message.read_by_count || 0)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ThreadModal({
  visible,
  serverUrl,
  token,
  conversationId,
  parentMessage,
  realtimeEvents,
  currentMemberId,
  currentPrimaryEmail,
  onClose,
  onRead,
}) {
  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const lastSequenceRef = useRef(0);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const parentId = parentMessage?.message_id || '';

  function scrollToLatest(animated = true) {
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    if (!visible || !parentId || !conversationId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setParent(parentMessage);
    setReplies([]);
    setDraft('');
    setPending([]);
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
    listThread(serverUrl, token, conversationId, parentId)
      .then((result) => {
        if (cancelled) return;
        setParent(result.parent || parentMessage);
        setReplies(result.replies || []);
        const latest = (result.replies || []).at(-1);
        if (latest?.message_id) onRead?.(latest.message_id);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: false });
        });
      })
      .catch((requestError) => { if (!cancelled) setError(requestError?.message || 'Could not load thread'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, parentId, conversationId, token, serverUrl, parentMessage, onRead]);

  useEffect(() => {
    if (!visible || !Array.isArray(realtimeEvents)) return;
    const events = realtimeEvents.filter((event) => Number(event?.sequence || 0) > lastSequenceRef.current);
    for (const event of events) {
      lastSequenceRef.current = Math.max(lastSequenceRef.current, Number(event?.sequence || 0));
      const payload = event?.payload || event;
      const message = payload?.message;
      if (!message || payload?.conversation_id !== conversationId) continue;
      if (message.message_id === parentId) {
        setParent(message);
        continue;
      }
      if (message.reply_to_message_id !== parentId) continue;
      if (payload.type === 'message.created') {
        setReplies((current) => mergeById([...current, message]));
        onRead?.(message.message_id);
        if (nearBottomRef.current) {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
          });
        } else {
          setShowJumpToLatest(true);
        }
      } else if (payload.type === 'message.updated' || payload.type === 'message.deleted') {
        setReplies((current) => current.map((item) => item.message_id === message.message_id ? message : item));
      }
    }
  }, [visible, realtimeEvents, conversationId, parentId, onRead]);

  const title = useMemo(() => `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`, [replies.length]);

  async function chooseAttachments() {
    try {
      const rows = await pick({ allowMultiSelection: true, type: PICK_TYPES });
      setPending((current) => {
        const next = [...current];
        for (const item of rows || []) {
          if (next.length >= MAX_PENDING_ATTACHMENTS) break;
          const size = Number(item.size || 0);
          if (!size || size > MAX_ATTACHMENT_BYTES) {
            setError(`${item.name || 'File'} must be 10 MB or smaller`);
            continue;
          }
          next.push({
            uri: item.uri,
            name: item.name || 'attachment',
            size,
            contentType: item.type || 'application/octet-stream',
            clientMessageId: makeClientMessageId(),
          });
        }
        return next;
      });
    } catch (requestError) {
      if (String(requestError?.code || '').includes('CANCEL')) return;
      setError(requestError?.message || 'Could not choose attachment');
    }
  }

  async function openAttachment(attachment) {
    try {
      const downloaded = await downloadAttachmentToCache(serverUrl, token, conversationId, attachment);
      await ReactNativeBlobUtil.android.actionViewIntent(downloaded.localPath, downloaded.contentType);
    } catch (requestError) {
      setError(requestError?.message || 'Could not open attachment');
    }
  }

  async function submit() {
    const bodyText = draft.trim();
    if (sending || (!bodyText && pending.length === 0)) return;
    setSending(true);
    setError('');
    try {
      const created = [];
      if (bodyText) {
        const result = await sendMessage(serverUrl, token, conversationId, {
          bodyText,
          clientMessageId: makeClientMessageId(),
          replyToMessageId: parentId,
        });
        if (result?.message) created.push(result.message);
        setDraft('');
      }
      for (const item of pending) {
        let localPath = '';
        try {
          localPath = await prepareLocalCopy(item);
          const result = await uploadAttachment(serverUrl, token, conversationId, {
            localPath,
            fileName: item.name,
            contentType: item.contentType,
            clientMessageId: item.clientMessageId,
            replyToMessageId: parentId,
          });
          if (result?.message) created.push(result.message);
        } finally {
          if (localPath) await ReactNativeBlobUtil.fs.unlink(localPath).catch(() => {});
        }
      }
      if (created.length) {
        setReplies((current) => mergeById([...current, ...created]));
        onRead?.(created.at(-1)?.message_id);
      }
      setPending([]);
      scrollToLatest(true);
    } catch (requestError) {
      setError(requestError?.message || 'Could not send thread reply');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      visible={Boolean(visible)}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <StatusBar
          backgroundColor={colors.primary}
          barStyle="light-content"
        />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ConversationHeader
            title="Thread"
            subtitle={title}
            onBack={onClose}
            backAccessibilityLabel="Close thread"
            style={styles.header}
          />

          <View style={styles.history}>
            <ScrollView
              ref={scrollRef}
              style={styles.historyScroll}
              contentContainerStyle={styles.historyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
              onScroll={(event) => {
                const {
                  contentOffset,
                  contentSize,
                  layoutMeasurement,
                } = event.nativeEvent;
                const distanceFromBottom =
                  contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height;
                const nowNearBottom = distanceFromBottom < 48;
                nearBottomRef.current = nowNearBottom;
                setShowJumpToLatest(distanceFromBottom > 160);
              }}
              scrollEventThrottle={32}
              onContentSizeChange={() => {
                if (nearBottomRef.current) {
                  scrollRef.current?.scrollToEnd({ animated: false });
                }
              }}
            >
              {parent ? (
                <ThreadMessage
                  message={parent}
                  currentMemberId={currentMemberId}
                  currentPrimaryEmail={currentPrimaryEmail}
                  onOpenAttachment={openAttachment}
                />
              ) : null}

              <View style={styles.separator}>
                <View style={styles.line} />
                <Text style={styles.separatorText}>Replies</Text>
                <View style={styles.line} />
              </View>

              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : null}

              {!loading && replies.length === 0 ? (
                <Text style={styles.empty}>No replies yet.</Text>
              ) : null}

              {replies.map((message) => (
                <ThreadMessage
                  key={message.message_id}
                  message={message}
                  currentMemberId={currentMemberId}
                  currentPrimaryEmail={currentPrimaryEmail}
                  onOpenAttachment={openAttachment}
                />
              ))}
            </ScrollView>

            <JumpToLatestButton
              visible={showJumpToLatest}
              onPress={() => scrollToLatest(true)}
            />
          </View>

          {error ? (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {pending.length ? (
            <View style={styles.pending}>
              {pending.map((item) => (
                <View
                  key={item.clientMessageId}
                  style={styles.pendingItem}
                >
                  <Text
                    numberOfLines={1}
                    style={styles.pendingName}
                  >
                    {item.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                    onPress={() =>
                      setPending((rows) =>
                        rows.filter(
                          (row) =>
                            row.clientMessageId !==
                            item.clientMessageId
                        )
                      )
                    }
                  >
                    <Text style={styles.pendingRemove}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <ConversationComposer
            value={draft}
            onChangeText={setDraft}
            onFocus={() => scrollToLatest(false)}
            placeholder="Reply in thread"
            maxLength={8000}
            editable={!sending}
            onAttach={chooseAttachments}
            attachmentDisabled={
              sending || pending.length >= MAX_PENDING_ATTACHMENTS
            }
            onSend={submit}
            sendDisabled={
              sending || (!draft.trim() && pending.length === 0)
            }
            sending={sending}
            sendLabel="Send"
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // V16-O: keep thread sender ownership visually consistent with main chat.
  v16oMessageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 5,
  },
  v16oMessageRowOwn: {
    justifyContent: 'flex-end',
  },
  v16oMessageRowOther: {
    justifyContent: 'flex-start',
  },
  v16oAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E8EEF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    marginBottom: 2,
  },
  v16oAvatarText: {
    fontWeight: '800',
    color: '#31506F',
  },
  v16oMessageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 9,
    borderRadius: 17,
    borderWidth: 1,
    shadowColor: '#0F2742',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  v16oMessageBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE5ED',
    borderBottomLeftRadius: 5,
  },
  v16oMessageBubbleOwn: {
    backgroundColor: '#EAF4FF',
    borderColor: '#C9E1FA',
    borderBottomRightRadius: 5,
  },
  v16oMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  v16oSender: {
    fontSize: 11,
    fontWeight: '900',
    color: '#243B53',
  },
  v16oSenderOwn: {
    color: '#1769AA',
  },
  v16oTime: {
    marginLeft: 7,
    fontSize: 10,
    color: '#7B8998',
  },
  v16oEdited: {
    marginLeft: 7,
    fontSize: 9,
    color: '#8896A5',
  },
  v16oBody: {
    marginTop: 4,
    color: '#18324A',
    fontSize: 14,
    lineHeight: 20,
  },
  v16oDeleted: {
    marginTop: 4,
    color: '#7B8998',
    fontStyle: 'italic',
  },
  v16oAttachment: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: '#DCE5ED',
    borderRadius: 10,
    padding: 9,
    backgroundColor: '#F8FAFC',
  },
  v16oAttachmentOwn: {
    backgroundColor: '#F3F8FE',
    borderColor: '#C9E1FA',
  },
  v16oAttachmentName: {
    fontWeight: '700',
    color: '#20384F',
  },
  v16oAttachmentMeta: {
    fontSize: 10,
    color: '#687B8E',
    marginTop: 2,
  },
  v16oReadReceipt: {
    marginTop: 6,
    alignSelf: 'flex-end',
    fontSize: 10,
    fontWeight: '700',
    color: '#5D7790',
  },

  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  flex: {
    flex: 1,
    backgroundColor: '#F6F9FC',
  },
  // Compatibility alias retained for existing V16 brand-regression checks.
  // The visible header is rendered by ConversationHeader.
  header: {
    backgroundColor: colors.primary,
  },
  history: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F6F9FC',
  },
  historyScroll: {
    flex: 1,
  },
  historyContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 13,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D7E1EA',
    flex: 1,
  },
  separatorText: {
    marginHorizontal: 9,
    fontSize: 10,
    fontWeight: '800',
    color: '#8493A2',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    padding: 18,
  },
  error: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFF0F0',
  },
  errorText: {
    color: '#A22727',
  },
  pending: {
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 4,
    backgroundColor: colors.surface,
  },
  pendingItem: {
    minHeight: 42,
    marginBottom: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FBFF',
  },
  pendingName: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
  },
  pendingRemove: {
    fontSize: 20,
    paddingHorizontal: 7,
    color: colors.textMuted,
  },
});
