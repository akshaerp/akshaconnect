import notifee, {
  AndroidDefaults,
  AndroidImportance,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';

const MESSAGE_CHANNEL_ID = 'akshaconnect-messages-v1';
const CONVERSATION_NOTIFICATION_PREFIX = 'conversation-';
const CONVERSATION_NOTIFICATION_TAG_PREFIX = 'akshaconnect-conversation-';

function cleanConversationId(value) {
  return String(value || '').trim();
}

function conversationNotificationId(conversationId) {
  const cleanId = cleanConversationId(conversationId);
  return cleanId ? `${CONVERSATION_NOTIFICATION_PREFIX}${cleanId}` : '';
}

function conversationNotificationTag(conversationId) {
  const cleanId = cleanConversationId(conversationId);
  return cleanId ? `${CONVERSATION_NOTIFICATION_TAG_PREFIX}${cleanId}` : '';
}

function notificationPreview(message) {
  const body = String(message?.body_text || '').trim();
  if (body) return body;
  if (message?.message_type === 'ATTACHMENT') return 'Sent an attachment';
  return 'New message';
}

function notificationTitle(message, selection) {
  const sender =
    message?.sender_display_name ||
    (message?.sender_type === 'SYSTEM' ? 'System' : 'New message');

  if (selection?.kind === 'channel' && selection?.title) {
    return `${sender} in #${selection.title}`;
  }

  return sender;
}

function selectionFromData(data) {
  if (!data?.conversationId) return null;

  return {
    kind: data.kind === 'channel' ? 'channel' : 'dm',
    conversationId: data.conversationId,
    title: data.title || 'Conversation',
    subtitle: data.subtitle || 'AkshaConnect message',
  };
}

export async function prepareNativeNotifications() {
  const settings = await notifee.requestPermission();

  if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
    return false;
  }

  await notifee.createChannel({
    id: MESSAGE_CHANNEL_ID,
    name: 'Messages',
    description: 'AkshaConnect direct message and channel alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    lights: true,
  });

  return true;
}

export async function displayNativeMessageNotification({
  message,
  selection,
}) {
  if (!message?.message_id || !selection?.conversationId) return false;

  const allowed = await prepareNativeNotifications();
  if (!allowed) return false;

  await notifee.displayNotification({
    id: conversationNotificationId(selection.conversationId),
    title: notificationTitle(message, selection),
    body: notificationPreview(message),
    data: {
      conversationId: String(selection.conversationId),
      kind: String(selection.kind || 'dm'),
      title: String(selection.title || 'Conversation'),
      subtitle: String(selection.subtitle || 'AkshaConnect message'),
    },
    android: {
      channelId: MESSAGE_CHANNEL_ID,
      smallIcon: 'ic_notification',
      pressAction: {
        id: 'default',
      },
      autoCancel: true,
      showTimestamp: true,
      sound: 'default',
      defaults: [AndroidDefaults.SOUND, AndroidDefaults.VIBRATE],
    },
  });

  return true;
}

export async function clearConversationNotifications(conversationId) {
  const cleanId = cleanConversationId(conversationId);
  if (!cleanId) return 0;

  const expectedId = conversationNotificationId(cleanId);
  const expectedTag = conversationNotificationTag(cleanId);
  const displayed = await notifee.getDisplayedNotifications();

  const matchingIds = [
    ...new Set(
      (displayed || [])
        .filter((entry) => {
          const notification = entry?.notification || {};
          const dataConversationId = cleanConversationId(
            notification?.data?.conversationId ||
            notification?.data?.conversation_id
          );
          const androidTag = String(notification?.android?.tag || '').trim();

          return (
            dataConversationId === cleanId ||
            androidTag === expectedTag ||
            notification?.id === expectedId
          );
        })
        .map((entry) => String(entry?.notification?.id || '').trim())
        .filter(Boolean)
    ),
  ];

  if (matchingIds.length > 0) {
    await notifee.cancelDisplayedNotifications(matchingIds);
  }

  return matchingIds.length;
}

export function subscribeToNativeNotificationPress(onOpen) {
  if (typeof onOpen !== 'function') return () => {};

  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type !== EventType.PRESS) return;

    const selection = selectionFromData(detail?.notification?.data);
    if (selection) onOpen(selection);
  });
}

export async function consumeInitialNativeNotification() {
  const initial = await notifee.getInitialNotification();
  return selectionFromData(initial?.notification?.data);
}
