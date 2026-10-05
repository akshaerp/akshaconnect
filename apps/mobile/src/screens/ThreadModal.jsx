import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
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
  listChannels,
  listThread,
  listWorkspaceMembers,
  sendMessage,
  uploadAttachment,
} from '../api/client';
import {
  listChannelMembers,
} from '../api/channelMembers';
import Text from '../theme/AppText';
import { colors } from '../theme/colors';
import { useAppAppearance } from '../theme/appearanceStore';
import { loadRecentEmojis, saveRecentEmojis } from '../emoji/recentEmojiStore';
import {
  COMPOSER_EMOJIS,
  ConversationComposer,
  ConversationEmojiPicker,
  ConversationHeader,
  JumpToLatestButton,
} from './ConversationChrome.jsx';
import MessageReadersModal from './MessageReadersModal.jsx';
import ImageViewerModal from './ImageViewerModal.jsx';
import MentionSuggestions from './MentionSuggestions.jsx';
import MentionText from './MentionText.jsx';
import {
  applyMentionCandidate,
  findActiveMention,
  mentionsStillPresent,
} from '../mentions/mentionUtils';

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

function attachmentIsImage(contentType = '') {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
    .startsWith('image/');
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

function findThreadUnreadDivider(
  rows,
  unreadCount,
  currentMemberId
) {
  let remaining = Number(unreadCount || 0);

  if (remaining <= 0) {
    return null;
  }

  for (
    let index = (rows || []).length - 1;
    index >= 0;
    index -= 1
  ) {
    const item = rows[index];
    const own =
      item?.sender_type === 'HUMAN' &&
      item?.sender_member_id === currentMemberId;

    if (own) {
      continue;
    }

    remaining -= 1;

    if (remaining <= 0) {
      return item?.message_id || null;
    }
  }

  return rows?.[0]?.message_id || null;
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
  pinned = false,
  saved = false,
  currentMemberId,
  currentPrimaryEmail,
  onOpenAttachment,
  onShowReaders,
  onToggleSaved,
}) {
  const { palette } = useAppAppearance();
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
          {
            backgroundColor: own ? palette.ownBubble : palette.otherBubble,
            borderColor: own ? palette.ownBubbleBorder : palette.otherBubbleBorder,
          },
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

          <Text style={[styles.v16oTime, { color: own ? palette.ownTimestamp : palette.timestamp }]}>
            {formatTime(message.created_at)}
          </Text>

          {message.edited_at && !deleted ? (
            <Text style={styles.v16oEdited}>edited</Text>
          ) : null}
        </View>

        {deleted ? (
          <Text style={[styles.v16oDeleted, { color: palette.textMuted }]}>Message deleted</Text>
        ) : message.message_type !== 'ATTACHMENT' ? (
          <MentionText
            value={message.body_text || ''}
            mentions={message.mentions || []}
            style={[
              styles.v16oBody,
              { color: own ? palette.ownMessageText : palette.otherMessageText },
            ]}
          />
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

        {(pinned || saved || !deleted) ? (
          <View style={styles.v16oFlagsRow}>
            {pinned ? <Text style={styles.v16oPinned}>📌 Pinned</Text> : null}
            {saved ? <Text style={styles.v16oSaved}>🔖 Saved</Text> : null}
            {!deleted ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? 'Remove saved message' : 'Save message'}
                onPress={() => onToggleSaved?.(message)}
                style={({ pressed }) => [styles.v16oSaveButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.v16oSaveText}>
                  {saved ? 'Remove saved' : 'Save'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {own && !deleted && Number(message.read_by_count || 0) > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Read by ${Number(message.read_by_count || 0)}. Show readers.`}
            onPress={() => onShowReaders?.(message)}
            style={({ pressed }) => [
              styles.v16oReadReceiptButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.v16oReadReceipt}>
              ✓✓ Read by {Number(message.read_by_count || 0)} ›
            </Text>
          </Pressable>
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
  initialMessageId = '',
  initialUnreadCount = 0,
  pinnedMessageIds = new Set(),
  savedMessageIds = new Set(),
  onToggleSavedMessage,
  onClose,
  onRead,
}) {
  const { palette } = useAppAppearance();
  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageDividerId, setNewMessageDividerId] = useState(null);
  const [highlightMessageId, setHighlightMessageId] = useState('');
  const [messageReadersTarget, setMessageReadersTarget] = useState(null);
  const [messageReadersRefreshEpoch, setMessageReadersRefreshEpoch] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [draftMentions, setDraftMentions] = useState([]);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionLookupError, setMentionLookupError] = useState('');
  const mentionCandidateCacheRef = useRef(new Map());
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [attachmentBusyMode, setAttachmentBusyMode] = useState('');
  const lastSequenceRef = useRef(0);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const initialUnreadPositionedRef = useRef(false);
  const messageLayoutYRef = useRef(new Map());
  const highlightTimerRef = useRef(null);
  const readReceiptRefreshTimerRef = useRef(null);
  const parentId = parentMessage?.message_id || '';

  const threadImageAttachments = useMemo(
    () =>
      [parent, ...replies].flatMap(
        (message) =>
          (
            message?.attachments ||
            []
          )
            .filter(
              (attachment) =>
                attachmentIsImage(
                  attachment
                    ?.content_type
                )
            )
            .map(
              (attachment) => ({
                ...attachment,

                message_id:
                  message
                    ?.message_id,

                sender_display_name:
                  message
                    ?.sender_display_name ||
                  (
                    message
                      ?.sender_member_id ===
                    currentMemberId
                      ? 'You'
                      : 'Member'
                  ),

                created_at:
                  message
                    ?.created_at ||
                  null,

                reactions:
                  message
                    ?.reactions ||
                  [],
              })
            )
      ),
    [
      parent,
      replies,
      currentMemberId,
    ]
  );

  const activeMention = useMemo(() => findActiveMention(draft), [draft]);

  useEffect(() => {
    if (
      !visible ||
      !activeMention ||
      !conversationId ||
      !serverUrl ||
      !token
    ) {
      setMentionSuggestions([]);
      setMentionLoading(false);
      setMentionLookupError('');
      return undefined;
    }

    let cancelled = false;

    const type =
      activeMention.type;

    const query =
      String(
        activeMention.query || ''
      )
        .trim()
        .toLowerCase();

    const cacheKey =
      [
        conversationId,
        type,
      ].join('|');

    function filterSource(
      source
    ) {
      const rows =
        Array.isArray(source)
          ? source
          : [];

      const filtered =
        !query
          ? rows
          : rows.filter(
              (item) =>
                [
                  item.display_name,
                  item.primary_email,
                  item.channel_name,
                  item.channel_code,
                ]
                  .filter(Boolean)
                  .some(
                    (value) =>
                      String(value)
                        .toLowerCase()
                        .includes(query)
                  )
            );

      setMentionSuggestions(
        filtered.slice(
          0,
          12
        )
      );
    }

    let sourcePromise =
      mentionCandidateCacheRef
        .current
        .get(
          cacheKey
        );

    if (!sourcePromise) {
      sourcePromise =
        (async () => {
          if (
            type ===
            'CHANNEL'
          ) {
            const payload =
              await listChannels(
                serverUrl,
                token
              );

            return (
              payload?.channels ||
              []
            ).map(
              (channel) => ({
                mention_type:
                  'CHANNEL',

                target_id:
                  channel
                    .conversation_id,

                channel_name:
                  channel
                    .channel_name ||
                  'Channel',

                channel_code:
                  channel
                    .channel_code ||
                  '',
              })
            );
          }

          try {
            const payload =
              await listChannelMembers(
                serverUrl,
                token,
                conversationId
              );

            return (
              payload?.members ||
              []
            )
              .filter(
                (member) =>
                  member
                    ?.workspace_member_id &&
                  member
                    .workspace_member_id !==
                    currentMemberId
              )
              .map(
                (member) => ({
                  mention_type:
                    'MEMBER',

                  target_id:
                    member
                      .workspace_member_id,

                  workspace_member_id:
                    member
                      .workspace_member_id,

                  display_name:
                    member
                      .display_name ||
                    member
                      .primary_email ||
                    'Member',

                  primary_email:
                    member
                      .primary_email ||
                    '',
                })
              );
          } catch (
            channelError
          ) {
            const payload =
              await listWorkspaceMembers(
                serverUrl,
                token,
                {
                  query: '',
                  limit: 50,
                }
              );

            return (
              payload?.members ||
              []
            )
              .filter(
                (member) =>
                  member
                    ?.workspace_member_id &&
                  member
                    .workspace_member_id !==
                    currentMemberId
              )
              .map(
                (member) => ({
                  mention_type:
                    'MEMBER',

                  target_id:
                    member
                      .workspace_member_id,

                  workspace_member_id:
                    member
                      .workspace_member_id,

                  display_name:
                    member
                      .display_name ||
                    member
                      .primary_email ||
                    'Member',

                  primary_email:
                    member
                      .primary_email ||
                    '',
                })
              );
          }
        })();

      mentionCandidateCacheRef
        .current
        .set(
          cacheKey,
          sourcePromise
        );
    }

    setMentionLoading(true);
    setMentionLookupError('');

    Promise.resolve(
      sourcePromise
    )
      .then((source) => {
        if (!cancelled) {
          filterSource(
            source
          );
        }
      })
      .catch((error) => {
        mentionCandidateCacheRef
          .current
          .delete(
            cacheKey
          );

        if (!cancelled) {
          setMentionSuggestions([]);

          setMentionLookupError(
            error?.message ||
              'Could not load suggestions'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMentionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeMention?.type,
    activeMention?.query,
    conversationId,
    currentMemberId,
    serverUrl,
    token,
    visible,
  ]);

  function selectThreadMention(candidate) {
    const result = applyMentionCandidate(draft, activeMention, candidate);
    if (!result.mention) return;
    const next = result.text.slice(0, 8000);
    setDraft(next);
    setDraftMentions((current) =>
      mentionsStillPresent(next, [...current, result.mention])
    );
    setMentionSuggestions([]);
  }

  function scrollToLatest(animated = true) {
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }

  function scrollToThreadMessage(messageId, attempt = 0) {
    const targetId = String(messageId || '').trim();
    if (!targetId) return;

    requestAnimationFrame(() => {
      const y = messageLayoutYRef.current.get(targetId);
      if (Number.isFinite(y)) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - 18),
          animated: true,
        });
        return;
      }

      if (attempt < 8) {
        setTimeout(
          () => scrollToThreadMessage(targetId, attempt + 1),
          35
        );
      }
    });
  }

  function scheduleThreadReadReceiptRefresh() {
    setMessageReadersRefreshEpoch((value) => value + 1);

    if (readReceiptRefreshTimerRef.current) {
      clearTimeout(readReceiptRefreshTimerRef.current);
    }

    readReceiptRefreshTimerRef.current = setTimeout(() => {
      readReceiptRefreshTimerRef.current = null;

      listThread(
        serverUrl,
        token,
        conversationId,
        parentId
      )
        .then((result) => {
          if (!result) return;
          setParent(result.parent || parentMessage);
          setReplies(result.replies || []);
        })
        .catch(() => {});
    }, 250);
  }

  useEffect(() => {
    let mounted = true;
    loadRecentEmojis()
      .then((items) => {
        if (mounted) setRecentEmojis(items || []);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      if (readReceiptRefreshTimerRef.current) {
        clearTimeout(readReceiptRefreshTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!visible || !parentId || !conversationId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setParent(parentMessage);
    setReplies([]);
    setDraft('');
    setPending([]);
    setHighlightMessageId('');
    setMessageReadersTarget(null);
    setMessageReadersRefreshEpoch(0);
    setShowEmojiPicker(false);
    setNewMessageDividerId(null);
    messageLayoutYRef.current.clear();
    initialUnreadPositionedRef.current = false;
    nearBottomRef.current = Number(initialUnreadCount || 0) <= 0;
    setShowJumpToLatest(false);
    listThread(serverUrl, token, conversationId, parentId)
      .then((result) => {
        if (cancelled) return;
        const nextReplies = result.replies || [];
        setParent(result.parent || parentMessage);
        setReplies(nextReplies);

        const dividerId = findThreadUnreadDivider(
          nextReplies,
          initialUnreadCount,
          currentMemberId
        );
        setNewMessageDividerId(dividerId);
        nearBottomRef.current = !dividerId;

        const latest = nextReplies.at(-1);
        if (latest?.message_id && !dividerId) {
          onRead?.(latest.message_id);
        }

        if (!initialMessageId && !dividerId) {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: false });
          });
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (Number(requestError?.status || 0) === 404 && parent) {
          setError('');
          return;
        }
        setError(requestError?.message || 'Could not load thread');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [
    visible,
    parentId,
    conversationId,
    token,
    serverUrl,
    initialUnreadCount,
    currentMemberId,
    onRead,
  ]);

  useEffect(() => {
    const targetId = String(initialMessageId || '').trim();
    if (!visible || !targetId) return;

    const exists = replies.some(
      (message) => message.message_id === targetId
    );
    if (!exists) return;

    setHighlightMessageId(targetId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(
      () => setHighlightMessageId(''),
      2600
    );

    scrollToThreadMessage(targetId);
  }, [visible, initialMessageId, replies.length]);

  useEffect(() => {
    if (!visible || !Array.isArray(realtimeEvents)) return;
    const events = realtimeEvents.filter((event) => Number(event?.sequence || 0) > lastSequenceRef.current);
    for (const event of events) {
      lastSequenceRef.current = Math.max(
        lastSequenceRef.current,
        Number(event?.sequence || 0)
      );

      const payload = event?.payload || event;

      if (
        payload?.type === 'thread_read_cursor.updated' &&
        payload.conversation_id === conversationId &&
        payload.thread_root_message_id === parentId &&
        payload.workspace_member_id !== currentMemberId
      ) {
        scheduleThreadReadReceiptRefresh();
        continue;
      }

      const message = payload?.message;
      if (!message || payload?.conversation_id !== conversationId) continue;

      if (message.message_id === parentId) {
        setParent(message);
        continue;
      }

      if (message.reply_to_message_id !== parentId) continue;

      if (payload.type === 'message.created') {
        setReplies((current) => mergeById([...current, message]));

        const own =
          message.sender_type === 'HUMAN' &&
          sameIdentityValue(message.sender_member_id, currentMemberId);

        if (nearBottomRef.current) {
          if (!own) {
            onRead?.(message.message_id);
          }
          setNewMessageDividerId(null);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
          });
        } else {
          if (!own) {
            setNewMessageDividerId(
              (current) => current || message.message_id
            );
          }
          setShowJumpToLatest(true);
        }
      } else if (
        payload.type === 'message.updated' ||
        payload.type === 'message.deleted'
      ) {
        setReplies((current) =>
          current.map((item) =>
            item.message_id === message.message_id
              ? message
              : item
          )
        );
      }
    }
  }, [
    visible,
    realtimeEvents,
    conversationId,
    parentId,
    currentMemberId,
    onRead,
    serverUrl,
    token,
    parentMessage,
  ]);

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

  async function closeThreadImagePreview() {
    const localPath =
      previewAttachment
        ?.localPath ||
      '';

    setPreviewAttachment(
      null
    );

    if (localPath) {
      await ReactNativeBlobUtil
        .fs
        .unlink(
          localPath
        )
        .catch(
          () => {}
        );
    }
  }

  function openThreadImageAtIndex(index) {
    if (
      threadImageAttachments
        .length === 0
    ) {
      return;
    }

    const normalized =
      (
        Number(
          index ||
          0
        ) +
        threadImageAttachments
          .length
      ) %
      threadImageAttachments
        .length;

    const attachment =
      threadImageAttachments[
        normalized
      ];

    if (
      !attachment
        ?.attachment_id
    ) {
      return;
    }

    setError('');

    setPreviewAttachment({
      attachment,
      fileName:
        attachment
          .file_name ||
        'Image',
      contentType:
        attachment
          .content_type ||
        'image/*',
      galleryIndex:
        normalized,
      galleryTotal:
        threadImageAttachments
          .length,
    });
  }

  async function openAttachment(attachment) {
    if (
      attachmentIsImage(
        attachment
          ?.content_type
      )
    ) {
      const index =
        threadImageAttachments
          .findIndex(
            (item) =>
              item
                .attachment_id ===
              attachment
                .attachment_id
          );

      await openThreadImageAtIndex(
        index >= 0
          ? index
          : 0
      );

      return;
    }

    try {
      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversationId,
          attachment
        );

      await ReactNativeBlobUtil
        .android
        .actionViewIntent(
          downloaded.localPath,
          downloaded.contentType
        );
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not open attachment'
      );
    }
  }

  async function downloadThreadPreview() {
    const current =
      previewAttachment;

    if (
      !current?.attachment ||
      attachmentBusyMode
    ) {
      return;
    }

    setAttachmentBusyMode(
      'download'
    );

    try {
      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversationId,
          current.attachment
        );

      await ReactNativeBlobUtil
        .MediaCollection
        .copyToMediaStore(
          {
            name:
              downloaded
                .fileName,

            parentFolder:
              'AkshaConnect',

            mimeType:
              downloaded
                .contentType,
          },

          'Download',

          downloaded.localPath
        );

      await ReactNativeBlobUtil
        .fs
        .unlink(
          downloaded.localPath
        )
        .catch(
          () => {}
        );
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not download image'
      );
    } finally {
      setAttachmentBusyMode(
        ''
      );
    }
  }

  async function shareThreadPreview() {
    const current =
      previewAttachment;

    if (
      !current?.attachment
        ?.attachment_id ||
      attachmentBusyMode
    ) {
      return;
    }

    const media =
      NativeModules
        .AkshaConnectMedia;

    if (!media?.shareRemoteImage) {
      setError(
        'Image sharing is unavailable on this device'
      );
      return;
    }

    setAttachmentBusyMode(
      'share'
    );

    try {
      const root =
        String(
          serverUrl || ''
        ).replace(
          /\/+$/,
          ''
        );

      const remoteUrl =
        root +
        '/api/v1/conversations/' +
        encodeURIComponent(
          conversationId
        ) +
        '/attachments/' +
        encodeURIComponent(
          current.attachment
            .attachment_id
        ) +
        '/content';

      await media.shareRemoteImage(
        remoteUrl,
        token,
        current.contentType ||
          current.attachment
            .content_type ||
          'image/*',
        current.fileName ||
          current.attachment
            .file_name ||
          'image'
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not share image'
      );
    } finally {
      setAttachmentBusyMode(
        ''
      );
    }
  }

  function insertThreadEmoji(emoji) {
    const value = String(emoji || '');
    if (!value) return;

    setDraft((current) =>
      `${current}${value}`.slice(0, 8000)
    );

    setRecentEmojis((current) => {
      const next = [
        value,
        ...current.filter((item) => item !== value),
      ].slice(0, 8);
      saveRecentEmojis(next);
      return next;
    });

    // Keep the emoji picker open so multiple emoji can be inserted
    // before sending the thread reply.
  }

  async function submit() {
    const bodyText = draft.trim();
    const mentions = mentionsStillPresent(bodyText, draftMentions);
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
          mentions,
        });
        if (result?.message) created.push(result.message);
        setDraft('');
        setDraftMentions([]);
        setMentionSuggestions([]);
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
        edges={['top']}
      >
        <SafeAreaView
          style={[
            styles.safeAreaContent,
            {
              backgroundColor:
                palette.shell,
            },
          ]}
          edges={['bottom']}
        >
          <StatusBar
            backgroundColor={colors.primary}
            barStyle="light-content"
          />
          <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          enabled
          keyboardVerticalOffset={
            Platform.OS === 'android'
              ? 56
              : 0
          }
        >
          <ConversationHeader
            title="Thread"
            subtitle={title}
            onBack={onClose}
            backAccessibilityLabel="Close thread"
            style={styles.header}
          />

          <View style={[styles.history, { backgroundColor: palette.shell }]}>
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
                const wasNearBottom = nearBottomRef.current;
                const nowNearBottom = distanceFromBottom < 48;
                nearBottomRef.current = nowNearBottom;
                setShowJumpToLatest(distanceFromBottom > 160);

                if (nowNearBottom && !wasNearBottom) {
                  const latest = replies.at(-1);
                  if (latest?.message_id) {
                    onRead?.(latest.message_id);
                  }
                  setNewMessageDividerId(null);
                  setShowJumpToLatest(false);
                }
              }}
              scrollEventThrottle={32}
              onContentSizeChange={() => {
                if (newMessageDividerId) return;
                if (nearBottomRef.current) {
                  scrollRef.current?.scrollToEnd({ animated: false });
                }
              }}
            >
              {parent ? (
                <ThreadMessage
                  message={parent}
                  pinned={pinnedMessageIds?.has?.(parent.message_id)}
                  saved={savedMessageIds?.has?.(parent.message_id)}
                  currentMemberId={currentMemberId}
                  currentPrimaryEmail={currentPrimaryEmail}
                  onOpenAttachment={openAttachment}
                  onToggleSaved={onToggleSavedMessage}
                  onShowReaders={(targetMessage) =>
                    setMessageReadersTarget(targetMessage)
                  }
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

              {replies.map((message) => {
                const showNewMessages =
                  message.message_id === newMessageDividerId;

                return (
                  <React.Fragment key={message.message_id}>
                    {showNewMessages ? (
                      <View
                        style={styles.newMessagesRow}
                        onLayout={(event) => {
                          if (initialUnreadPositionedRef.current) return;

                          initialUnreadPositionedRef.current = true;
                          nearBottomRef.current = false;
                          const targetY = Math.max(
                            0,
                            Number(event.nativeEvent?.layout?.y || 0) - 8
                          );

                          requestAnimationFrame(() => {
                            scrollRef.current?.scrollTo({
                              y: targetY,
                              animated: false,
                            });
                          });
                        }}
                      >
                        <View style={styles.newMessagesLine} />
                        <Text style={styles.newMessagesText}>New messages</Text>
                        <View style={styles.newMessagesLine} />
                      </View>
                    ) : null}

                    <View
                      onLayout={(event) => {
                        messageLayoutYRef.current.set(
                          message.message_id,
                          Number(event.nativeEvent?.layout?.y || 0)
                        );
                      }}
                      style={
                        highlightMessageId === message.message_id
                          ? styles.highlightedMessage
                          : null
                      }
                    >
                      <ThreadMessage
                        message={message}
                        pinned={pinnedMessageIds?.has?.(message.message_id)}
                        saved={savedMessageIds?.has?.(message.message_id)}
                        currentMemberId={currentMemberId}
                        currentPrimaryEmail={currentPrimaryEmail}
                        onOpenAttachment={openAttachment}
                        onToggleSaved={onToggleSavedMessage}
                        onShowReaders={(targetMessage) =>
                          setMessageReadersTarget(targetMessage)
                        }
                      />
                    </View>
                  </React.Fragment>
                );
              })}
            </ScrollView>

            <JumpToLatestButton
              visible={showJumpToLatest}
              onPress={() => {
                scrollToLatest(true);
                const latest = replies.at(-1);
                if (latest?.message_id) {
                  onRead?.(latest.message_id);
                }
                setNewMessageDividerId(null);
              }}
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

          <MentionSuggestions
            visible={Boolean(activeMention)}
            items={mentionSuggestions}
            loading={mentionLoading}
            error={mentionLookupError}
            prefix={activeMention?.prefix || '@'}
            onSelect={selectThreadMention}
          />

          <ConversationEmojiPicker
            visible={showEmojiPicker}
            recentEmojis={recentEmojis}
            allEmojis={COMPOSER_EMOJIS}
            onSelect={insertThreadEmoji}
          />

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
            onEmojiPress={() =>
              setShowEmojiPicker((current) => !current)
            }
            emojiOpen={showEmojiPicker}
            onSend={submit}
            sendDisabled={
              sending || (!draft.trim() && pending.length === 0)
            }
            sending={sending}
            sendLabel="Send"
          />

          <ImageViewerModal
            visible={Boolean(previewAttachment)}
            source={
              previewAttachment?.attachment
                ?.attachment_id
                ? {
                    uri:
                      String(
                        serverUrl ||
                        ''
                      ).replace(
                        /\/+$/,
                        ''
                      ) +
                      '/api/v1/conversations/' +
                      encodeURIComponent(
                        conversationId ||
                          ''
                      ) +
                      '/attachments/' +
                      encodeURIComponent(
                        previewAttachment
                          .attachment
                          .attachment_id
                      ) +
                      '/content',
                    headers:
                      token
                        ? {
                            Authorization:
                              'Bearer ' +
                              token,
                          }
                        : undefined,
                  }
                : null
            }
            fileName={
              previewAttachment?.fileName ||
              previewAttachment?.attachment
                ?.file_name ||
              'Image'
            }
            contentType={
              previewAttachment?.contentType ||
              previewAttachment?.attachment
                ?.content_type ||
              'image/*'
            }
            sizeText={
              formatSize(
                previewAttachment?.attachment
                  ?.size_bytes
              )
            }
            sender={
              previewAttachment?.attachment
                ?.sender_display_name ||
              ''
            }
            sentAt={
              previewAttachment?.attachment
                ?.created_at
                ? new Date(
                    previewAttachment
                      .attachment
                      .created_at
                  ).toLocaleString()
                : ''
            }
            index={
              Number(
                previewAttachment
                  ?.galleryIndex ||
                0
              )
            }
            total={
              Number(
                previewAttachment
                  ?.galleryTotal ||
                1
              )
            }
            busyMode={
              attachmentBusyMode
            }
            onClose={
              closeThreadImagePreview
            }
            onPrevious={() =>
              openThreadImageAtIndex(
                Number(
                  previewAttachment
                    ?.galleryIndex ||
                  0
                ) - 1
              )
            }
            onNext={() =>
              openThreadImageAtIndex(
                Number(
                  previewAttachment
                    ?.galleryIndex ||
                  0
                ) + 1
              )
            }
            onDownload={
              downloadThreadPreview
            }
            onShare={
              shareThreadPreview
            }
          />

          <MessageReadersModal
            visible={Boolean(messageReadersTarget)}
            serverUrl={serverUrl}
            token={token}
            conversationId={conversationId}
            message={messageReadersTarget}
            refreshEpoch={messageReadersRefreshEpoch}
            onClose={() => setMessageReadersTarget(null)}
          />
          </KeyboardAvoidingView>
        </SafeAreaView>
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
  v16oReadReceiptButton: {
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  v16oReadReceipt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },

  highlightedMessage: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.brandOrange,
    backgroundColor: '#FFF6E9',
  },
  pressed: {
    opacity: 0.75,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  safeAreaContent: {
    flex: 1,
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
  newMessagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  newMessagesLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#F2A44A',
  },
  newMessagesText: {
    color: '#D97912',
    fontSize: 11.5,
    fontWeight: '900',
  },
  v16oFlagsRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  v16oPinned: { color: '#6B7280', fontSize: 8.5, fontWeight: '800' },
  v16oSaved: { color: '#5B6F86', fontSize: 8.5, fontWeight: '800' },
  v16oSaveButton: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(8,121,231,0.08)',
  },
  v16oSaveText: { color: '#0879E7', fontSize: 9, fontWeight: '900' },
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
