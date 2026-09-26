import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  listMessages,
  markRead,
  sendMessage,
  uploadAttachment,
} from '../api/client';
import { colors } from '../theme/colors';

const MAX_MESSAGE_CHARS = 8000;
const MAX_PENDING_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
  if (status === 'LIVE') return 'Live';
  if (status === 'AWAY') return 'Away';
  return 'Not available';
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

export default function ConversationScreen({
  session,
  serverUrl,
  conversation,
  realtimeStatus,
  realtimeEvents,
  reconcileEpoch,
  peerPresenceStatus,
  onConversationRead,
  onUserActivity,
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
    messageMutationId,
    setMessageMutationId,
  ] = useState('');
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

        if (initialUnreadCount !== null) {
          setNewMessageDividerId(
            findUnreadDivider(
              latestRows,
              initialUnreadCount,
              currentMemberId
            )
          );
        }

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
    setDraft('');
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
    setMessageMutationId('');
    setError('');
    setNewMessageDividerId(null);

    arrivalDividerReadyRef.current = false;
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
        setDraft('');
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
    editingMessage?.message_id,
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

  async function chooseAttachments() {
    if (sending || pickingAttachments) return;

    const availableSlots =
      MAX_PENDING_ATTACHMENTS -
      pendingAttachments.length;

    if (availableSlots <= 0) {
      setError(
        `You can attach up to ${MAX_PENDING_ATTACHMENTS} files.`
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
          `You can attach up to ${MAX_PENDING_ATTACHMENTS} files.`
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

  async function handlePreviewAttachment(
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

      if (
        attachmentIsImage(
          downloaded.contentType
        )
      ) {
        setPreviewAttachment({
          ...downloaded,
          attachment,
        });
        return;
      }

      if (Platform.OS === 'android') {
        // Do not wrap this in Android's chooser intent. In this app context
        // the chooser path can lose FLAG_ACTIVITY_NEW_TASK and fail to open
        // PDFs/documents. actionViewIntent itself grants read access.
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

  async function handleOpenDownloadsLocation() {
    if (Platform.OS !== 'android') {
      return;
    }

    setError('');

    try {
      await Linking.sendIntent(
        'android.intent.action.VIEW_DOWNLOADS'
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not open Downloads'
      );
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

    setEditingMessage(message);
    setDraft(
      String(message.body_text || '')
    );
    setError('');
    scrollToBottom(false);
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
    setDraft('');
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

  function manageOwnMessage(
    message
  ) {
    if (
      !message ||
      message.deleted_at
    ) {
      return;
    }

    const actions = [];

    if (
      message.message_type === 'TEXT'
    ) {
      actions.push({
        text: 'Edit',
        onPress: () =>
          beginEditMessage(message),
      });
    }

    if (
      message.message_type === 'TEXT' ||
      message.message_type ===
        'ATTACHMENT'
    ) {
      actions.push({
        text:
          message.message_type ===
            'ATTACHMENT'
            ? 'Delete file'
            : 'Delete message',
        style: 'destructive',
        onPress: () => {
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

    actions.push({
      text: 'Cancel',
      style: 'cancel',
    });

    Alert.alert(
      'Message actions',
      message.message_type ===
        'ATTACHMENT'
        ? 'File options'
        : 'Choose an action',
      actions
    );
  }

  async function submitMessage() {
    const bodyText = draft.trim();
    const attachmentsToSend =
      pendingAttachments.map((item) => ({
        ...item,
      }));

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
            bodyText
          );

        if (result?.message) {
          applyMessageMutation(
            result.message
          );
        }

        setEditingMessage(null);
        setDraft('');
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
        } else {
          await loadLatest({ refresh: true });
        }

        // Clear only after durable acknowledgement so an attachment retry
        // cannot resend already acknowledged text.
        setDraft('');
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
  const statusLabel =
    showPeerPresence
      ? presenceLabel(normalizedPeerPresence)
      : realtimeLabel(realtimeStatus);

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
                  statusLive
                    ? styles.realtimePillConnected
                    : statusAway
                      ? styles.realtimePillAway
                      : styles.realtimePillOffline,
                ]}
              >
                <View
                  style={[
                    styles.realtimeDot,
                    statusLive
                      ? styles.realtimeDotConnected
                      : statusAway
                        ? styles.realtimeDotAway
                        : styles.realtimeDotOffline,
                  ]}
                />
                <Text
                  style={[
                    styles.realtimeText,
                    statusLive
                      ? styles.realtimeTextConnected
                      : statusAway
                        ? styles.realtimeTextAway
                        : styles.realtimeTextOffline,
                  ]}
                >
                  {statusLabel}
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
              onScrollBeginDrag={onUserActivity}
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
                          messageMutationId={
                            messageMutationId
                          }
                          onManageMessage={
                            manageOwnMessage
                          }
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
                          onOpenDownloadsLocation={
                            handleOpenDownloadsLocation
                          }
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

        {editingMessage ? (
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

        {pendingAttachments.length > 0 ? (
          <View style={styles.attachmentTray}>
            <View style={styles.attachmentTrayHeader}>
              <Text style={styles.attachmentTrayTitle}>
                Attachments
              </Text>
              <Text style={styles.attachmentTrayCount}>
                {pendingAttachments.length}/
                {MAX_PENDING_ATTACHMENTS}
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

        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach files"
            onPress={chooseAttachments}
            disabled={
              Boolean(editingMessage) ||
              sending ||
              pickingAttachments ||
              pendingAttachments.length >=
                MAX_PENDING_ATTACHMENTS
            }
            style={({ pressed }) => [
              styles.attachButton,
              pendingAttachments.length >=
              MAX_PENDING_ATTACHMENTS
                ? styles.attachButtonDisabled
                : null,
              pressed &&
              !sending &&
              !pickingAttachments
                ? styles.pressed
                : null,
            ]}
          >
            {pickingAttachments ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
              />
            ) : (
              <Text
                style={styles.attachButtonIcon}
              >
                ＋
              </Text>
            )}
          </Pressable>

          <TextInput
            value={draft}
            onChangeText={(value) => {
              onUserActivity?.();
              setDraft(value);
            }}
            onFocus={() => {
              onUserActivity?.();
              scrollToBottom(false);
            }}
            placeholder={
              editingMessage
                ? 'Edit message'
                : 'Message'
            }
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
            ) : editingMessage ? (
              <Text style={styles.sendText}>
                Save
              </Text>
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

        <Modal
          visible={Boolean(previewAttachment)}
          transparent
          animationType="fade"
          onRequestClose={
            closeAttachmentPreview
          }
        >
          <View style={styles.previewOverlay}>
            <View style={styles.previewPanel}>
              <View style={styles.previewHeader}>
                <View style={styles.previewHeaderCopy}>
                  <Text
                    style={styles.previewTitle}
                    numberOfLines={1}
                  >
                    {previewAttachment?.fileName ||
                      'Attachment'}
                  </Text>
                  <Text
                    style={styles.previewMeta}
                  >
                    {previewAttachment?.contentType ||
                      ''}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close attachment preview"
                  onPress={
                    closeAttachmentPreview
                  }
                  style={({ pressed }) => [
                    styles.previewCloseButton,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.previewCloseText
                    }
                  >
                    ×
                  </Text>
                </Pressable>
              </View>

              {previewAttachment?.localPath ? (
                <Image
                  resizeMode="contain"
                  style={styles.previewImage}
                  source={{
                    uri: attachmentFileUri(
                      previewAttachment.localPath
                    ),
                  }}
                />
              ) : null}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  own,
  system,
  messageMutationId,
  onManageMessage,
  attachmentAction,
  expandedAttachmentId,
  savedAttachments,
  onToggleAttachmentActions,
  onPreviewAttachment,
  onOpenAttachment,
  onDownloadAttachment,
  onOpenDownloadsLocation,
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

  const manageable =
    own &&
    !deleted &&
    (
      message.message_type === 'TEXT' ||
      message.message_type ===
        'ATTACHMENT'
    );

  const mutating =
    messageMutationId ===
    message.message_id;

  return (
    <Pressable
      disabled={!manageable || mutating}
      delayLongPress={350}
      onLongPress={() =>
        onManageMessage?.(message)
      }
      accessibilityHint={
        manageable
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

        {deleted ? (
          <Text
            style={[
              styles.body,
              own
                ? styles.ownBody
                : null,
              styles.deletedBody,
            ]}
          >
            Message deleted
          </Text>
        ) : attachment &&
          Array.isArray(message.attachments) &&
          message.attachments.length > 0 ? (
          <View style={styles.messageAttachments}>
            {message.attachments.map(
              (item) => {
                const busy =
                  attachmentAction
                    ?.attachmentId ===
                  item.attachment_id;

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
                              `Download ${attachmentFileName(
                                item
                              )}`
                            }
                            disabled={busy}
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
                                : '⇩'}
                            </Text>
                          </Pressable>

                          {Platform.OS ===
                            'android' &&
                          savedAttachments?.[
                            item.attachment_id
                          ] ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Open Downloads location"
                              onPress={(event) => {
                                event.stopPropagation?.();
                                onOpenDownloadsLocation?.();
                              }}
                              style={({ pressed }) => [
                                styles.messageAttachmentIconAction,
                                styles.messageAttachmentFolderAction,
                                pressed
                                  ? styles.pressed
                                  : null,
                              ]}
                            >
                              <Text
                                style={
                                  styles.messageAttachmentIconText
                                }
                              >
                                📂
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              }
            )}
          </View>
        ) : (
          <Text
            style={[
              styles.body,
              own
                ? styles.ownBody
                : null,
            ]}
          >
            {attachment
              ? `Attachment: ${
                  message.body_text ||
                  'file'
                }`
              : message.body_text || ''}
          </Text>
        )}

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

        {manageable ? (
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
    borderBottomColor: colors.primary,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#173A72',
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
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#173A72',
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
  messageAttachments: {
    marginTop: 5,
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
  messageAttachmentFolderAction: {
    backgroundColor: '#FFF4E8',
  },
  messageAttachmentIconText: {
    color: colors.navy,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
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
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D2DDE7',
    backgroundColor: '#FFFFFF',
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
