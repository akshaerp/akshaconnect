import {
  getInitialNotification,
  getMessaging,
  getToken,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';

function normalizeRemoteSelection(message) {
  const data = message?.data || {};

  const conversationId =
    String(
      data.conversationId ||
      data.conversation_id ||
      ''
    ).trim();

  if (!conversationId) {
    return null;
  }

  return {
    conversationId,
    kind:
      String(data.kind || '').toLowerCase() ===
      'channel'
        ? 'channel'
        : 'dm',
  };
}

export async function getFirebasePushToken() {
  const instance = getMessaging();

  await registerDeviceForRemoteMessages(
    instance
  );

  const token =
    String(
      await getToken(instance)
    ).trim();

  return token || null;
}

export function subscribeToFirebaseTokenRefresh(
  onToken
) {
  if (typeof onToken !== 'function') {
    return () => {};
  }

  const instance = getMessaging();

  return onTokenRefresh(
    instance,
    (token) => {
      const clean =
        String(token || '').trim();

      if (clean) {
        onToken(clean);
      }
    }
  );
}

export function subscribeToFirebaseNotificationPress(
  onOpen
) {
  if (typeof onOpen !== 'function') {
    return () => {};
  }

  const instance = getMessaging();

  return onNotificationOpenedApp(
    instance,
    (message) => {
      const selection =
        normalizeRemoteSelection(message);

      if (selection) {
        onOpen(selection);
      }
    }
  );
}

export async function consumeInitialFirebaseNotification() {
  const instance = getMessaging();

  const message =
    await getInitialNotification(
      instance
    );

  return normalizeRemoteSelection(
    message
  );
}