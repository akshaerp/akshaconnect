import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types as documentTypes,
} from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';

import {
  deleteMessage,
  downloadAttachmentToCache,
  editMessage,
  listChannels,
  listDirectMessages,
  listMessages,
  listPresenceProfiles,
  listWorkspaceMembers,
  markRead,
  markThreadRead,
  sendMessage,
  uploadAttachment,
  searchConversationMessages,
  toggleMessageReaction,
  listMessageReactionUsers,
} from '../api/client';
import {
  addChannelMember,
  listChannelMembers,
  removeChannelMember,
} from '../api/channelMembers';
import {
  clearConversationDraft,
  loadConversationDraft,
  saveConversationDraft,
} from '../drafts/draftStore';
import Text from '../theme/AppText';
import TextInput from '../theme/AppTextInput';
import { colors } from '../theme/colors';
import { useAppAppearance } from '../theme/appearanceStore';
import { loadRecentEmojis, saveRecentEmojis } from '../emoji/recentEmojiStore';
import ThreadModal from './ThreadModal.jsx';
import ConversationDetailsModal from './ConversationDetailsModal';
import MessageActionSheet from './MessageActionSheet.jsx';
import {
  COMPOSER_EMOJIS,
  ConversationComposer,
  ConversationEmojiPicker,
  ConversationHeader,
  JumpToLatestButton,
} from './ConversationChrome.jsx';
import ConversationSearchBar from './ConversationSearchBar.jsx';
import MessageReadersModal from './MessageReadersModal.jsx';
import ImageViewerModal from './ImageViewerModal.jsx';
import MentionSuggestions from './MentionSuggestions.jsx';
import MentionText from './MentionText.jsx';
import {
  applyMentionCandidate,
  findActiveMention,
  mentionsStillPresent,
} from '../mentions/mentionUtils';
import {
  listConversationPins,
  pinConversationMessage,
  unpinConversationMessage,
} from '../api/conversationDetails';
import {
  loadSavedMessages,
  removeSavedMessageLocally,
  saveMessageLocally,
} from '../saved/savedMessageStore';

function copyableMessageText(message) {
  if (!message || message.deleted_at) return '';

  const body = String(message.body_text || '').trim();
  if (body) return body;

  if (Array.isArray(message.attachments)) {
    return message.attachments
      .map((item) => String(item?.file_name || '').trim())
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

const MAX_MESSAGE_CHARS = 8000;
const MAX_PENDING_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const PICKER_ATTACHMENT_TYPES = [
  documentTypes.images,
  documentTypes.pdf,
  documentTypes.plainText,
  documentTypes.csv,
  documentTypes.docx,
  documentTypes.xlsx,
  documentTypes.pptx,
].flat();

const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});

function makeClientMessageId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeAttachmentContentType(file) {
  const declared = String(file?.type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (ALLOWED_ATTACHMENT_TYPES.has(declared)) {
    return declared;
  }

  const name = String(file?.name || '').toLowerCase();
  const extension = Object.keys(
    CONTENT_TYPE_BY_EXTENSION
  ).find((candidate) => name.endsWith(candidate));

  if (!extension) return '';

  return CONTENT_TYPE_BY_EXTENSION[extension];
}

function formatFileSize(value) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    const valueKb = bytes / 1024;
    return `${valueKb.toFixed(valueKb < 10 ? 1 : 0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentBadge(contentType = '') {
  if (contentType.startsWith('image/')) return 'IMG';
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.includes('wordprocessingml')) return 'DOC';
  if (contentType.includes('spreadsheetml')) return 'XLS';
  if (contentType.includes('presentationml')) return 'PPT';
  if (contentType === 'text/csv') return 'CSV';
  if (contentType === 'text/plain') return 'TXT';
  return 'FILE';
}

function attachmentLocalCopyName(pending) {
  const originalName = String(pending?.name || '');
  const extensionIndex = originalName.lastIndexOf('.');
  const extension =
    extensionIndex > 0 &&
    originalName.length - extensionIndex <= 12
      ? originalName
          .slice(extensionIndex)
          .replace(/[^.a-z0-9]/gi, '')
      : '';

  return `akshaconnect-${pending.clientMessageId}${extension}`;
}

function localPathFromFileUri(value) {
  let localPath = String(value || '');

  if (localPath.startsWith('file://')) {
    localPath = localPath.slice(7);
  }

  try {
    return decodeURI(localPath);
  } catch {
    return localPath;
  }
}

async function prepareAttachmentLocalCopy(pending) {
  const copies = await keepLocalCopy({
    files: [
      {
        uri: pending.uri,
        fileName: attachmentLocalCopyName(pending),
      },
    ],
    destination: 'cachesDirectory',
  });

  const copy = copies?.[0];

  if (
    !copy ||
    copy.status !== 'success' ||
    !copy.localUri
  ) {
    throw new Error(
      copy?.copyError || 'Could not prepare attachment for upload'
    );
  }

  const localPath = localPathFromFileUri(copy.localUri);

  if (!localPath) {
    throw new Error('Could not prepare attachment for upload');
  }

  return localPath;
}

async function removeAttachmentLocalCopy(localPath) {
  if (!localPath) return;

  try {
    await ReactNativeBlobUtil.fs.unlink(localPath);
  } catch {
    // Cache cleanup is best-effort. The durable server result remains authoritative.
  }
}

function attachmentIsImage(contentType = '') {
  return String(contentType)
    .toLowerCase()
    .startsWith('image/');
}

function attachmentFileName(attachment) {
  return String(
    attachment?.file_name ||
      'attachment'
  );
}

function attachmentContentType(attachment) {
  return String(
    attachment?.content_type ||
      'application/octet-stream'
  );
}

function attachmentFileUri(localPath) {
  const value = String(localPath || '');
  return value.startsWith('file://')
    ? value
    : `file://${value}`;
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
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'reconnecting') return 'Reconnecting…';
  return 'Offline';
}

function presenceLabel(status) {
  if (status === 'LIVE') return 'Online';
  if (status === 'AWAY') return 'Away';
  return 'Offline';
}

function formatLastSeen(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '';

  const deltaMs = Date.now() - parsed.getTime();
  if (deltaMs < 60 * 1000) return 'Last seen just now';
  if (deltaMs < 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.floor(deltaMs / (60 * 1000)));
    return `Last seen ${minutes}m ago`;
  }

  const today = new Date();
  if (
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate()
  ) {
    return `Last seen ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `Last seen ${parsed.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function findUnreadDivider(rows, unreadCount, currentMemberId) {
  let remaining = Number(unreadCount || 0);
  if (remaining <= 0) return null;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index];
    const own =
      item.sender_type === 'HUMAN' &&
      item.sender_member_id === currentMemberId;

    if (own) continue;

    remaining -= 1;

    if (remaining <= 0) {
      return item.message_id;
    }
  }

  return rows[0]?.message_id || null;
}

async function listMessagesWithTransientRetry(
  serverUrl,
  token,
  conversationId,
  options
) {
  try {
    return await listMessages(
      serverUrl,
      token,
      conversationId,
      options
    );
  } catch (error) {
    if (Number(error?.status) !== 404) {
      throw error;
    }

    // Editing and reply/thread activity can overlap on separate clients. A
    // short retry prevents a transient stale lookup from flashing a raw 404.
    await new Promise((resolve) => setTimeout(resolve, 180));

    return listMessages(
      serverUrl,
      token,
      conversationId,
      options
    );
  }
}

export default function ConversationScreen({
  session,
  serverUrl,
  conversation: initialConversation,
  realtimeStatus,
  realtimeEvents,
  reconcileEpoch,
  peerPresenceStatus,
  peerPresenceProfile: externalPeerPresenceProfile,
  onConversationRead,
  onUserActivity,
  onBack,
}) {
  const { palette, darkMode } = useAppAppearance();
  const token = session?.access_token || '';
  const [conversation, setConversation] = useState(initialConversation);

  useEffect(() => {
    setConversation(initialConversation);
  }, [
    initialConversation?.conversationId,
    initialConversation?.unreadAtOpen,
    initialConversation?.otherWorkspaceMemberId,
    initialConversation?.title,
    initialConversation?.subtitle,
  ]);

  const currentMemberId =
    session?.membership?.workspace_member_id || '';

  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const initialUnreadPositionedRef = useRef(false);
  const lastRealtimeSequenceRef = useRef(0);
  const lastReconcileEpochRef = useRef(0);
  const lastMarkedReadMessageIdRef = useRef(null);
  const arrivalDividerReadyRef = useRef(false);
  const draftRef = useRef('');
  const draftSaveTimerRef = useRef(null);
  const draftHydratedScopeRef = useRef('');
  const draftUserChangedScopeRef = useRef('');
  const editingMessageRef = useRef(null);
  const composerInputRef = useRef(null);
  const messageLayoutYRef = useRef(new Map());
  const highlightTimerRef = useRef(null);
  const readReceiptRefreshTimerRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const historyUserInteractedRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState({
    has_more: false,
    next_before_message_id: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickingAttachments, setPickingAttachments] =
    useState(false);
  const [pendingAttachments, setPendingAttachments] =
    useState([]);
  const [
    attachmentAction,
    setAttachmentAction,
  ] = useState({
    attachmentId: '',
    mode: '',
  });
  const [
    previewAttachment,
    setPreviewAttachment,
  ] = useState(null);
  const [
    expandedAttachmentId,
    setExpandedAttachmentId,
  ] = useState('');
  const [
    savedAttachments,
    setSavedAttachments,
  ] = useState({});
  const [
    editingMessage,
    setEditingMessage,
  ] = useState(null);
  const [
    quoteReplyMessage,
    setQuoteReplyMessage,
  ] = useState(null);
  const [
    messageMutationId,
    setMessageMutationId,
  ] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [newMessageDividerId, setNewMessageDividerId] =
    useState(null);
  const [threadParent, setThreadParent] = useState(null);
  const [messageActionTarget, setMessageActionTarget] =
    useState(null);
  const [forwardMessage, setForwardMessage] =
    useState(null);
  const [forwardTargets, setForwardTargets] =
    useState([]);
  const [forwardQuery, setForwardQuery] =
    useState('');
  const [forwardLoading, setForwardLoading] =
    useState(false);
  const [forwardBusyConversationId, setForwardBusyConversationId] =
    useState('');
  const [forwardError, setForwardError] =
    useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const [messageSearchMode, setMessageSearchMode] = useState('matches');
  const [messageSearchIndex, setMessageSearchIndex] = useState(-1);
  const [highlightMessageId, setHighlightMessageId] = useState('');
  const [threadSearchTargetMessageId, setThreadSearchTargetMessageId] = useState('');
  const [messageReadersTarget, setMessageReadersTarget] = useState(null);
  const [messageReadersRefreshEpoch, setMessageReadersRefreshEpoch] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState(() => new Set());
  const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
  const [draftMentions, setDraftMentions] = useState([]);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionLookupError, setMentionLookupError] = useState('');
  const mentionCandidateCacheRef = useRef(new Map());

  useEffect(() => {
    let mounted = true;
    loadRecentEmojis().then((items) => { if (mounted) setRecentEmojis(items || []); });
    return () => { mounted = false; };
  }, []);


  const savedScope = useMemo(() => ({
    identityId: session?.identity?.identity_id || session?.identity_id || '',
    workspaceId: session?.workspace?.workspace_id || '',
    workspaceMemberId: currentMemberId,
  }), [
    session?.identity?.identity_id,
    session?.identity_id,
    session?.workspace?.workspace_id,
    currentMemberId,
  ]);

  const refreshPinnedMessages = useCallback(async () => {
    if (!serverUrl || !token || !conversation?.conversationId) {
      setPinnedMessageIds(new Set());
      return;
    }
    try {
      const payload = await listConversationPins(
        serverUrl,
        token,
        conversation.conversationId
      );
      setPinnedMessageIds(
        new Set((payload?.pins || []).map((item) => item?.message_id).filter(Boolean))
      );
    } catch {
      setPinnedMessageIds(new Set());
    }
  }, [conversation?.conversationId, serverUrl, token]);

  const refreshSavedMessages = useCallback(async () => {
    const rows = await loadSavedMessages(savedScope);
    setSavedMessageIds(new Set(rows.map((item) => item?.message_id).filter(Boolean)));
  }, [savedScope]);

  useEffect(() => {
    refreshPinnedMessages();
    refreshSavedMessages();
  }, [refreshPinnedMessages, refreshSavedMessages]);

  useEffect(
    () => () => {
      if (readReceiptRefreshTimerRef.current) {
        clearTimeout(readReceiptRefreshTimerRef.current);
        readReceiptRefreshTimerRef.current = null;
      }
    },
    []
  );

  const filteredForwardTargets = useMemo(() => {
    const query = String(forwardQuery || '').trim().toLowerCase();
    if (!query) return forwardTargets;

    return forwardTargets.filter((target) =>
      [target.title, target.subtitle, target.kind]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [forwardQuery, forwardTargets]);
  const [
    showConversationDetails,
    setShowConversationDetails,
  ] = useState(false);
  const [showChannelPeople, setShowChannelPeople] =
    useState(false);
  const [channelPeople, setChannelPeople] =
    useState([]);
  const [
    canManageChannelPeople,
    setCanManageChannelPeople,
  ] = useState(false);
  const [
    channelPeopleLoading,
    setChannelPeopleLoading,
  ] = useState(false);
  const [
    channelPeopleBusyMemberId,
    setChannelPeopleBusyMemberId,
  ] = useState('');
  const [
    channelPeopleSearch,
    setChannelPeopleSearch,
  ] = useState('');
  const [
    channelPeopleCandidates,
    setChannelPeopleCandidates,
  ] = useState([]);
  const [
    channelPeopleError,
    setChannelPeopleError,
  ] = useState('');
  const [peerPresenceProfile, setPeerPresenceProfile] =
    useState(null);

  useEffect(() => {
    let cancelled = false;
    const memberId =
      conversation?.kind === 'dm'
        ? String(conversation?.otherWorkspaceMemberId || '').trim()
        : '';

    if (!memberId || !serverUrl || !token) {
      setPeerPresenceProfile(null);
      return undefined;
    }

    if (externalPeerPresenceProfile) {
      setPeerPresenceProfile(externalPeerPresenceProfile);
    }

    listPresenceProfiles(serverUrl, token, [memberId])
      .then((result) => {
        if (cancelled) return;
        setPeerPresenceProfile(
          result?.presence_profiles?.[0] || null
        );
      })
      .catch(() => {
        if (!cancelled) setPeerPresenceProfile(null);
      });

    return () => { cancelled = true; };
  }, [
    conversation?.kind,
    conversation?.otherWorkspaceMemberId,
    externalPeerPresenceProfile,
    reconcileEpoch,
    serverUrl,
    token,
  ]);

  const draftScope = useMemo(
    () => ({
      identityId:
        session?.identity?.identity_id ||
        session?.identity_id ||
        '',
      workspaceId:
        session?.workspace?.workspace_id ||
        session?.workspace_id ||
        '',
      conversationId:
        conversation?.conversationId || '',
    }),
    [
      conversation?.conversationId,
      session?.identity?.identity_id,
      session?.identity_id,
      session?.workspace?.workspace_id,
      session?.workspace_id,
    ]
  );

  const draftScopeKey = [
    draftScope.identityId,
    draftScope.workspaceId,
    draftScope.conversationId,
  ].join('|');

  const conversationImageAttachments = useMemo(
    () =>
      messages.flatMap((message) => {
        if (
          !message ||
          message.deleted_at ||
          message.message_type !== 'ATTACHMENT'
        ) {
          return [];
        }

        return (message.attachments || [])
          .filter((attachment) =>
            attachmentIsImage(
              attachment?.content_type
            )
          )
          .map((attachment) => ({
            ...attachment,
            message_id: message.message_id,
            sender_display_name:
              message.sender_display_name ||
              (
                message.sender_member_id ===
                currentMemberId
                  ? 'You'
                  : 'Member'
              ),
            created_at:
              message.created_at ||
              null,
          }));
      }),
    [messages]
  );

  const updateDraft = useCallback((value) => {
    const next = String(value ?? '');
    draftRef.current = next;
    setDraft(next);
  }, []);

  const handleDraftChange = useCallback((value) => {
    draftUserChangedScopeRef.current = draftScopeKey;
    updateDraft(value);
  }, [draftScopeKey, updateDraft]);

  const activeMention = useMemo(() => findActiveMention(draft), [draft]);

  useEffect(() => {
    if (
      !activeMention ||
      !conversation?.conversationId ||
      !serverUrl ||
      !token
    ) {
      setMentionSuggestions([]);
      setMentionLoading(false);
    setMentionLookupError('');
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
        conversation.conversationId,
        conversation.kind,
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
                        .includes(
                          query
                        )
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

          if (
            conversation.kind ===
            'channel'
          ) {
            const payload =
              await listChannelMembers(
                serverUrl,
                token,
                conversation
                  .conversationId
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
        if (cancelled) {
          return;
        }

        filterSource(
          source
        );
      })
      .catch((error) => {
        mentionCandidateCacheRef
          .current
          .delete(
            cacheKey
          );

        if (cancelled) {
          return;
        }

        setMentionSuggestions([]);

        setMentionLookupError(
          error?.message ||
            'Could not load suggestions'
        );
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
    conversation?.conversationId,
    conversation?.kind,
    currentMemberId,
    serverUrl,
    token,
  ]);

  function selectMentionSuggestion(candidate) {
    const result = applyMentionCandidate(draft, activeMention, candidate);
    if (!result.mention) return;
    const next = result.text.slice(0, MAX_MESSAGE_CHARS);
    handleDraftChange(next);
    setDraftMentions((current) =>
      mentionsStillPresent(next, [...current, result.mention])
    );
    setMentionSuggestions([]);
    requestAnimationFrame(() => composerInputRef.current?.focus?.());
  }

  useEffect(() => {
    editingMessageRef.current = editingMessage;
  }, [editingMessage]);

  const scrollToBottom = useCallback((animated = true) => {
    setShowJumpToLatest(false);
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

  const handleThreadRead = useCallback(
    (messageId) => {
      const parentId = threadParent?.message_id || '';
      const conversationId = conversation?.conversationId || '';

      if (!messageId || !parentId || !conversationId) {
        return;
      }

      markThreadRead(
        serverUrl,
        token,
        conversationId,
        parentId,
        messageId
      ).catch(() => {});

      setMessages((current) =>
        current.map((item) => {
          if (item.message_id !== parentId) {
            return item;
          }

          if (Number(item.thread_unread_count || 0) === 0) {
            return item;
          }

          return {
            ...item,
            thread_unread_count: 0,
          };
        })
      );
    },
    [
      conversation?.conversationId,
      serverUrl,
      threadParent?.message_id,
      token,
    ]
  );

  const loadLatest = useCallback(
    async ({
      refresh = false,
      reconcile = false,
      initialUnreadCount = null,
    } = {}) => {
      if (!token || !conversation?.conversationId) return;

      if (refresh) {
        setRefreshing(true);
      } else if (!reconcile) {
        setLoading(true);
      }

      setError('');

      try {
        const result = await listMessagesWithTransientRetry(
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

        let dividerId = null;

        if (initialUnreadCount !== null) {
          dividerId = findUnreadDivider(
            latestRows,
            initialUnreadCount,
            currentMemberId
          );
          setNewMessageDividerId(dividerId);
          initialUnreadPositionedRef.current = !dividerId;
          nearBottomRef.current = !dividerId;
        }

        const latest =
          latestRows[latestRows.length - 1];

        // Opening a conversation with unread messages must not immediately
        // acknowledge the newest message. The read cursor advances when the
        // user actually reaches the bottom of the unread range.
        if (latest?.message_id && !dividerId) {
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
      currentMemberId,
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
    setPendingAttachments([]);
    setPickingAttachments(false);
    setAttachmentAction({
      attachmentId: '',
      mode: '',
    });
    setPreviewAttachment(null);
    setExpandedAttachmentId('');
    setSavedAttachments({});
    setEditingMessage(null);
    setQuoteReplyMessage(null);
    setMessageMutationId('');
    setError('');
    setNewMessageDividerId(null);
    setShowJumpToLatest(false);
    setShowMessageSearch(false);
    setMessageSearchQuery('');
    setMessageSearchResults([]);
    setMessageSearchError('');
    setMessageSearchMode('matches');
    setMessageSearchIndex(-1);
    setHighlightMessageId('');
    setThreadSearchTargetMessageId('');
    setMessageReadersTarget(null);
    setMessageReadersRefreshEpoch(0);
    setDraftMentions([]);
    setMentionSuggestions([]);
    setMentionLoading(false);

    arrivalDividerReadyRef.current = false;
    initialUnreadPositionedRef.current = false;
    nearBottomRef.current =
      Number(conversation?.unreadAtOpen || 0) <= 0;
    lastRealtimeSequenceRef.current = 0;
    lastMarkedReadMessageIdRef.current = null;

    loadLatest({
      initialUnreadCount:
        Number(conversation?.unreadAtOpen || 0),
    }).finally(() => {
      if (active) {
        arrivalDividerReadyRef.current = true;
      }
    });

    return () => {
      active = false;
    };
  }, [
    conversation?.conversationId,
    conversation?.unreadAtOpen,
    loadLatest,
  ]);

  useEffect(() => {
    const targetId = String(conversation?.initialMessageId || '').trim();
    if (!targetId || messages.length === 0) return;
    const exists = messages.some((item) => item.message_id === targetId);
    if (!exists) return;
    setHighlightMessageId(targetId);
    requestAnimationFrame(() => {
      const y = messageLayoutYRef.current.get(targetId);
      if (Number.isFinite(y)) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
      }
    });
  }, [conversation?.initialMessageId, messages.length]);

  useEffect(() => {
    let active = true;

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    draftHydratedScopeRef.current = '';
    draftUserChangedScopeRef.current = '';
    updateDraft('');

    if (!draftScopeKey) {
      return () => {
        active = false;
      };
    }

    loadConversationDraft(draftScope)
      .then((storedDraft) => {
        if (!active) return;
        draftHydratedScopeRef.current = draftScopeKey;
        if (draftUserChangedScopeRef.current !== draftScopeKey) {
          updateDraft(storedDraft);
        }
      })
      .catch(() => {
        if (!active) return;
        draftHydratedScopeRef.current = draftScopeKey;
      });

    return () => {
      active = false;

      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }

      if (
        (
          draftHydratedScopeRef.current === draftScopeKey ||
          draftUserChangedScopeRef.current === draftScopeKey
        ) &&
        !editingMessageRef.current
      ) {
        saveConversationDraft(
          draftScope,
          draftRef.current
        ).catch(() => {});
      }
    };
  }, [draftScope, draftScopeKey, updateDraft]);

  useEffect(() => {
    if (
      !draftScopeKey ||
      (
        draftHydratedScopeRef.current !== draftScopeKey &&
        draftUserChangedScopeRef.current !== draftScopeKey
      ) ||
      editingMessage
    ) {
      return undefined;
    }

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      saveConversationDraft(
        draftScope,
        draftRef.current
      ).catch(() => {});
    }, 300);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [draft, draftScope, draftScopeKey, editingMessage]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (
          nextState === 'active' ||
          !draftScopeKey ||
          (
            draftHydratedScopeRef.current !== draftScopeKey &&
            draftUserChangedScopeRef.current !== draftScopeKey
          ) ||
          editingMessageRef.current
        ) {
          return;
        }

        saveConversationDraft(
          draftScope,
          draftRef.current
        ).catch(() => {});
      }
    );

    return () => subscription.remove();
  }, [draftScope, draftScopeKey]);

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

    const readCursorEvents = pending
      .map((envelope) => envelope.payload)
      .filter(
        (payload) =>
          payload?.type === 'read_cursor.updated' &&
          payload.conversation_id === conversation?.conversationId &&
          payload.workspace_member_id !== currentMemberId
      );

    if (readCursorEvents.length > 0) {
      setMessageReadersRefreshEpoch((value) => value + 1);

      if (readReceiptRefreshTimerRef.current) {
        clearTimeout(readReceiptRefreshTimerRef.current);
      }

      readReceiptRefreshTimerRef.current = setTimeout(() => {
        readReceiptRefreshTimerRef.current = null;
        loadLatest({ reconcile: true });
      }, 250);
    }

    const reactionEvents = pending
      .map((envelope) => envelope.payload)
      .filter(
        (payload) =>
          payload?.type ===
            'message.reaction.updated' &&
          payload.conversation_id ===
            conversation?.conversationId &&
          payload.message_id &&
          Array.isArray(payload.reactions)
      );

    if (reactionEvents.length > 0) {
      const latestByMessageId =
        new Map();

      for (
        const event of reactionEvents
      ) {
        latestByMessageId.set(
          event.message_id,
          event.reactions
        );
      }

      setMessages((current) =>
        current.map((item) =>
          latestByMessageId.has(
            item.message_id
          )
            ? {
                ...item,
                reactions:
                  latestByMessageId.get(
                    item.message_id
                  ) || [],
              }
            : item
        )
      );

      setMessageActionTarget(
        (current) =>
          current?.message_id &&
          latestByMessageId.has(
            current.message_id
          )
            ? {
                ...current,
                reactions:
                  latestByMessageId.get(
                    current.message_id
                  ) || [],
              }
            : current
      );
    }

    const mutations = pending
      .map((envelope) => envelope.payload)
      .filter(
        (payload) =>
          (
            payload?.type ===
              'message.updated' ||
            payload?.type ===
              'message.deleted'
          ) &&
          payload.conversation_id ===
            conversation?.conversationId &&
          payload.message
      );

    if (mutations.length > 0) {
      setMessages((current) => {
        let next = current;

        for (const mutation of mutations) {
          next = next.map((item) =>
            item.message_id ===
            mutation.message.message_id
              ? mutation.message
              : item
          );
        }

        return next;
      });

      setQuoteReplyMessage((current) => {
        if (!current?.message_id) return current;

        const mutation = mutations.find(
          (item) =>
            item.message?.message_id === current.message_id
        );

        if (!mutation) return current;
        if (mutation.type === 'message.deleted') return null;
        return mutation.message;
      });

      const deletedIds =
        new Set(
          mutations
            .filter(
              (mutation) =>
                mutation.type ===
                'message.deleted'
            )
            .map(
              (mutation) =>
                mutation.message
                  .message_id
            )
        );

      if (
        editingMessage?.message_id &&
        deletedIds.has(
          editingMessage.message_id
        )
      ) {
        setEditingMessage(null);
        updateDraft('');
      }

      setPreviewAttachment(
        (current) => {
          if (
            !current?.attachment
              ?.message_id ||
            !deletedIds.has(
              current.attachment
                .message_id
            )
          ) {
            return current;
          }

          removeAttachmentLocalCopy(
            current.localPath
          ).catch(() => {});

          return null;
        }
      );
    }

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

    const threadReplies = incoming.filter(
      (message) => message.reply_to_message_id
    );
    const timelineIncoming = incoming.filter(
      (message) => !message.reply_to_message_id
    );

    if (threadReplies.length > 0) {
      setMessages((current) => current.map((item) => {
        const repliesForItem = threadReplies.filter(
          (reply) => reply.reply_to_message_id === item.message_id
        );
        if (repliesForItem.length === 0) return item;
        const sorted = mergeMessages(repliesForItem);
        const latestReply = sorted[sorted.length - 1];
        return {
          ...item,
          thread_reply_count:
            Number(item.thread_reply_count || 0) + repliesForItem.length,
          thread_last_reply_at:
            latestReply?.created_at || item.thread_last_reply_at || null,
          thread_last_reply_message_id:
            latestReply?.message_id || item.thread_last_reply_message_id || null,
        };
      }));

      const externalThreadReply = threadReplies.find(
        (message) =>
          !(message.sender_type === 'HUMAN' &&
            message.sender_member_id === currentMemberId)
      );

      if (externalThreadReply?.reply_to_message_id) {
        setNewMessageDividerId(
          (current) => current || externalThreadReply.reply_to_message_id
        );
      }
    }

    if (timelineIncoming.length === 0) {
      return;
    }

    const incomingFromOthers = timelineIncoming.filter(
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
        ...timelineIncoming,
      ])
    );

    const sortedIncoming = mergeMessages(timelineIncoming);
    const latestIncoming =
      sortedIncoming[sortedIncoming.length - 1];
    const shouldFollow = nearBottomRef.current;

    if (shouldFollow) {
      if (latestIncoming?.message_id) {
        markMessageRead(latestIncoming.message_id);
      }
      setNewMessageDividerId(null);
      scrollToBottom(true);
    }
  }, [
    conversation?.conversationId,
    currentMemberId,
    editingMessage?.message_id,
    loadLatest,
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
      loadingOlderRef.current ||
      loadingOlder ||
      !page.has_more ||
      !page.next_before_message_id
    ) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setError('');

    try {
      const result = await listMessagesWithTransientRetry(
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
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function chooseAttachments() {
    if (sending || pickingAttachments) return;

    const availableSlots =
      MAX_PENDING_ATTACHMENTS -
      pendingAttachments.length;

    if (availableSlots <= 0) {
      setError(
        `Maximum ${MAX_PENDING_ATTACHMENTS} attachments can be sent at a time.`
      );
      return;
    }

    setPickingAttachments(true);
    setError('');

    try {
      const picked = await pick({
        type: PICKER_ATTACHMENT_TYPES,
        allowMultiSelection: true,
        mode: 'import',
      });

      const existingKeys = new Set(
        pendingAttachments.map(
          (item) =>
            `${item.uri}|${item.name}|${item.size}`
        )
      );

      const accepted = [];
      const rejected = [];

      for (const file of picked) {
        if (accepted.length >= availableSlots) {
          break;
        }

        const name =
          String(file?.name || '').trim() ||
          'attachment';
        const uri = String(file?.uri || '').trim();
        const size = Number(file?.size || 0);
        const contentType =
          normalizeAttachmentContentType(file);

        if (
          file?.hasRequestedType === false ||
          !contentType
        ) {
          rejected.push(
            `File type not allowed: ${name}`
          );
          continue;
        }

        if (
          !Number.isFinite(size) ||
          size <= 0 ||
          size > MAX_ATTACHMENT_BYTES
        ) {
          rejected.push(
            `File must be between 1 byte and 10 MB: ${name}`
          );
          continue;
        }

        if (!uri) {
          rejected.push(
            `Could not access selected file: ${name}`
          );
          continue;
        }

        const duplicateKey =
          `${uri}|${name}|${size}`;

        if (
          existingKeys.has(duplicateKey) ||
          accepted.some(
            (item) =>
              `${item.uri}|${item.name}|${item.size}` ===
              duplicateKey
          )
        ) {
          continue;
        }

        accepted.push({
          uri,
          name,
          size,
          contentType,
          clientMessageId:
            makeClientMessageId(),
          uploadStatus: 'ready',
          uploadProgress: 0,
        });
      }

      if (accepted.length > 0) {
        setPendingAttachments((current) => [
          ...current,
          ...accepted,
        ].slice(0, MAX_PENDING_ATTACHMENTS));
      }

      if (picked.length > availableSlots) {
        rejected.push(
          `Maximum ${MAX_PENDING_ATTACHMENTS} attachments can be sent at a time.`
        );
      }

      if (rejected.length > 0) {
        setError(rejected[0]);
      }
    } catch (requestError) {
      if (
        isErrorWithCode(requestError) &&
        requestError.code ===
          errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      setError(
        requestError?.message ||
          'Could not choose attachment'
      );
    } finally {
      setPickingAttachments(false);
    }
  }

  function updatePendingAttachment(
    clientMessageId,
    patch
  ) {
    setPendingAttachments((current) =>
      current.map((item) =>
        item.clientMessageId === clientMessageId
          ? { ...item, ...patch }
          : item
      )
    );
  }

  function removePendingAttachment(
    clientMessageId
  ) {
    if (sending || pickingAttachments) return;

    setPendingAttachments((current) =>
      current.filter(
        (item) =>
          item.clientMessageId !==
          clientMessageId
      )
    );
  }

  async function closeAttachmentPreview() {
    const localPath =
      previewAttachment?.localPath;

    setPreviewAttachment(null);

    if (localPath) {
      await removeAttachmentLocalCopy(
        localPath
      );
    }
  }

  function openImagePreviewAtIndex(
    requestedIndex
  ) {
    if (
      conversationImageAttachments.length === 0
    ) {
      return;
    }

    const total =
      conversationImageAttachments.length;

    const normalizedIndex =
      (
        (
          Number(
            requestedIndex ||
            0
          ) %
          total
        ) +
        total
      ) %
      total;

    const attachment =
      conversationImageAttachments[
        normalizedIndex
      ];

    if (
      !attachment?.attachment_id
    ) {
      return;
    }

    setError('');

    setPreviewAttachment({
      attachment,
      fileName:
        attachmentFileName(
          attachment
        ),
      contentType:
        attachmentContentType(
          attachment
        ),
      galleryIndex:
        normalizedIndex,
      galleryTotal:
        total,
    });
  }

  async function handlePreviewAttachment(
    attachment
  ) {
    if (
      !attachment?.attachment_id ||
      attachmentAction.attachmentId
    ) {
      return;
    }

    if (
      attachmentIsImage(
        attachment?.content_type
      )
    ) {
      const galleryIndex =
        conversationImageAttachments
          .findIndex(
            (item) =>
              item.attachment_id ===
              attachment.attachment_id
          );

      await openImagePreviewAtIndex(
        galleryIndex >= 0
          ? galleryIndex
          : 0
      );
      return;
    }

    setAttachmentAction({
      attachmentId:
        attachment.attachment_id,
      mode: 'preview',
    });
    setError('');

    try {
      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversation.conversationId,
          attachment
        );

      if (Platform.OS === 'android') {
        await ReactNativeBlobUtil.android
          .actionViewIntent(
            downloaded.localPath,
            downloaded.contentType
          );
      } else {
        ReactNativeBlobUtil.ios
          .previewDocument(
            downloaded.localPath
          );
      }
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not preview attachment'
      );
    } finally {
      setAttachmentAction({
        attachmentId: '',
        mode: '',
      });
    }
  }

  async function handleDownloadAttachment(
    attachment
  ) {
    if (
      !attachment?.attachment_id ||
      attachmentAction.attachmentId
    ) {
      return;
    }

    setAttachmentAction({
      attachmentId:
        attachment.attachment_id,
      mode: 'download',
    });
    setError('');

    let localPath = '';

    try {
      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversation.conversationId,
          attachment
        );

      localPath = downloaded.localPath;

      if (Platform.OS === 'android') {
        const savedUri =
          await ReactNativeBlobUtil
            .MediaCollection
            .copyToMediaStore(
              {
                name:
                  downloaded.fileName,
                parentFolder:
                  'AkshaConnect',
                mimeType:
                  downloaded.contentType,
              },
              'Download',
              downloaded.localPath
            );

        setSavedAttachments((current) => ({
          ...current,
          [attachment.attachment_id]: {
            contentUri: savedUri,
            fileName:
              downloaded.fileName,
            contentType:
              downloaded.contentType,
          },
        }));

        await removeAttachmentLocalCopy(
          downloaded.localPath
        );
        localPath = '';
      } else {
        await ReactNativeBlobUtil.ios
          .openDocument(
            downloaded.localPath
          );
      }
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not download attachment'
      );

      await removeAttachmentLocalCopy(
        localPath
      );
    } finally {
      setAttachmentAction({
        attachmentId: '',
        mode: '',
      });
    }
  }

  function previewMessageForAttachment() {
    const messageId =
      previewAttachment
        ?.attachment
        ?.message_id;

    if (!messageId) {
      return null;
    }

    return (
      messages.find(
        (message) =>
          message.message_id ===
          messageId
      ) ||
      null
    );
  }

  async function handleSharePreviewAttachment() {
    const current =
      previewAttachment;

    if (
      !current?.attachment
        ?.attachment_id ||
      attachmentAction
        .attachmentId
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

    setAttachmentAction({
      attachmentId:
        current.attachment
          .attachment_id,
      mode: 'share',
    });

    setError('');

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
          conversation
            .conversationId
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
      setAttachmentAction({
        attachmentId: '',
        mode: '',
      });
    }
  }

  async function handleForwardPreviewAttachment() {
    const message =
      previewMessageForAttachment();

    if (!message) {
      return;
    }

    await closeAttachmentPreview();
    await openForwardMessage(
      message
    );
  }

  async function handleReactPreviewAttachment(
    emoji
  ) {
    const message =
      previewMessageForAttachment();

    if (!message) {
      return;
    }

    await reactToMessage(
      message,
      emoji
    );
  }

  function toggleAttachmentActions(
    attachmentId
  ) {
    setExpandedAttachmentId((current) =>
      current === attachmentId
        ? ''
        : attachmentId
    );
  }

  async function handleOpenAttachment(
    attachment
  ) {
    if (
      !attachment?.attachment_id ||
      attachmentAction.attachmentId
    ) {
      return;
    }

    setAttachmentAction({
      attachmentId:
        attachment.attachment_id,
      mode: 'open',
    });
    setError('');

    try {
      const saved =
        savedAttachments[
          attachment.attachment_id
        ];

      if (
        Platform.OS === 'android' &&
        saved?.contentUri
      ) {
        await ReactNativeBlobUtil.android
          .actionViewIntent(
            saved.contentUri,
            saved.contentType
          );
        return;
      }

      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversation.conversationId,
          attachment
        );

      if (Platform.OS === 'android') {
        await ReactNativeBlobUtil.android
          .actionViewIntent(
            downloaded.localPath,
            downloaded.contentType
          );
      } else {
        await ReactNativeBlobUtil.ios
          .openDocument(
            downloaded.localPath
          );
      }
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not open attachment'
      );
    } finally {
      setAttachmentAction({
        attachmentId: '',
        mode: '',
      });
    }
  }

  function applyMessageMutation(
    nextMessage
  ) {
    if (!nextMessage?.message_id) {
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item.message_id ===
        nextMessage.message_id
          ? nextMessage
          : item
      )
    );
  }

  function beginEditMessage(
    message
  ) {
    if (
      !message ||
      message.message_type !== 'TEXT' ||
      message.deleted_at
    ) {
      return;
    }

    if (
      draft.trim() ||
      pendingAttachments.length > 0
    ) {
      Alert.alert(
        'Draft in progress',
        'Send or clear the current draft before editing a message.'
      );
      return;
    }

    setQuoteReplyMessage(null);
    setEditingMessage(message);
    setDraftMentions(
      (message.mentions || []).map((mention) => ({
        mention_type: mention.mention_type,
        target_id:
          mention.target_workspace_member_id ||
          mention.target_channel_conversation_id,
        display_text: mention.display_text,
      }))
    );
    updateDraft(
      String(message.body_text || '')
    );
    setError('');
    scrollToBottom(false);
  }

  function beginQuoteReply(message) {
    if (!message || message.deleted_at) {
      return;
    }

    if (editingMessage) {
      setEditingMessage(null);
      updateDraft('');
    }

    setQuoteReplyMessage(message);
    setError('');

    requestAnimationFrame(() => {
      composerInputRef.current?.focus?.();
    });
  }

  function cancelQuoteReply() {
    setQuoteReplyMessage(null);
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
    setDraftMentions([]);
    setMentionSuggestions([]);
    updateDraft('');
  }

  async function deleteOwnedMessage(
    message
  ) {
    if (
      !message?.message_id ||
      messageMutationId
    ) {
      return;
    }

    setMessageMutationId(
      message.message_id
    );
    setError('');

    try {
      const result =
        await deleteMessage(
          serverUrl,
          token,
          conversation.conversationId,
          message.message_id
        );

      if (result?.message) {
        applyMessageMutation(
          result.message
        );
      }

      if (
        editingMessage?.message_id ===
        message.message_id
      ) {
        cancelEditingMessage();
      }

      if (
        previewAttachment
          ?.attachment
          ?.message_id ===
        message.message_id
      ) {
        await closeAttachmentPreview();
      }

      const attachmentIds =
        new Set(
          (message.attachments || [])
            .map(
              (item) =>
                item.attachment_id
            )
            .filter(Boolean)
        );

      if (attachmentIds.size > 0) {
        setSavedAttachments(
          (current) => {
            const next = {
              ...current,
            };

            for (
              const attachmentId
              of attachmentIds
            ) {
              delete next[
                attachmentId
              ];
            }

            return next;
          }
        );
      }

      setExpandedAttachmentId('');
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not delete message'
      );
    } finally {
      setMessageMutationId('');
    }
  }

  function closeMessageActions() {
    setMessageActionTarget(null);
  }

  async function openForwardMessage(message) {
    if (!message || message.deleted_at) {
      return;
    }

    closeMessageActions();
    setForwardMessage(message);
    setForwardTargets([]);
    setForwardQuery('');
    setForwardError('');
    setForwardLoading(true);

    try {
      const [channelPayload, dmPayload] =
        await Promise.all([
          listChannels(
            serverUrl,
            token
          ),
          listDirectMessages(
            serverUrl,
            token
          ),
        ]);

      const targets = [
        ...(dmPayload?.direct_messages || [])
          .map((dm) => ({
            kind: 'dm',
            conversationId:
              dm.conversation_id,
            title:
              dm.other_display_name ||
              'Member',
            subtitle:
              dm.other_primary_email ||
              'Direct message',
            otherWorkspaceMemberId:
              dm.other_workspace_member_id || '',
          })),
        ...(channelPayload?.channels || [])
          .map((channel) => ({
            kind: 'channel',
            conversationId:
              channel.conversation_id,
            title:
              channel.channel_name ||
              'Channel',
            subtitle:
              channel.visibility ===
              'PRIVATE'
                ? 'Private channel'
                : 'Public channel',
          })),
      ]
        .filter(
          (target) =>
            target.conversationId &&
            target.conversationId !==
              conversation.conversationId
        )
        .sort((left, right) =>
          String(left.title || '')
            .localeCompare(
              String(right.title || ''),
              undefined,
              { sensitivity: 'base' }
            )
        );

      setForwardTargets(targets);
    } catch (requestError) {
      setForwardError(
        requestError?.message ||
          'Could not load conversations.'
      );
    } finally {
      setForwardLoading(false);
    }
  }

  function closeForwardMessage() {
    if (forwardBusyConversationId) {
      return;
    }

    setForwardMessage(null);
    setForwardTargets([]);
    setForwardQuery('');
    setForwardError('');
  }

  async function forwardMessageToTarget(
    target
  ) {
    if (
      !forwardMessage ||
      !target?.conversationId ||
      forwardBusyConversationId
    ) {
      return;
    }

    setForwardBusyConversationId(
      target.conversationId
    );
    setForwardError('');

    const localPaths = [];

    try {
      const bodyText =
        String(
          forwardMessage.body_text || ''
        ).trim();

      if (bodyText) {
        await sendMessage(
          serverUrl,
          token,
          target.conversationId,
          {
            bodyText,
            clientMessageId:
              makeClientMessageId(),
          }
        );
      }

      for (
        const attachment
        of forwardMessage.attachments || []
      ) {
        const downloaded =
          await downloadAttachmentToCache(
            serverUrl,
            token,
            conversation.conversationId,
            attachment
          );

        localPaths.push(
          downloaded.localPath
        );

        await uploadAttachment(
          serverUrl,
          token,
          target.conversationId,
          {
            localPath:
              downloaded.localPath,
            fileName:
              downloaded.fileName,
            contentType:
              downloaded.contentType,
            clientMessageId:
              makeClientMessageId(),
          }
        );
      }

      if (
        !bodyText &&
        !(forwardMessage.attachments || [])
          .length
      ) {
        throw new Error(
          'This message has no content to forward.'
        );
      }

      setForwardMessage(null);
      setForwardTargets([]);
      setForwardQuery('');
      setConversation({
        ...target,
        unreadAtOpen: 0,
      });
    } catch (requestError) {
      setForwardError(
        requestError?.message ||
          'Could not forward the message.'
      );
    } finally {
      for (const localPath of localPaths) {
        await removeAttachmentLocalCopy(
          localPath
        );
      }

      setForwardBusyConversationId('');
    }
  }

  async function copyMessage(message) {
    const clipboard =
      NativeModules.AkshaConnectClipboard;

    const imageAttachment =
      message?.message_type === 'ATTACHMENT' &&
      Array.isArray(message.attachments)
        ? message.attachments.find((item) =>
            attachmentIsImage(item?.content_type)
          )
        : null;

    if (imageAttachment) {
      let localPath = '';

      try {
        if (!clipboard?.setImage) {
          throw new Error(
            'Image clipboard service is unavailable'
          );
        }

        const downloaded =
          await downloadAttachmentToCache(
            serverUrl,
            token,
            conversation.conversationId,
            imageAttachment
          );

        localPath = downloaded.localPath;

        await clipboard.setImage(
          downloaded.localPath,
          downloaded.contentType,
          downloaded.fileName
        );

        closeMessageActions();
        Alert.alert(
          'Image copied',
          'The image is ready to paste into Android apps that accept image clipboard content.'
        );
      } catch (copyError) {
        closeMessageActions();
        Alert.alert(
          'Could not copy image',
          copyError?.message ||
            'Image clipboard service is unavailable.'
        );
      } finally {
        await removeAttachmentLocalCopy(
          localPath
        );
      }

      return;
    }

    const value = copyableMessageText(message);

    if (!value) {
      closeMessageActions();
      Alert.alert(
        'Nothing to copy',
        'This message does not contain copyable text.'
      );
      return;
    }

    try {
      if (!clipboard?.setText) {
        throw new Error(
          'Clipboard service is unavailable'
        );
      }

      clipboard.setText(value);
      closeMessageActions();
    } catch (copyError) {
      closeMessageActions();
      Alert.alert(
        'Could not copy message',
        copyError?.message ||
          'Clipboard service is unavailable.'
      );
    }
  }

  async function togglePinnedMessage(message) {
    if (!message?.message_id || !conversation?.conversationId) return;
    const pinned = pinnedMessageIds.has(message.message_id);
    try {
      if (pinned) {
        await unpinConversationMessage(
          serverUrl,
          token,
          conversation.conversationId,
          message.message_id
        );
      } else {
        await pinConversationMessage(
          serverUrl,
          token,
          conversation.conversationId,
          message.message_id
        );
      }
      setPinnedMessageIds((current) => {
        const next = new Set(current);
        if (pinned) next.delete(message.message_id);
        else next.add(message.message_id);
        return next;
      });
    } catch (requestError) {
      Alert.alert(
        pinned ? 'Could not unpin message' : 'Could not pin message',
        requestError?.message || 'Please try again.'
      );
    }
  }

  async function toggleSavedMessage(message) {
    if (!message?.message_id || !conversation?.conversationId) return;
    const saved = savedMessageIds.has(message.message_id);
    try {
      if (saved) {
        await removeSavedMessageLocally(savedScope, message.message_id);
      } else {
        await saveMessageLocally(savedScope, {
          message_id: message.message_id,
          conversation_id: conversation.conversationId,
          conversation_kind: conversation.kind,
          conversation_title: conversation.title,
          conversation_subtitle: conversation.subtitle,
          other_workspace_member_id: conversation.otherWorkspaceMemberId || '',
          sender_display_name: message.sender_display_name || (message.sender_member_id === currentMemberId ? 'You' : 'Member'),
          message_type: message.message_type,
          body_text: message.body_text || '',
          created_at: message.created_at || null,
        });
      }
      setSavedMessageIds((current) => {
        const next = new Set(current);
        if (saved) next.delete(message.message_id);
        else next.add(message.message_id);
        return next;
      });
    } catch {
      Alert.alert('Could not update saved messages', 'Please try again.');
    }
  }

  function manageOwnMessage(
    message,
    onReplyInThread
  ) {
    if (
      !message ||
      message.deleted_at
    ) {
      return;
    }

    setMessageActionTarget({
      message,
      onReplyInThread,
    });
  }

  function messageActionItems() {
    const message =
      messageActionTarget?.message;

    if (!message) return [];

    const actions = [];

    const own =
      message.sender_type === 'HUMAN' &&
      message.sender_member_id === currentMemberId;

    actions.push({
      key: 'reply',
      icon: '↩',
      label: 'Reply',
      onPress: () => {
        closeMessageActions();
        beginQuoteReply(message);
      },
    });

    if (!message.reply_to_message_id) {
      actions.push({
        key: 'thread',
        icon: '↪',
        label: 'Reply in thread',
        onPress: () => {
          const openThread =
            messageActionTarget?.onReplyInThread;
          closeMessageActions();
          openThread?.();
        },
      });
    }

    if (copyableMessageText(message)) {
      actions.push({
        key: 'copy',
        icon: '⧉',
        label:
          message.message_type === 'ATTACHMENT'
            ? (message.attachments || []).some((item) =>
                attachmentIsImage(item?.content_type)
              )
              ? 'Copy image'
              : 'Copy file name'
            : 'Copy',
        onPress: () => copyMessage(message),
      });
    }

    actions.push({
      key: 'forward',
      icon: '➜',
      label: 'Forward',
      onPress: () =>
        openForwardMessage(message),
    });


    actions.push({
      key: pinnedMessageIds.has(message.message_id) ? 'unpin' : 'pin',
      icon: '📌',
      label: pinnedMessageIds.has(message.message_id) ? 'Unpin message' : 'Pin message',
      onPress: () => {
        closeMessageActions();
        togglePinnedMessage(message);
      },
    });

    actions.push({
      key: savedMessageIds.has(message.message_id) ? 'unsave' : 'save',
      icon: '🔖',
      label: savedMessageIds.has(message.message_id) ? 'Remove saved message' : 'Save message',
      onPress: () => {
        closeMessageActions();
        toggleSavedMessage(message);
      },
    });

    if (
      own &&
      message.message_type === 'TEXT'
    ) {
      actions.push({
        key: 'edit',
        icon: '✎',
        label: 'Edit',
        onPress: () => {
          closeMessageActions();
          beginEditMessage(message);
        },
      });
    }

    if (
      own &&
      (
        message.message_type === 'TEXT' ||
        message.message_type ===
          'ATTACHMENT'
      )
    ) {
      actions.push({
        key: 'delete',
        icon: '⌫',
        label:
          message.message_type ===
            'ATTACHMENT'
            ? 'Delete file'
            : 'Delete message',
        destructive: true,
        onPress: () => {
          closeMessageActions();
          Alert.alert(
            'Confirm delete',
            message.message_type ===
              'ATTACHMENT'
              ? 'Delete this file from the conversation?'
              : 'Delete this message?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  deleteOwnedMessage(
                    message
                  );
                },
              },
            ]
          );
        },
      });
    }

    return actions;
  }

  async function submitMessage() {
    const bodyText = draft.trim();
    const mentions = mentionsStillPresent(bodyText, draftMentions);
    const attachmentsToSend =
      pendingAttachments.map((item) => ({
        ...item,
      }));
    const quoteMessageId =
      quoteReplyMessage?.message_id || null;
    let quoteConsumed = false;

    if (editingMessage) {
      if (
        !bodyText ||
        bodyText.length >
          MAX_MESSAGE_CHARS ||
        sending
      ) {
        return;
      }

      setSending(true);
      setError('');

      try {
        const result =
          await editMessage(
            serverUrl,
            token,
            conversation.conversationId,
            editingMessage.message_id,
            bodyText,
            mentions
          );

        if (result?.message) {
          applyMessageMutation(
            result.message
          );
        }

        setEditingMessage(null);
        setDraftMentions([]);
        setMentionSuggestions([]);
        updateDraft('');
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Could not edit message'
        );
      } finally {
        setSending(false);
      }

      return;
    }

    if (
      (!bodyText && attachmentsToSend.length === 0) ||
      sending
    ) {
      return;
    }

    setSending(true);
    setError('');

    let latestCreatedMessage = null;

    try {
      if (bodyText) {
        const result = await sendMessage(
          serverUrl,
          token,
          conversation.conversationId,
          {
            bodyText,
            clientMessageId:
              makeClientMessageId(),
            quoteMessageId,
            mentions,
          }
        );

        if (quoteMessageId) {
          quoteConsumed = true;
        }

        if (result?.message) {
          latestCreatedMessage = result.message;
          setMessages((current) =>
            mergeMessages([
              ...current,
              result.message,
            ])
          );
        } else {
          await loadLatest({ refresh: true });
        }

        // Clear only after durable acknowledgement so an attachment retry
        // cannot resend already acknowledged text.
        await clearConversationDraft(draftScope).catch(() => {});
        setDraftMentions([]);
        setMentionSuggestions([]);
        updateDraft('');
      }

      for (const pending of attachmentsToSend) {
        let localPath = '';

        updatePendingAttachment(
          pending.clientMessageId,
          {
            uploadStatus: 'uploading',
            uploadProgress: 0,
          }
        );

        try {
          localPath =
            await prepareAttachmentLocalCopy(
              pending
            );

          const result =
            await uploadAttachment(
              serverUrl,
              token,
              conversation.conversationId,
              {
                localPath,
                fileName: pending.name,
                contentType: pending.contentType,
                clientMessageId:
                  pending.clientMessageId,
                quoteMessageId:
                  !quoteConsumed
                    ? quoteMessageId
                    : null,
                onProgress: (progress) => {
                  updatePendingAttachment(
                    pending.clientMessageId,
                    {
                      uploadStatus: 'uploading',
                      uploadProgress: progress,
                    }
                  );
                },
              }
            );

          if (result?.message) {
            latestCreatedMessage = result.message;
            setMessages((current) =>
              mergeMessages([
                ...current,
                result.message,
              ])
            );
          }

          if (
            quoteMessageId &&
            !quoteConsumed
          ) {
            quoteConsumed = true;
          }

          // Remove only the file durably acknowledged by the server.
          // Any failed/not-yet-sent item keeps its original stable client id.
          setPendingAttachments((current) =>
            current.filter(
              (item) =>
                item.clientMessageId !==
                pending.clientMessageId
            )
          );
        } catch (uploadError) {
          updatePendingAttachment(
            pending.clientMessageId,
            {
              uploadStatus: 'failed',
              uploadProgress: 0,
            }
          );

          throw uploadError;
        } finally {
          await removeAttachmentLocalCopy(
            localPath
          );
        }
      }

      setNewMessageDividerId(null);

      if (quoteConsumed) {
        setQuoteReplyMessage(null);
      }

      if (latestCreatedMessage?.message_id) {
        markMessageRead(
          latestCreatedMessage.message_id
        );
      }

      scrollToBottom(true);
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not send message or attachment'
      );
    } finally {
      setSending(false);
    }
  }

  const loadChannelPeople = useCallback(
    async () => {
      if (
        conversation?.kind !== 'channel' ||
        !conversation?.conversationId ||
        !token
      ) {
        return;
      }

      setChannelPeopleLoading(true);
      setChannelPeopleError('');

      try {
        const payload =
          await listChannelMembers(
            serverUrl,
            token,
            conversation.conversationId
          );

        const members = payload?.members || [];
        let profilesByMember = {};
        try {
          const profilePayload = await listPresenceProfiles(
            serverUrl,
            token,
            members
              .map((member) => member?.workspace_member_id)
              .filter(Boolean)
          );
          profilesByMember = Object.fromEntries(
            (profilePayload?.presence_profiles || []).map((profile) => [
              profile.workspace_member_id,
              profile,
            ])
          );
        } catch {}

        setChannelPeople(
          members.map((member) => ({
            ...member,
            presence_profile:
              profilesByMember[member.workspace_member_id] || null,
          }))
        );
        setCanManageChannelPeople(
          Boolean(
            payload?.can_manage_members
          )
        );
      } catch (requestError) {
        setChannelPeopleError(
          requestError?.message ||
            'Could not load channel people'
        );
      } finally {
        setChannelPeopleLoading(false);
      }
    },
    [
      conversation?.conversationId,
      conversation?.kind,
      serverUrl,
      token,
    ]
  );

  const openChannelPeople = useCallback(
    () => {
      if (
        conversation?.kind !== 'channel'
      ) {
        return;
      }

      setShowChannelPeople(true);
      setChannelPeopleSearch('');
      setChannelPeopleCandidates([]);
      setChannelPeopleError('');
      loadChannelPeople();
    },
    [
      conversation?.kind,
      loadChannelPeople,
    ]
  );

  const searchChannelPeople = useCallback(
    async () => {
      if (
        !canManageChannelPeople ||
        !token
      ) {
        return;
      }

      setChannelPeopleLoading(true);
      setChannelPeopleError('');

      try {
        const payload =
          await listWorkspaceMembers(
            serverUrl,
            token,
            {
              query:
                channelPeopleSearch.trim(),
              limit: 50,
            }
          );

        const existingIds =
          new Set(
            channelPeople.map(
              (item) =>
                item.workspace_member_id
            )
          );

        setChannelPeopleCandidates(
          (payload?.members || [])
            .filter(
              (item) =>
                !existingIds.has(
                  item.workspace_member_id
                )
            )
        );
      } catch (requestError) {
        setChannelPeopleError(
          requestError?.message ||
            'Could not search workspace people'
        );
      } finally {
        setChannelPeopleLoading(false);
      }
    },
    [
      canManageChannelPeople,
      channelPeople,
      channelPeopleSearch,
      serverUrl,
      token,
    ]
  );

  const addPersonToChannel = useCallback(
    async (member) => {
      const memberId =
        member?.workspace_member_id;

      if (
        !memberId ||
        !conversation?.conversationId
      ) {
        return;
      }

      setChannelPeopleBusyMemberId(
        memberId
      );
      setChannelPeopleError('');

      try {
        await addChannelMember(
          serverUrl,
          token,
          conversation.conversationId,
          memberId
        );

        await loadChannelPeople();

        setChannelPeopleCandidates(
          (current) =>
            current.filter(
              (item) =>
                item.workspace_member_id !==
                memberId
            )
        );
      } catch (requestError) {
        setChannelPeopleError(
          requestError?.message ||
            'Could not add person to channel'
        );
      } finally {
        setChannelPeopleBusyMemberId('');
      }
    },
    [
      conversation?.conversationId,
      loadChannelPeople,
      serverUrl,
      token,
    ]
  );

  const removePersonFromChannel =
    useCallback(
      async (member) => {
        const memberId =
          member?.workspace_member_id;

        if (
          !memberId ||
          !conversation?.conversationId
        ) {
          return;
        }

        Alert.alert(
          'Remove from channel?',
          `${
            member?.display_name ||
            'This person'
          } will lose access if this is a private channel.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                setChannelPeopleBusyMemberId(
                  memberId
                );
                setChannelPeopleError('');

                try {
                  await removeChannelMember(
                    serverUrl,
                    token,
                    conversation.conversationId,
                    memberId
                  );

                  await loadChannelPeople();
                } catch (requestError) {
                  setChannelPeopleError(
                    requestError?.message ||
                      'Could not remove person from channel'
                  );
                } finally {
                  setChannelPeopleBusyMemberId(
                    ''
                  );
                }
              },
            },
          ]
        );
      },
      [
        conversation?.conversationId,
        loadChannelPeople,
        serverUrl,
        token,
      ]
    );

  useEffect(() => {
    setShowChannelPeople(false);
    setChannelPeople([]);
    setChannelPeopleCandidates([]);
    setChannelPeopleSearch('');
    setChannelPeopleError('');
    setCanManageChannelPeople(false);
  }, [conversation?.conversationId]);

  function scrollToMessageLayout(messageId, attempt = 0) {
    const targetId = String(messageId || '').trim();
    if (!targetId) return;

    requestAnimationFrame(() => {
      const y = messageLayoutYRef.current.get(targetId);
      if (Number.isFinite(y)) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - 16),
          animated: true,
        });
        return;
      }

      if (attempt < 8) {
        setTimeout(
          () => scrollToMessageLayout(targetId, attempt + 1),
          35
        );
      }
    });
  }

  async function jumpToMessage(messageId) {
    const targetId = String(messageId || '').trim();
    if (!targetId) return null;

    let working = messages;
    let workingPage = page;
    let guard = 0;

    while (!working.some((item) => item.message_id === targetId) &&
           workingPage?.has_more && workingPage?.next_before_message_id && guard < 40) {
      guard += 1;
      const result = await listMessagesWithTransientRetry(
        serverUrl,
        token,
        conversation.conversationId,
        { limit: 50, before: workingPage.next_before_message_id }
      );
      working = mergeMessages([...(result.messages || []), ...working]);
      workingPage = result.page || { has_more: false, next_before_message_id: null };
      setMessages(working);
      setPage(workingPage);
    }

    const target = working.find((item) => item.message_id === targetId) || null;
    if (!target) {
      Alert.alert('Message unavailable', 'The original message could not be found.');
      return null;
    }

    setHighlightMessageId(targetId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightMessageId(''), 2600);

    scrollToMessageLayout(targetId);
    return target;
  }

  async function runMessageSearch() {
    const query = messageSearchQuery.trim();
    if (!query || messageSearchLoading) return;

    Keyboard.dismiss();
    setMessageSearchLoading(true);
    setMessageSearchError('');
    try {
      const result = await searchConversationMessages(
        serverUrl,
        token,
        conversation.conversationId,
        { query, limit: 50 }
      );
      const rows = result?.messages || [];
      setMessageSearchResults(rows);
      setMessageSearchIndex(rows.length ? 0 : -1);
      setMessageSearchMode('matches');
    } catch (requestError) {
      setMessageSearchResults([]);
      setMessageSearchIndex(-1);
      setMessageSearchError(requestError?.message || 'Could not search messages');
    } finally {
      setMessageSearchLoading(false);
    }
  }

  async function openSearchResultAt(index) {
    const rows = messageSearchResults || [];
    if (!rows.length) return;

    const nextIndex = Math.max(
      0,
      Math.min(rows.length - 1, Number(index || 0))
    );
    const message = rows[nextIndex];
    if (!message?.message_id) return;

    setMessageSearchIndex(nextIndex);
    setMessageSearchMode('conversation');

    if (message.reply_to_message_id) {
      const parent =
        messages.find(
          (item) =>
            item.message_id === message.reply_to_message_id
        ) ||
        await jumpToMessage(message.reply_to_message_id);

      if (parent) {
        setThreadSearchTargetMessageId(message.message_id);
        setThreadParent(parent);
      }
      return;
    }

    setThreadSearchTargetMessageId('');
    setThreadParent(null);
    await jumpToMessage(message.message_id);
  }

  async function navigateMessageSearch(delta) {
    if (!messageSearchResults.length || messageSearchIndex < 0) return;

    const nextIndex = messageSearchIndex + delta;
    if (
      nextIndex < 0 ||
      nextIndex >= messageSearchResults.length
    ) {
      return;
    }

    await openSearchResultAt(nextIndex);
  }

  function changeMessageSearchMode(mode) {
    const nextMode =
      mode === 'conversation'
        ? 'conversation'
        : 'matches';

    setMessageSearchMode(nextMode);

    if (
      nextMode === 'conversation' &&
      messageSearchIndex >= 0 &&
      messageSearchIndex < messageSearchResults.length
    ) {
      openSearchResultAt(messageSearchIndex);
    }
  }

  function insertEmoji(emoji) {
    const value = String(emoji || '');
    if (!value) return;
    const next = `${draft}${value}`.slice(0, MAX_MESSAGE_CHARS);
    handleDraftChange(next);
    setRecentEmojis((current) => {
      const next = [value, ...current.filter((item) => item !== value)].slice(0, 8);
      saveRecentEmojis(next);
      return next;
    });
    // Keep the emoji picker open so multiple emoji can be inserted
    // without reopening it after every selection.
  }

  async function reactToMessage(message, emoji) {
    if (!message?.message_id || message.deleted_at) return;
    try {
      const result = await toggleMessageReaction(
        serverUrl,
        token,
        conversation.conversationId,
        message.message_id,
        emoji
      );
      setMessages((current) => current.map((item) =>
        item.message_id === message.message_id
          ? { ...item, reactions: result?.reactions || [] }
          : item
      ));
      closeMessageActions();
    } catch (requestError) {
      const status = Number(requestError?.status || 0);
      Alert.alert(
        'Could not react',
        status === 404
          ? 'This AkshaConnect server has not been upgraded to the V16 reaction API yet. Apply the V16 server update and reaction migration, then retry.'
          : requestError?.message || 'Reaction failed'
      );
    }
  }

  async function showReactionUsers(message) {
    if (!message?.message_id) return;
    try {
      const result = await listMessageReactionUsers(
        serverUrl,
        token,
        conversation.conversationId,
        message.message_id
      );
      const lines = (result?.reactions || []).map((item) =>
        `${item.emoji} ${item.display_name || 'Member'}`
      );
      Alert.alert('Reactions', lines.length ? lines.join('\n') : 'No reactions yet');
    } catch (requestError) {
      Alert.alert('Could not load reactions', requestError?.message || 'Please try again');
    }
  }

  const canSend =
    editingMessage
      ? draft.trim().length > 0 &&
        draft.length <=
          MAX_MESSAGE_CHARS &&
        !sending
      : (draft.trim().length > 0 ||
          pendingAttachments.length >
            0) &&
        draft.length <=
          MAX_MESSAGE_CHARS &&
        !sending &&
        !pickingAttachments;

  const live = realtimeStatus === 'connected';
  const showPeerPresence = conversation.kind === 'dm';
  const normalizedPeerPresence =
    peerPresenceStatus || 'NOT_AVAILABLE';
  const statusLive =
    showPeerPresence
      ? normalizedPeerPresence === 'LIVE'
      : live;
  const statusAway =
    showPeerPresence &&
    normalizedPeerPresence === 'AWAY';
  const effectivePeerPresenceProfile =
    externalPeerPresenceProfile || peerPresenceProfile;
  const peerLastSeenLabel =
    showPeerPresence && normalizedPeerPresence === 'NOT_AVAILABLE'
      ? formatLastSeen(effectivePeerPresenceProfile?.last_seen_at)
      : '';
  const peerCustomStatus =
    String(effectivePeerPresenceProfile?.custom_status || '').trim();
  const peerPresenceText =
    peerLastSeenLabel || presenceLabel(normalizedPeerPresence);
  const customStatus = showPeerPresence ? peerCustomStatus : '';
  const statusLabel =
    showPeerPresence
      ? peerPresenceText
      : realtimeLabel(realtimeStatus);

  return (
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
          title={
            conversation.kind === 'channel'
              ? `# ${conversation.title}`
              : conversation.title
          }
          subtitle={conversation.subtitle}
          onBack={onBack}
          backAccessibilityLabel="Back to conversations"
          statusLabel={statusLabel}
          customStatus={customStatus}
          statusTone={
            statusLive
              ? 'connected'
              : statusAway
                ? 'away'
                : 'offline'
          }
          style={styles.header}
          rightAccessory={(
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search messages"
                onPress={() => {
                  setShowMessageSearch((current) => {
                    const next = !current;
                    if (next) {
                      setShowEmojiPicker(false);
                    }
                    return next;
                  });
                  setMessageSearchError('');
                }}
                style={({ pressed }) => [
                  styles.peopleButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.detailsButtonText}>⌕</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Conversation details"
                onPress={() => setShowConversationDetails(true)}
                style={({ pressed }) => [
                  styles.peopleButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.detailsButtonText}>⋮</Text>
              </Pressable>
            </View>
          )}
        />

        <ConversationSearchBar
          visible={showMessageSearch}
          query={messageSearchQuery}
          onChangeQuery={(value) => {
            setMessageSearchQuery(value);
            setMessageSearchResults([]);
            setMessageSearchIndex(-1);
            setMessageSearchMode('matches');
            setMessageSearchError('');
          }}
          onSubmit={runMessageSearch}
          onClose={() => setShowMessageSearch(false)}
          loading={messageSearchLoading}
          error={messageSearchError}
          results={messageSearchResults}
          currentIndex={messageSearchIndex}
          mode={messageSearchMode}
          onModeChange={changeMessageSearchMode}
          onSelectResult={openSearchResultAt}
          onPrevious={() => navigateMessageSearch(1)}
          onNext={() => navigateMessageSearch(-1)}
        />

        <View
          style={[
            styles.history,
            { backgroundColor: palette.shell },
            showMessageSearch && messageSearchMode === 'matches'
              ? styles.historyHiddenForSearch
              : null,
          ]}
        >
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
              onScrollBeginDrag={() => {
                historyUserInteractedRef.current = true;
                onUserActivity?.();
              }}
              onScroll={(event) => {
                const {
                  contentOffset,
                  contentSize,
                  layoutMeasurement,
                } = event.nativeEvent;

                if (
                  historyUserInteractedRef.current &&
                  contentOffset.y <= 120 &&
                  page.has_more &&
                  !loadingOlderRef.current
                ) {
                  loadOlder();
                }

                const distanceFromBottom =
                  contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height;
                const wasNearBottom =
                  nearBottomRef.current;
                const nowNearBottom =
                  distanceFromBottom < 48;

                nearBottomRef.current =
                  nowNearBottom;
                setShowJumpToLatest(
                  distanceFromBottom > 160
                );

                if (
                  nowNearBottom &&
                  !wasNearBottom
                ) {
                  const latest =
                    messages[
                      messages.length - 1
                    ];

                  if (latest?.message_id) {
                    markMessageRead(
                      latest.message_id
                    );
                  }

                  setNewMessageDividerId(null);
                  setShowJumpToLatest(false);
                }
              }}
              scrollEventThrottle={32}
              maintainVisibleContentPosition={{
                minIndexForVisible: 0,
              }}
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
                // When unread messages exist, the divider's onLayout handler
                // owns the initial position. Never let a generic content-size
                // event override that position by jumping to the newest item.
                if (newMessageDividerId) {
                  return;
                }

                if (
                  messages.length <= 50 &&
                  nearBottomRef.current
                ) {
                  scrollRef.current?.scrollToEnd({
                    animated: false,
                  });
                }
              }}
            >
              {loadingOlder ? (
                <View style={styles.olderMessagesLoading}>
                  <ActivityIndicator
                    size="small"
                    color={colors.accent}
                  />
                  <Text style={styles.olderMessagesLoadingText}>
                    Loading earlier messages…
                  </Text>
                </View>
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
                            onLayout={(event) => {
                              if (
                                initialUnreadPositionedRef.current
                              ) {
                                return;
                              }

                              initialUnreadPositionedRef.current =
                                true;
                              nearBottomRef.current = false;

                              const targetY = Math.max(
                                0,
                                Number(
                                  event.nativeEvent
                                    ?.layout?.y || 0
                                ) - 8
                              );

                              requestAnimationFrame(() => {
                                scrollRef.current?.scrollTo({
                                  y: targetY,
                                  animated: false,
                                });
                              });
                            }}
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
                        <MessageBubble
                          message={message}
                          own={own}
                          system={system}
                          pinned={pinnedMessageIds.has(message.message_id)}
                          saved={savedMessageIds.has(message.message_id)}
                          messageMutationId={
                            messageMutationId
                          }
                          onManageMessage={
                            manageOwnMessage
                          }
                          onReplyInThread={() => {
                            setThreadSearchTargetMessageId('');
                            setThreadParent(message);
                          }}
                          attachmentAction={
                            attachmentAction
                          }
                          expandedAttachmentId={
                            expandedAttachmentId
                          }
                          savedAttachments={
                            savedAttachments
                          }
                          onToggleAttachmentActions={
                            toggleAttachmentActions
                          }
                          onPreviewAttachment={
                            handlePreviewAttachment
                          }
                          onOpenAttachment={
                            handleOpenAttachment
                          }
                          onDownloadAttachment={
                            handleDownloadAttachment
                          }
                          serverUrl={serverUrl}
                          token={token}
                          conversationId={
                            conversation.conversationId
                          }
                          onJumpToMessage={jumpToMessage}
                          onShowReactionUsers={showReactionUsers}
                          onShowReaders={(targetMessage) =>
                            setMessageReadersTarget(targetMessage)
                          }
                        />
                        </View>
                      </React.Fragment>
                    );
                  }
                )
              )}
            </ScrollView>
          )}

          <JumpToLatestButton
            visible={showJumpToLatest}
            onPress={() => {
              scrollToBottom(true);
              const latest = messages[messages.length - 1];
              if (latest?.message_id) {
                markMessageRead(latest.message_id);
              }
              setNewMessageDividerId(null);
            }}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}

        {!showMessageSearch && quoteReplyMessage ? (
          <View style={styles.quoteReplyBanner}>
            <View style={styles.quoteReplyAccent} />
            <View style={styles.quoteReplyBannerCopy}>
              <Text style={styles.quoteReplyBannerTitle}>
                Replying to{' '}
                {quoteReplyMessage.sender_member_id ===
                currentMemberId
                  ? 'your message'
                  : quoteReplyMessage.sender_display_name ||
                    'message'}
              </Text>
              <Text
                style={styles.quoteReplyBannerPreview}
                numberOfLines={2}
              >
                {quoteReplyMessage.deleted_at
                  ? 'Message deleted'
                  : quoteReplyMessage.message_type ===
                      'ATTACHMENT'
                    ? `Attachment: ${
                        quoteReplyMessage.body_text ||
                        'file'
                      }`
                    : quoteReplyMessage.body_text ||
                      ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
              onPress={cancelQuoteReply}
              disabled={sending}
              style={({ pressed }) => [
                styles.quoteReplyCancelButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.quoteReplyCancelText}>
                ×
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!showMessageSearch && editingMessage ? (
          <View style={styles.editingBanner}>
            <View style={styles.editingBannerCopy}>
              <Text style={styles.editingBannerTitle}>
                Editing message
              </Text>
              <Text
                style={styles.editingBannerPreview}
                numberOfLines={1}
              >
                {editingMessage.body_text ||
                  ''}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
              onPress={cancelEditingMessage}
              disabled={sending}
              style={({ pressed }) => [
                styles.editingCancelButton,
                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text style={styles.editingCancelText}>
                ×
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!showMessageSearch && pendingAttachments.length > 0 ? (
          <View style={styles.attachmentTray}>
            <View style={styles.attachmentTrayHeader}>
              <Text style={styles.attachmentTrayTitle}>
                Attachments
              </Text>
              <Text style={styles.attachmentTrayCount}>
                {pendingAttachments.length}{' '}
                {pendingAttachments.length === 1
                  ? 'attachment'
                  : 'attachments'}
              </Text>
            </View>

            {pendingAttachments.map((item) => (
              <View
                key={item.clientMessageId}
                style={styles.pendingAttachment}
              >
                <View
                  style={styles.pendingAttachmentBadge}
                >
                  <Text
                    style={
                      styles.pendingAttachmentBadgeText
                    }
                  >
                    {attachmentBadge(
                      item.contentType
                    )}
                  </Text>
                </View>

                <View
                  style={
                    styles.pendingAttachmentCopy
                  }
                >
                  <Text
                    style={
                      styles.pendingAttachmentName
                    }
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={[
                      styles.pendingAttachmentMeta,
                      item.uploadStatus ===
                      'failed'
                        ? styles.pendingAttachmentMetaFailed
                        : null,
                    ]}
                  >
                    {formatFileSize(item.size)}
                    {item.uploadStatus ===
                    'uploading'
                      ? ` · Uploading ${Math.round(
                          (item.uploadProgress || 0) *
                            100
                        )}%`
                      : item.uploadStatus ===
                          'failed'
                        ? ' · Retry'
                        : ' · Ready'}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    `Remove ${item.name}`
                  }
                  onPress={() =>
                    removePendingAttachment(
                      item.clientMessageId
                    )
                  }
                  disabled={
                    sending ||
                    pickingAttachments
                  }
                  style={({ pressed }) => [
                    styles.removeAttachmentButton,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.removeAttachmentText
                    }
                  >
                    ×
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {!showMessageSearch ? (
          <MentionSuggestions
            visible={Boolean(activeMention)}
            items={mentionSuggestions}
            loading={mentionLoading}
            error={mentionLookupError}
            prefix={activeMention?.prefix || '@'}
            onSelect={selectMentionSuggestion}
          />
        ) : null}

        {!showMessageSearch ? (
          <ConversationEmojiPicker
            visible={showEmojiPicker}
            recentEmojis={recentEmojis}
            allEmojis={COMPOSER_EMOJIS}
            onSelect={insertEmoji}
          />
        ) : null}

        {!showMessageSearch ? (
        <ConversationComposer
          inputRef={composerInputRef}
          value={draft}
          onChangeText={(value) => {
            onUserActivity?.();
            handleDraftChange(value);
          }}
          onFocus={() => {
            onUserActivity?.();
            scrollToBottom(false);
          }}
          placeholder={
            editingMessage
              ? 'Edit message'
              : quoteReplyMessage
                ? 'Reply'
                : 'Message'
          }
          maxLength={MAX_MESSAGE_CHARS}
          editable={!sending}
          onAttach={chooseAttachments}
          attachmentDisabled={
            Boolean(editingMessage) ||
            sending ||
            pickingAttachments ||
            pendingAttachments.length >=
              MAX_PENDING_ATTACHMENTS
          }
          attaching={pickingAttachments}
          onEmojiPress={() =>
            setShowEmojiPicker((current) => !current)
          }
          emojiOpen={showEmojiPicker}
          onSend={submitMessage}
          sendDisabled={!canSend}
          sending={sending}
          sendLabel={editingMessage ? 'Save' : 'Send'}
        />
        ) : null}

        {!showMessageSearch &&
        draft.length >=
        MAX_MESSAGE_CHARS - 500 ? (
          <Text
            style={styles.characterCount}
          >
            {draft.length}/{MAX_MESSAGE_CHARS}
          </Text>
        ) : null}

        <MessageReadersModal
          visible={Boolean(messageReadersTarget)}
          serverUrl={serverUrl}
          token={token}
          conversationId={conversation?.conversationId || ''}
          message={messageReadersTarget}
          refreshEpoch={messageReadersRefreshEpoch}
          onClose={() => setMessageReadersTarget(null)}
        />

        <MessageActionSheet
          visible={Boolean(messageActionTarget)}
          title={
            messageActionTarget?.message?.message_type ===
            'ATTACHMENT'
              ? 'File actions'
              : 'Message actions'
          }
          reactions={QUICK_REACTIONS.map((emoji) => ({
            key: `reaction-${emoji}`,
            emoji,
            selected: Boolean(
              (messageActionTarget?.message?.reactions || []).find(
                (item) =>
                  item.emoji === emoji &&
                  item.reacted_by_me
              )
            ),
            onPress: () =>
              reactToMessage(
                messageActionTarget?.message,
                emoji
              ),
          }))}
          actions={messageActionItems()}
          onClose={closeMessageActions}
        />

        <Modal
          visible={Boolean(forwardMessage)}
          transparent
          animationType="fade"
          onRequestClose={closeForwardMessage}
        >
          <Pressable
            style={styles.forwardOverlay}
            onPress={closeForwardMessage}
          >
            <Pressable
              style={styles.forwardPanel}
              onPress={() => {}}
            >
              <View style={styles.forwardHeader}>
                <View style={styles.forwardHeaderCopy}>
                  <Text style={styles.forwardTitle}>
                    Forward message
                  </Text>
                  <Text style={styles.forwardSubtitle}>
                    Choose a chat or channel
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close forward message"
                  onPress={closeForwardMessage}
                  disabled={Boolean(
                    forwardBusyConversationId
                  )}
                  style={({ pressed }) => [
                    styles.forwardCloseButton,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text style={styles.forwardCloseText}>
                    ×
                  </Text>
                </Pressable>
              </View>

              <TextInput
                value={forwardQuery}
                onChangeText={setForwardQuery}
                placeholder="Search people or channels"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.forwardSearchInput}
              />

              {forwardError ? (
                <Text style={styles.forwardError}>
                  {forwardError}
                </Text>
              ) : null}

              {forwardLoading ? (
                <View style={styles.forwardLoading}>
                  <ActivityIndicator
                    color={colors.primary}
                  />
                  <Text style={styles.forwardLoadingText}>
                    Loading conversations…
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.forwardList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredForwardTargets.length === 0 ? (
                    <Text style={styles.forwardEmpty}>
                      {forwardQuery.trim()
                        ? 'No matching people or channels.'
                        : 'No other conversations are available.'}
                    </Text>
                  ) : (
                    filteredForwardTargets.map((target) => {
                      const busy =
                        forwardBusyConversationId ===
                        target.conversationId;

                      return (
                        <Pressable
                          key={
                            target.conversationId
                          }
                          accessibilityRole="button"
                          disabled={Boolean(
                            forwardBusyConversationId
                          )}
                          onPress={() =>
                            forwardMessageToTarget(
                              target
                            )
                          }
                          style={({ pressed }) => [
                            styles.forwardRow,
                            pressed
                              ? styles.rowPressed
                              : null,
                          ]}
                        >
                          <View
                            style={[
                              styles.forwardAvatar,
                              target.kind === 'channel'
                                ? styles.forwardChannelAvatar
                                : null,
                            ]}
                          >
                            <Text
                              style={
                                styles.forwardAvatarText
                              }
                            >
                              {target.kind === 'channel'
                                ? '#'
                                : String(
                                  target.title || 'M'
                                )
                                  .slice(0, 1)
                                  .toUpperCase()}
                            </Text>
                          </View>
                          <View
                            style={styles.forwardRowCopy}
                          >
                            <Text
                              style={styles.forwardRowTitle}
                              numberOfLines={1}
                            >
                              {target.kind === 'channel'
                                ? `# ${target.title}`
                                : target.title}
                            </Text>
                            <Text
                              style={styles.forwardRowSubtitle}
                              numberOfLines={1}
                            >
                              {target.subtitle}
                            </Text>
                          </View>
                          {busy ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.primary}
                            />
                          ) : (
                            <Text
                              style={styles.forwardAction}
                            >
                              Forward
                            </Text>
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <ConversationDetailsModal
          visible={showConversationDetails}
          onClose={() =>
            setShowConversationDetails(false)
          }
          serverUrl={serverUrl}
          token={token}
          conversation={conversation}
          onPinsChanged={refreshPinnedMessages}
        />

        <Modal
          visible={showChannelPeople}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setShowChannelPeople(false)
          }
        >
          <View
            style={styles.peopleOverlay}
          >
            <View
              style={styles.peoplePanel}
            >
              <View
                style={styles.peopleHeader}
              >
                <View
                  style={styles.peopleHeaderCopy}
                >
                  <Text
                    style={styles.peopleTitle}
                    numberOfLines={1}
                  >
                    {`# ${conversation.title} · People`}
                  </Text>
                  <Text
                    style={styles.peopleSubtitle}
                  >
                    {channelPeople.length}{' '}
                    {channelPeople.length === 1
                      ? 'person'
                      : 'people'}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close channel people"
                  onPress={() =>
                    setShowChannelPeople(false)
                  }
                  style={({ pressed }) => [
                    styles.peopleCloseButton,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={styles.peopleCloseText}
                  >
                    ×
                  </Text>
                </Pressable>
              </View>

              {canManageChannelPeople ? (
                <View
                  style={
                    styles.peopleSearchRow
                  }
                >
                  <TextInput
                    value={channelPeopleSearch}
                    onChangeText={
                      setChannelPeopleSearch
                    }
                    placeholder="Search workspace people"
                    placeholderTextColor={
                      colors.textMuted
                    }
                    style={
                      styles.peopleSearchInput
                    }
                    returnKeyType="search"
                    onSubmitEditing={
                      searchChannelPeople
                    }
                  />

                  <Pressable
                    accessibilityRole="button"
                    onPress={
                      searchChannelPeople
                    }
                    disabled={
                      channelPeopleLoading
                    }
                    style={({ pressed }) => [
                      styles.peopleSearchButton,
                      pressed &&
                      !channelPeopleLoading
                        ? styles.pressed
                        : null,
                    ]}
                  >
                    <Text
                      style={
                        styles.peopleSearchButtonText
                      }
                    >
                      Search
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {channelPeopleError ? (
                <Text
                  style={
                    styles.peopleError
                  }
                >
                  {channelPeopleError}
                </Text>
              ) : null}

              {channelPeopleLoading ? (
                <View
                  style={
                    styles.peopleLoading
                  }
                >
                  <ActivityIndicator
                    color={colors.primary}
                  />
                </View>
              ) : null}

              <ScrollView
                style={styles.peopleList}
                contentContainerStyle={
                  styles.peopleListContent
                }
              >
                {channelPeople.map(
                  (member) => {
                    const busy =
                      channelPeopleBusyMemberId ===
                      member.workspace_member_id;

                    return (
                      <View
                        key={
                          member.workspace_member_id
                        }
                        style={
                          styles.peopleRow
                        }
                      >
                        <View
                          style={
                            styles.peopleAvatar
                          }
                        >
                          <Text
                            style={
                              styles.peopleAvatarText
                            }
                          >
                            {String(
                              member.display_name ||
                                'M'
                            )
                              .trim()
                              .slice(0, 1)
                              .toUpperCase()}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.peopleRowCopy
                          }
                        >
                          <Text
                            style={
                              styles.peopleName
                            }
                            numberOfLines={1}
                          >
                            {member.display_name ||
                              'Member'}
                          </Text>
                          <Text
                            style={
                              styles.peopleMeta
                            }
                            numberOfLines={1}
                          >
                            {member.member_role}
                            {member.primary_email
                              ? ` · ${member.primary_email}`
                              : ''}
                          </Text>
                        </View>

                        {canManageChannelPeople &&
                        member.member_role !==
                          'OWNER' ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${
                              member.display_name ||
                              'member'
                            } from channel`}
                            disabled={busy}
                            onPress={() =>
                              removePersonFromChannel(
                                member
                              )
                            }
                            style={({ pressed }) => [
                              styles.peopleRemoveButton,
                              pressed && !busy
                                ? styles.pressed
                                : null,
                            ]}
                          >
                            <Text
                              style={
                                styles.peopleRemoveText
                              }
                            >
                              {busy
                                ? '…'
                                : 'Remove'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  }
                )}

                {canManageChannelPeople &&
                channelPeopleCandidates.length >
                  0 ? (
                  <>
                    <Text
                      style={
                        styles.peopleSectionTitle
                      }
                    >
                      Add people
                    </Text>

                    {channelPeopleCandidates.map(
                      (member) => {
                        const busy =
                          channelPeopleBusyMemberId ===
                          member.workspace_member_id;

                        return (
                          <View
                            key={
                              member.workspace_member_id
                            }
                            style={
                              styles.peopleRow
                            }
                          >
                            <View
                              style={
                                styles.peopleAvatar
                              }
                            >
                              <Text
                                style={
                                  styles.peopleAvatarText
                                }
                              >
                                {String(
                                  member.display_name ||
                                    'M'
                                )
                                  .trim()
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </Text>
                            </View>

                            <View
                              style={
                                styles.peopleRowCopy
                              }
                            >
                              <Text
                                style={
                                  styles.peopleName
                                }
                                numberOfLines={1}
                              >
                                {member.display_name ||
                                  'Member'}
                              </Text>
                              <Text
                                style={
                                  styles.peopleMeta
                                }
                                numberOfLines={1}
                              >
                                {member.primary_email ||
                                  'Workspace member'}
                              </Text>
                              {member.presence_profile?.custom_status ||
                              member.presence_status ||
                              member.presence_profile?.last_seen_at ? (
                                <Text
                                  style={styles.peopleMeta}
                                  numberOfLines={1}
                                >
                                  {member.presence_profile?.custom_status ||
                                    (member.presence_status === 'LIVE'
                                      ? 'Online'
                                      : member.presence_status === 'AWAY'
                                        ? 'Away'
                                        : formatLastSeen(
                                            member.presence_profile?.last_seen_at
                                          ) || 'Offline')}
                                </Text>
                              ) : null}
                            </View>

                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Add ${
                                member.display_name ||
                                'member'
                              } to channel`}
                              disabled={busy}
                              onPress={() =>
                                addPersonToChannel(
                                  member
                                )
                              }
                              style={({ pressed }) => [
                                styles.peopleAddButton,
                                pressed && !busy
                                  ? styles.pressed
                                  : null,
                              ]}
                            >
                              <Text
                                style={
                                  styles.peopleAddText
                                }
                              >
                                {busy
                                  ? '…'
                                  : 'Add'}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      }
                    )}
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <ThreadModal
          visible={Boolean(threadParent)}
          serverUrl={serverUrl}
          token={token}
          conversationId={conversation?.conversationId || ''}
          parentMessage={threadParent}
          realtimeEvents={realtimeEvents}
          currentMemberId={currentMemberId}
          currentPrimaryEmail={session?.identity?.primary_email || ''}
          initialMessageId={threadSearchTargetMessageId}
          initialUnreadCount={Number(threadParent?.thread_unread_count || 0)}
          pinnedMessageIds={pinnedMessageIds}
          savedMessageIds={savedMessageIds}
          onToggleSavedMessage={toggleSavedMessage}
          onClose={() => {
            setThreadParent(null);
            setThreadSearchTargetMessageId('');
          }}
          onRead={handleThreadRead}
        />

        <ImageViewerModal
          visible={Boolean(previewAttachment)}
          source={
            previewAttachment?.attachment
              ?.attachment_id
              ? {
                  uri:
                    String(
                      serverUrl || ''
                    ).replace(
                      /\/+$/,
                      ''
                    ) +
                    '/api/v1/conversations/' +
                    encodeURIComponent(
                      conversation
                        ?.conversationId ||
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
            formatFileSize(
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
            attachmentAction
              .attachmentId
              ? attachmentAction
                  .mode
              : ''
          }
          reactions={
            QUICK_REACTIONS
          }
          reactionState={
            previewMessageForAttachment()
              ?.reactions ||
            []
          }
          onClose={
            closeAttachmentPreview
          }
          onPrevious={() =>
            openImagePreviewAtIndex(
              Number(
                previewAttachment
                  ?.galleryIndex ||
                0
              ) - 1
            )
          }
          onNext={() =>
            openImagePreviewAtIndex(
              Number(
                previewAttachment
                  ?.galleryIndex ||
                0
              ) + 1
            )
          }
          onForward={
            handleForwardPreviewAttachment
          }
          onDownload={() =>
            handleDownloadAttachment(
              previewAttachment
                ?.attachment
            )
          }
          onShare={
            handleSharePreviewAttachment
          }
          onReact={
            handleReactPreviewAttachment
          }
        />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  own,
  system,
  pinned = false,
  saved = false,
  messageMutationId,
  onManageMessage,
  onReplyInThread,
  attachmentAction,
  expandedAttachmentId,
  savedAttachments,
  onToggleAttachmentActions,
  onPreviewAttachment,
  onOpenAttachment,
  onDownloadAttachment,
  serverUrl,
  token,
  conversationId,
  onJumpToMessage,
  onShowReactionUsers,
  onShowReaders,
}) {
  const { palette } = useAppAppearance();

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

  const manageable =
    own &&
    !deleted &&
    (
      message.message_type === 'TEXT' ||
      message.message_type ===
        'ATTACHMENT'
    );

  const replyable =
    !deleted &&
    !message.reply_to_message_id;

  const mutating =
    messageMutationId ===
    message.message_id;

  const attachmentRows =
    attachment &&
    Array.isArray(message.attachments)
      ? message.attachments
      : [];

  const imageAttachments =
    attachmentRows.filter((item) =>
      attachmentIsImage(item?.content_type)
    );

  const fileAttachments =
    attachmentRows.filter((item) =>
      !attachmentIsImage(item?.content_type)
    );

  const remoteImageSource = (item) => ({
    uri:
      `${String(serverUrl || '').replace(/\/+$/, '')}` +
      `/api/v1/conversations/${encodeURIComponent(
        conversationId || ''
      )}/attachments/${encodeURIComponent(
        item?.attachment_id || ''
      )}/content`,
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : undefined,
  });

  return (
    <Pressable
      disabled={(!manageable && !replyable) || mutating}
      delayLongPress={350}
      onLongPress={() =>
        onManageMessage?.(message, onReplyInThread)
      }
      accessibilityHint={
        manageable || replyable
          ? 'Long press for message actions'
          : undefined
      }
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
          {
            backgroundColor: own ? palette.ownBubble : palette.otherBubble,
            borderColor: own ? palette.ownBubbleBorder : palette.otherBubbleBorder,
          },
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

        {!deleted && message.quoted_message ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to quoted message"
            onPress={() => onJumpToMessage?.(message.quote_message_id)}
            style={[
              styles.quotedMessage,
              own
                ? styles.quotedMessageOwn
                : null,
            ]}
          >
            <View style={styles.quotedMessageAccent} />
            <View style={styles.quotedMessageCopy}>
              <Text
                style={[
                  styles.quotedMessageSender,
                  own
                    ? styles.quotedMessageSenderOwn
                    : null,
                ]}
                numberOfLines={1}
              >
                {message.quoted_message
                  .sender_display_name ||
                  'Message'}
              </Text>
              <Text
                style={[
                  styles.quotedMessageBody,
                  own
                    ? styles.quotedMessageBodyOwn
                    : null,
                ]}
                numberOfLines={2}
              >
                {message.quoted_message.deleted_at
                  ? 'Message deleted'
                  : message.quoted_message
                        .message_type ===
                      'ATTACHMENT'
                    ? `Attachment: ${
                        message.quoted_message
                          .body_text || 'file'
                      }`
                    : message.quoted_message
                        .body_text || ''}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {deleted ? (
          <Text
            style={[
              styles.body,
              own
                ? styles.ownBody
                : null,
              { color: own ? palette.ownMessageText : palette.otherMessageText },
              styles.deletedBody,
            ]}
          >
            Message deleted
          </Text>
        ) : attachment &&
          Array.isArray(message.attachments) &&
          message.attachments.length > 0 ? (
          <View style={styles.messageAttachments}>
            {imageAttachments.length > 0 ? (
              <View
                style={[
                  styles.messageImageGrid,
                  imageAttachments.length === 1
                    ? styles.messageImageGridSingle
                    : null,
                ]}
              >
                {imageAttachments.map((item) => (
                  <Pressable
                    key={item.attachment_id}
                    accessibilityRole="button"
                    accessibilityLabel={
                      `Image ${attachmentFileName(item)}. Tap to preview. Long press for message actions.`
                    }
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onPreviewAttachment?.(item);
                    }}
                    delayLongPress={350}
                    onLongPress={(event) => {
                      event.stopPropagation?.();
                      onManageMessage?.(
                        message,
                        onReplyInThread
                      );
                    }}
                    style={({ pressed }) => [
                      styles.messageImageTile,
                      imageAttachments.length === 1
                        ? styles.messageImageTileSingle
                        : styles.messageImageTileMultiple,
                      pressed
                        ? styles.messageImageTilePressed
                        : null,
                    ]}
                  >
                    <Image
                      source={remoteImageSource(item)}
                      resizeMode="cover"
                      style={styles.messageImageThumbnail}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {fileAttachments.map(
              (item) => {
                const busy =
                  attachmentAction
                    ?.attachmentId ===
                  item.attachment_id;
                const saved = Boolean(
                  savedAttachments?.[
                    item.attachment_id
                  ]
                );

                return (
                  <Pressable
                    key={item.attachment_id}
                    accessibilityRole="button"
                    accessibilityLabel={
                      `Attachment ${attachmentFileName(
                        item
                      )}. Tap for actions.`
                    }
                    onPress={() =>
                      onToggleAttachmentActions?.(
                        item.attachment_id
                      )
                    }
                    delayLongPress={350}
                    onLongPress={() =>
                      onManageMessage?.(
                        message,
                        onReplyInThread
                      )
                    }
                    style={({ pressed }) => [
                      styles.messageAttachmentCard,
                      pressed
                        ? styles.messageAttachmentCardPressed
                        : null,
                    ]}
                  >
                    <View
                      style={
                        styles.messageAttachmentBadge
                      }
                    >
                      <Text
                        style={
                          styles.messageAttachmentBadgeText
                        }
                      >
                        {attachmentBadge(
                          item.content_type
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.messageAttachmentCopy
                      }
                    >
                      <Text
                        style={
                          styles.messageAttachmentName
                        }
                        numberOfLines={2}
                      >
                        {attachmentFileName(
                          item
                        )}
                      </Text>
                      <Text
                        style={
                          styles.messageAttachmentMeta
                        }
                        numberOfLines={1}
                      >
                        {formatFileSize(
                          item.size_bytes
                        )}
                        {' · '}
                        {attachmentContentType(
                          item
                        )}
                      </Text>

                      {expandedAttachmentId ===
                      item.attachment_id ? (
                        <View
                          style={
                            styles.messageAttachmentActions
                          }
                        >
                          {attachmentIsImage(
                            item.content_type
                          ) ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                `Preview ${attachmentFileName(
                                  item
                                )}`
                              }
                              disabled={busy}
                              onPress={(event) => {
                                event.stopPropagation?.();
                                onPreviewAttachment?.(
                                  item
                                );
                              }}
                              style={({ pressed }) => [
                                styles.messageAttachmentIconAction,
                                pressed && !busy
                                  ? styles.pressed
                                  : null,
                              ]}
                            >
                              <Text
                                style={
                                  styles.messageAttachmentIconText
                                }
                              >
                                {busy &&
                                attachmentAction?.mode ===
                                  'preview'
                                  ? '…'
                                  : '👁'}
                              </Text>
                            </Pressable>
                          ) : null}

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              `Open ${attachmentFileName(
                                item
                              )}`
                            }
                            disabled={busy}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              onOpenAttachment?.(
                                item
                              );
                            }}
                            style={({ pressed }) => [
                              styles.messageAttachmentIconAction,
                              pressed && !busy
                                ? styles.pressed
                                : null,
                            ]}
                          >
                            <Text
                              style={
                                styles.messageAttachmentIconText
                              }
                            >
                              {busy &&
                              attachmentAction?.mode ===
                                'open'
                                ? '…'
                                : '↗'}
                            </Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              saved
                                ? `Saved ${attachmentFileName(
                                    item
                                  )} to Downloads`
                                : `Download ${attachmentFileName(
                                    item
                                  )}`
                            }
                            disabled={busy || saved}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              onDownloadAttachment?.(
                                item
                              );
                            }}
                            style={({ pressed }) => [
                              styles.messageAttachmentIconAction,
                              styles.messageAttachmentDownloadAction,
                              pressed && !busy
                                ? styles.pressed
                                : null,
                            ]}
                          >
                            <Text
                              style={
                                styles.messageAttachmentIconText
                              }
                            >
                              {busy &&
                              attachmentAction?.mode ===
                                'download'
                                ? '…'
                                : saved
                                  ? '✓'
                                  : '⇩'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }
            )}
          </View>
        ) : (
          <MentionText
            value={
              attachment
                ? `Attachment: ${message.body_text || 'file'}`
                : message.body_text || ''
            }
            mentions={message.mentions || []}
            style={[
              styles.body,
              own ? styles.ownBody : null,
              { color: own ? palette.ownMessageText : palette.otherMessageText },
            ]}
          />
        )}

        {(pinned || saved) ? (
          <View style={styles.messageFlags}>
            {pinned ? <Text style={styles.messageFlagText}>📌 Pinned</Text> : null}
            {saved ? <Text style={styles.messageFlagText}>🔖 Saved</Text> : null}
          </View>
        ) : null}

        <Text
          style={[
            styles.time,
            own
              ? styles.ownTime
              : null,
            { color: own ? palette.ownTimestamp : palette.timestamp },
          ]}
        >
          {formatMessageTime(
            message.created_at
          )}
        </Text>

        {!deleted &&
        message.edited_at ? (
          <Text
            style={[
              styles.editedMarker,
              own
                ? styles.ownEditedMarker
                : null,
            ]}
          >
            edited
          </Text>
        ) : null}

        {own && !deleted && Number(message.read_by_count || 0) > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Read by ${Number(message.read_by_count || 0)}. Show readers.`}
            onPress={() => onShowReaders?.(message)}
            style={({ pressed }) => [
              styles.readReceiptButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.readReceipt}>
              ✓✓ Read by {Number(message.read_by_count)} ›
            </Text>
          </Pressable>
        ) : null}

        {!deleted && Array.isArray(message.reactions) && message.reactions.length ? (
          <View style={styles.reactionRow}>
            {message.reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                onPress={() => onShowReactionUsers?.(message)}
                style={[
                  styles.reactionChip,
                  reaction.reacted_by_me ? styles.reactionChipMine : null,
                ]}
              >
                <Text style={styles.reactionText}>
                  {reaction.emoji} {Number(reaction.count || 0)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {replyable && Number(message.thread_reply_count || 0) > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open thread"
            onPress={onReplyInThread}
            style={({ pressed }) => [
              styles.threadSummary,
              Number(message.thread_unread_count || 0) > 0 ? styles.threadSummaryUnread : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.threadSummaryText}>
              {Number(message.thread_reply_count)} {Number(message.thread_reply_count) === 1 ? 'reply' : 'replies'}
              {Number(message.thread_unread_count || 0) > 0
                ? ` · ${Number(message.thread_unread_count)} unread`
                : ''}
              {message.thread_last_reply_at
                ? ` · last ${formatMessageTime(message.thread_last_reply_at)}`
                : ''}
            </Text>
          </Pressable>
        ) : null}

        {manageable || replyable ? (
          <Text
            style={[
              styles.longPressHint,
              own
                ? styles.ownLongPressHint
                : null,
            ]}
          >
            {mutating
              ? 'Updating…'
              : 'Long press for actions'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readReceiptButton: {
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  readReceipt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  threadSummary: {
    marginTop: 7,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(49,95,156,0.08)',
  },
  threadSummaryText: {
    color: '#315f9c',
    fontSize: 12,
    fontWeight: '700',
  },
  highlightedMessage: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.brandOrange,
    backgroundColor: '#FFF6E9',
  },
  emojiButton: {
    width: 42, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F4F8FC', borderWidth: 1, borderColor: '#DCE5ED',
  },
  emojiButtonText: { fontSize: 20 },
  emojiPicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E4EBF2',
  },
  emojiChoice: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F4F8FC' },
  emojiChoiceText: { fontSize: 20 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  reactionChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, backgroundColor: '#F0F4F8', borderWidth: 1, borderColor: '#D9E3EC' },
  reactionChipMine: { backgroundColor: '#E6F2FF', borderColor: '#7FB7EE' },
  reactionText: { fontSize: 11, color: '#24415E', fontWeight: '700' },
  threadSummaryUnread: { backgroundColor: 'rgba(8,121,231,0.16)', borderWidth: 1, borderColor: 'rgba(8,121,231,0.28)' },
  searchOverlay: { flex: 1, justifyContent: 'flex-start', paddingTop: 70, paddingHorizontal: 14, backgroundColor: 'rgba(7,19,46,0.55)' },
  searchPanel: { maxHeight: '78%', borderRadius: 18, backgroundColor: '#FFFFFF', padding: 14 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchTitle: { color: '#0E2455', fontSize: 18, fontWeight: '900' },
  searchClose: { color: '#4F6B88', fontSize: 26, paddingHorizontal: 8 },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  searchInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#D3DFEA', borderRadius: 12, paddingHorizontal: 12, color: '#18324A' },
  searchButton: { minWidth: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0879E7' },
  searchButtonText: { color: '#FFFFFF', fontWeight: '900' },
  searchError: { color: '#A22727', marginTop: 8 },
  searchResults: { marginTop: 10 },
  searchResultRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6EDF3' },
  searchResultSender: { color: '#0E2455', fontSize: 12, fontWeight: '900' },
  searchResultBody: { color: '#24415E', marginTop: 3, fontSize: 13, lineHeight: 18 },
  searchResultMeta: { color: '#7890A6', marginTop: 4, fontSize: 10 },
  searchEmpty: { textAlign: 'center', color: '#7890A6', paddingVertical: 18 },
  flex: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  safeAreaContent: {
    flex: 1,
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.22)',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.12)',
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
    backgroundColor: '#0D5B47',
  },
  realtimePillAway: {
    backgroundColor: '#6A4A1F',
  },
  realtimePillOffline: {
    backgroundColor: '#3D4654',
  },
  realtimeDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    marginRight: 4,
  },
  realtimeDotConnected: {
    backgroundColor: colors.brandGreen,
  },
  realtimeDotAway: {
    backgroundColor: colors.orange,
  },
  realtimeDotOffline: {
    backgroundColor: '#94A3B8',
  },
  realtimeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  realtimeTextConnected: {
    color: '#CBFFF3',
  },
  realtimeTextAway: {
    color: '#FFE2BC',
  },
  realtimeTextOffline: {
    color: '#D7E0EA',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peopleButton: {
    width: 40,
    height: 40,
    marginRight: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  peopleButtonText: {
    fontSize: 18,
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '900',
  },
  peopleOverlay: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 38,
    backgroundColor:
      'rgba(5, 18, 44, 0.62)',
    justifyContent: 'center',
  },
  peoplePanel: {
    maxHeight: '88%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  peopleHeader: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.22)',
    backgroundColor: colors.primary,
  },
  peopleHeaderCopy: {
    flex: 1,
    marginRight: 10,
  },
  peopleTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  peopleSubtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
  },
  peopleCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  peopleCloseText: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
  },
  peopleSearchRow: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  peopleSearchInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD9E8',
    borderRadius: 10,
    color: colors.text,
    backgroundColor: '#FBFDFF',
  },
  peopleSearchButton: {
    minHeight: 42,
    marginLeft: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  peopleSearchButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  peopleError: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 9,
    borderRadius: 9,
    color: '#A12A3A',
    backgroundColor: '#FFF0F3',
    fontSize: 11,
  },
  peopleLoading: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  peopleList: {
    flexGrow: 0,
  },
  peopleListContent: {
    padding: 12,
  },
  peopleRow: {
    minHeight: 58,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  peopleAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  peopleAvatarText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  peopleRowCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },
  peopleName: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  peopleMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
  },
  peopleRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FFF0F3',
  },
  peopleRemoveText: {
    color: '#A12A3A',
    fontSize: 10,
    fontWeight: '900',
  },
  peopleAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
  },
  peopleAddText: {
    color: '#117A45',
    fontSize: 10,
    fontWeight: '900',
  },
  peopleSectionTitle: {
    marginTop: 18,
    marginBottom: 6,
    color: colors.navy,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
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
    backgroundColor: colors.brandOrange,
    opacity: 0.55,
  },
  newMessagesText: {
    marginHorizontal: 10,
    color: '#C44E12',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  history: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F6F9FC',
  },
  historyHiddenForSearch: {
    display: 'none',
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
  olderMessagesLoading: {
    alignSelf: 'center',
    minHeight: 36,
    marginBottom: 12,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF5FB',
  },
  olderMessagesLoadingText: {
    marginLeft: 7,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
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
    shadowColor: '#0F2742',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  ownBubble: {
    backgroundColor: '#EAF4FF',
    borderColor: '#C9E1FA',
    borderBottomRightRadius: 5,
    shadowColor: '#0F2742',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  sender: {
    marginBottom: 4,
    color: colors.navy,
    fontSize: 10,
    fontWeight: '900',
  },
  ownSender: {
    color: '#1769AA',
  },
  quotedMessage: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: '#F3F7FA',
    overflow: 'hidden',
  },
  quotedMessageOwn: {
    backgroundColor: '#DDEEFF',
  },
  quotedMessageAccent: {
    width: 3,
    backgroundColor: colors.primary,
  },
  quotedMessageCopy: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  quotedMessageSender: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  quotedMessageSenderOwn: {
    color: '#125D94',
  },
  quotedMessageBody: {
    marginTop: 1,
    color: '#506477',
    fontSize: 11,
    lineHeight: 15,
  },
  quotedMessageBodyOwn: {
    color: '#385A75',
  },
  body: {
    color: '#243B53',
    fontSize: 14,
    lineHeight: 20,
  },
  ownBody: {
    color: '#18324A',
  },
  deletedBody: {
    fontStyle: 'italic',
    opacity: 0.72,
  },
  editedMarker: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 8,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  ownEditedMarker: {
    color: '#D6FFF8',
  },
  longPressHint: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 7,
    textAlign: 'right',
    opacity: 0.78,
  },
  ownLongPressHint: {
    color: '#D6FFF8',
  },
  messageFlags: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 7,
  },
  messageFlagText: {
    color: colors.textSecondary,
    fontSize: 8.5,
    fontWeight: '800',
  },
  time: {
    marginTop: 5,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'right',
  },
  ownTime: {
    color: '#315D82',
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
  messageAttachments: {
    marginTop: 5,
  },
  messageImageGrid: {
    width: 265,
    maxWidth: '100%',
    marginBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    overflow: 'hidden',
    borderRadius: 14,
  },
  messageImageGridSingle: {
    height: 178,
  },
  messageImageTile: {
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#E9F0F6',
  },
  messageImageTileSingle: {
    width: '100%',
    height: 178,
  },
  messageImageTileMultiple: {
    width: 130,
    height: 112,
  },
  messageImageTilePressed: {
    opacity: 0.82,
  },
  messageImageThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E9F0F6',
  },
  messageAttachmentCard: {
    width: 265,
    maxWidth: '100%',
    padding: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7E3EE',
  },
  messageAttachmentBadge: {
    width: 44,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F3FE',
  },
  messageAttachmentBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  messageAttachmentCardPressed: {
    opacity: 0.92,
  },
  messageAttachmentCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  messageAttachmentName: {
    color: colors.navy,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  messageAttachmentMeta: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 8,
  },
  messageAttachmentActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageAttachmentIconAction: {
    width: 36,
    height: 34,
    marginRight: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF6FF',
  },
  messageAttachmentDownloadAction: {
    backgroundColor: '#EAF8F2',
  },
  messageAttachmentIconText: {
    color: colors.navy,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
  },
  forwardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 19, 46, 0.48)',
  },
  forwardPanel: {
    maxHeight: '78%',
    padding: 18,
    paddingBottom: 26,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  forwardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  forwardHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  forwardTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  forwardSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  forwardCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF5FB',
  },
  forwardCloseText: {
    color: colors.navy,
    fontSize: 25,
    lineHeight: 27,
  },
  forwardSearchInput: {
    height: 44,
    marginTop: 12,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    color: colors.navy,
    fontSize: 13,
  },
  forwardError: {
    marginBottom: 10,
    color: '#B42318',
    fontSize: 12,
    fontWeight: '700',
  },
  forwardLoading: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardLoadingText: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
  },
  forwardList: {
    maxHeight: 470,
  },
  forwardEmpty: {
    paddingVertical: 28,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  forwardRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  forwardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  forwardChannelAvatar: {
    backgroundColor: colors.primary,
  },
  forwardAvatarText: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '900',
  },
  forwardRowCopy: {
    flex: 1,
    marginLeft: 11,
  },
  forwardRowTitle: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  forwardRowSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  forwardAction: {
    marginLeft: 9,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  previewImageStage: {
    position: 'relative',
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNavButton: {
    position: 'absolute',
    zIndex: 3,
    top: '45%',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 36, 85, 0.72)',
  },
  previewNavPrevious: {
    left: 8,
  },
  previewNavNext: {
    right: 8,
  },
  previewNavText: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '700',
  },
  previewOverlay: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 18, 42, 0.86)',
  },
  previewPanel: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '92%',
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  previewHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '900',
  },
  previewMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 9,
  },
  previewCloseButton: {
    width: 38,
    height: 38,
    marginLeft: 10,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FA',
  },
  previewCloseText: {
    marginTop: -2,
    color: colors.navy,
    fontSize: 25,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 520,
    maxHeight: '82%',
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  quoteReplyBanner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CFE0F1',
    borderRadius: 12,
    backgroundColor: '#F7FBFF',
    overflow: 'hidden',
  },
  quoteReplyAccent: {
    width: 4,
    backgroundColor: colors.primary,
  },
  quoteReplyBannerCopy: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quoteReplyBannerTitle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  quoteReplyBannerPreview: {
    marginTop: 2,
    color: '#526779',
    fontSize: 12,
    lineHeight: 16,
  },
  quoteReplyCancelButton: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteReplyCancelText: {
    color: '#65798A',
    fontSize: 24,
    lineHeight: 28,
  },
  editingBanner: {
    marginHorizontal: 10,
    marginBottom: 6,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B8D5F4',
    backgroundColor: '#EEF6FF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  editingBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  editingBannerTitle: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  editingBannerPreview: {
    marginTop: 2,
    color: colors.navy,
    fontSize: 11,
  },
  editingCancelButton: {
    width: 34,
    height: 34,
    marginLeft: 10,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  editingCancelText: {
    marginTop: -2,
    color: colors.navy,
    fontSize: 22,
    fontWeight: '700',
  },
  attachmentTray: {
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5E2ED',
    backgroundColor: '#F7FBFF',
  },
  attachmentTrayHeader: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachmentTrayTitle: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: '900',
  },
  attachmentTrayCount: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  pendingAttachment: {
    minHeight: 48,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DFE8F0',
    backgroundColor: '#FFFFFF',
  },
  pendingAttachmentBadge: {
    width: 38,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F3FE',
  },
  pendingAttachmentBadgeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
  },
  pendingAttachmentCopy: {
    flex: 1,
    marginHorizontal: 9,
  },
  pendingAttachmentName: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: '800',
  },
  pendingAttachmentMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 9,
  },
  pendingAttachmentMetaFailed: {
    color: '#A23B43',
    fontWeight: '800',
  },
  removeAttachmentButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F1',
  },
  removeAttachmentText: {
    marginTop: -2,
    color: colors.danger,
    fontSize: 22,
    fontWeight: '700',
  },
  composer: {
    minHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D2DDE7',
    backgroundColor: '#FFFFFF',
  },
  attachButton: {
    width: 42,
    height: 42,
    marginRight: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C9DCEF',
    backgroundColor: '#EDF6FF',
  },
  attachButtonDisabled: {
    opacity: 0.38,
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
    minHeight: 42,
    maxHeight: 120,
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    paddingLeft: 13,
    paddingRight: 42,
    paddingTop: 9,
    paddingBottom: 9,
    color: colors.navy,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  inlineEmojiButton: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineEmojiButtonText: {
    fontSize: 19,
  },
  sendButton: {
    minWidth: 54,
    height: 42,
    marginLeft: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
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
