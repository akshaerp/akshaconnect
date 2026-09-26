import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  BackHandler,
  Image,
  Linking,
  Modal,
  NativeModules,
  DeviceEventEmitter,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  createChannel,
  discoverMobileOrganizations,
  exchangeMobileAuthorization,
  listChannels,
  listDirectMessages,
  listUnreadCounts,
  listWorkspaceMembers,
  logout,
  logoutMobile,
  refreshMobile,
  registerPush,
  startAkshaErpMobileAuth,
  startDirectMessage,
  switchWorkspace,
  unregisterPush,
} from './src/api/client';

import {
  loadDeviceAccounts,
  removeDeviceAccount,
  saveDeviceAccount,
  setActiveDeviceAccount,
} from './src/auth/deviceSession.js';
import {
  clearPendingMobileAuth,
  loadPendingMobileAuth,
  savePendingMobileAuth,
} from './src/auth/pendingMobileAuth.js';
import {
  createRealtimeClient,
  PRESENCE_ACTIVE,
  PRESENCE_AWAY,
} from './src/realtime/client.js';
import {
  clearConversationNotifications,
  consumeInitialNativeNotification,
  displayNativeMessageNotification,
  prepareNativeNotifications,
  subscribeToNativeNotificationPress,
} from './src/notifications/nativeNotifications.js';
import {
  consumeInitialFirebaseNotification,
  getFirebasePushToken,
  subscribeToFirebaseNotificationPress,
  subscribeToFirebaseTokenRefresh,
} from './src/notifications/firebasePush.js';
import ConversationScreen from './src/screens/ConversationScreen.jsx';
import HomeScreen from './src/screens/HomeScreen.jsx';
import LoginScreen from './src/screens/LoginScreen.jsx';
import SessionRestoreScreen from './src/screens/SessionRestoreScreen.jsx';

const brandMark = require('./src/assets/brand/akshaconnect-mark.png');
const brandWordmark = require('./src/assets/brand/akshaconnect-wordmark.png');

const DEFAULT_SERVER_URL = __DEV__
  ? 'http://10.0.2.2:4100'
  : 'https://connect.akshaerp.com';

const MOBILE_REDIRECT_URI = 'akshaconnect://auth/callback';
const DEVICE_PLATFORM = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
const DEVICE_LABEL = Platform.OS === 'ios'
  ? 'AkshaConnect iPhone'
  : 'AkshaConnect Android';
const PRESENCE_IDLE_MS = 5 * 60 * 1000;
const APP_BACKGROUND_GRACE_MS = 2000;

function normalizeUnreadCounts(payload) {
  const next = {};
  for (const item of payload?.unread_counts || []) {
    if (!item?.conversation_id) continue;
    next[item.conversation_id] = Number(item.unread_count || 0);
  }
  return next;
}

function normalizePresenceMembers(members = []) {
  const next = {};

  for (const member of members || []) {
    const memberId = clean(member?.workspace_member_id);
    if (!memberId) continue;
    next[memberId] =
      clean(member?.status).toUpperCase() ||
      'NOT_AVAILABLE';
  }

  return next;
}

function peerPresenceStatus(selection, presenceByMember) {
  if (selection?.kind !== 'dm') return null;

  const memberId = clean(
    selection?.otherWorkspaceMemberId
  );

  return memberId
    ? presenceByMember?.[memberId] || 'NOT_AVAILABLE'
    : 'NOT_AVAILABLE';
}

function navigationSelection(conversationId, channels, directMessages) {
  const channel = (channels || []).find(
    (item) => item.conversation_id === conversationId
  );

  if (channel) {
    return {
      kind: 'channel',
      conversationId,
      title: channel.channel_name || 'Channel',
      subtitle: channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
    };
  }

  const dm = (directMessages || []).find(
    (item) => item.conversation_id === conversationId
  );

  if (dm) {
    return {
      kind: 'dm',
      conversationId,
      title: dm.other_display_name || 'Member',
      subtitle: dm.other_primary_email || 'Direct message',
      otherWorkspaceMemberId:
        dm.other_workspace_member_id || '',
    };
  }

  return {
    kind: 'dm',
    conversationId,
    title: 'Conversation',
    subtitle: 'AkshaConnect message',
  };
}

function notificationPreview(message) {
  const body = String(message?.body_text || '').trim();
  if (body) return body;
  if (message?.message_type === 'ATTACHMENT') return 'Sent an attachment';
  return 'New message';
}

function isInvalidDeviceSession(error) {
  return (
    Number(error?.status) === 401 ||
    error?.code === 'MOBILE_DEVICE_SESSION_INVALID' ||
    error?.code === 'MOBILE_DEVICE_TOKEN_REQUIRED'
  );
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function decodeQueryComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch {
    return '';
  }
}

function parseMobileAuthCallback(value) {
  const callbackUrl = clean(value);
  const match = /^akshaconnect:\/\/auth\/callback(?:\?([^#]*))?(?:#.*)?$/i.exec(callbackUrl);
  if (!match) return null;

  const params = {};
  for (const pair of String(match[1] || '').split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
    const rawValue = separator >= 0 ? pair.slice(separator + 1) : '';
    const key = decodeQueryComponent(rawKey);
    if (!key) continue;
    params[key] = decodeQueryComponent(rawValue);
  }

  return {
    requestId: clean(params.request_id),
    code: clean(params.code),
    state: clean(params.state),
  };
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [accountRegistry, setAccountRegistry] = useState({
    version: 2,
    activeAccountId: null,
    accounts: [],
  });
  const [deviceCredential, setDeviceCredential] = useState(null);
  const [session, setSession] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notificationToast, setNotificationToast] = useState(null);
  const [pendingPushConversationId, setPendingPushConversationId] = useState('');
  const [appState, setAppState] = useState(AppState.currentState);
  const [stableAppActive, setStableAppActive] = useState(
    AppState.currentState === 'active'
  );
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [presenceByMember, setPresenceByMember] = useState({});
  const [realtimeEvents, setRealtimeEvents] = useState([]);
  const [reconcileEpoch, setReconcileEpoch] = useState(0);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [addingOrganization, setAddingOrganization] = useState(false);

  const [discoveryEmail, setDiscoveryEmail] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const realtimeSequenceRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const realtimeClientRef = useRef(null);
  const presenceStateRef = useRef(PRESENCE_ACTIVE);
  const presenceIdleTimerRef = useRef(null);
  const appBackgroundTimerRef = useRef(null);
  const sessionRef = useRef(session);
  const selectedConversationRef = useRef(selectedConversation);
  const channelsRef = useRef(channels);
  const directMessagesRef = useRef(directMessages);
  const appStateRef = useRef(appState);
  const unreadCountsRef = useRef(unreadCounts);
  const pendingMobileAuthRef = useRef(null);
  const processingMobileAuthCallbackUrlRef = useRef('');
  const completedMobileAuthCallbackUrlRef = useRef('');

  const accounts = accountRegistry.accounts || [];

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 950);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { selectedConversationRef.current = selectedConversation; }, [selectedConversation]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { directMessagesRef.current = directMessages; }, [directMessages]);
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { unreadCountsRef.current = unreadCounts; }, [unreadCounts]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState === 'active') {
      if (appBackgroundTimerRef.current) {
        clearTimeout(appBackgroundTimerRef.current);
        appBackgroundTimerRef.current = null;
      }
      setStableAppActive(true);
      return undefined;
    }

    if (appBackgroundTimerRef.current) {
      clearTimeout(appBackgroundTimerRef.current);
    }

    if (Platform.OS !== 'android') {
      setStableAppActive(false);
      return undefined;
    }

    // Some Android builds emit very short background/active transitions while
    // the Activity remains visually foregrounded. Do not tear down realtime for
    // those transient lifecycle events; genuine backgrounding still settles to
    // offline after the grace period.
    appBackgroundTimerRef.current = setTimeout(() => {
      appBackgroundTimerRef.current = null;
      if (appStateRef.current !== 'active') {
        setStableAppActive(false);
      }
    }, APP_BACKGROUND_GRACE_MS);

    return undefined;
  }, [appState]);

  useEffect(
    () => () => {
      if (appBackgroundTimerRef.current) {
        clearTimeout(appBackgroundTimerRef.current);
        appBackgroundTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedConversation) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedConversation(null);
      setNotificationToast(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedConversation]);

  useEffect(() => {
    if (!notificationToast) return undefined;
    const timer = setTimeout(() => setNotificationToast(null), 4500);
    return () => clearTimeout(timer);
  }, [notificationToast]);

  useEffect(() => {
    if (!session) return undefined;
    prepareNativeNotifications().catch(() => {});
    return undefined;
  }, [session]);

  const clearAuthenticatedState = useCallback(() => {
    setSession(null);
    setServerUrl('');
    setDeviceCredential(null);
    setChannels([]);
    setDirectMessages([]);
    setSelectedConversation(null);
    setUnreadCounts({});
    setNotificationToast(null);
    setRealtimeStatus('disconnected');
    setPresenceByMember({});
    setRealtimeEvents([]);
    setReconcileEpoch(0);
    hasConnectedRef.current = false;
    realtimeSequenceRef.current = 0;
  }, []);

  const loadWorkspacePayload = useCallback(async (activeServer, accessToken) => {
    const [channelPayload, dmPayload, unreadPayload] = await Promise.all([
      listChannels(activeServer, accessToken),
      listDirectMessages(activeServer, accessToken),
      listUnreadCounts(activeServer, accessToken),
    ]);

    return {
      channelPayload,
      dmPayload,
      unreadPayload,
    };
  }, []);

  const applySession = useCallback((credential, accessSession, payloads) => {
    setDeviceCredential(credential);
    setServerUrl(credential.serverUrl);
    setSession(accessSession);
    setChannels(payloads.channelPayload.channels || []);
    setDirectMessages(payloads.dmPayload.direct_messages || []);
    setUnreadCounts(normalizeUnreadCounts(payloads.unreadPayload));
    setSelectedConversation(null);
    setNotificationToast(null);
    setRestoreError('');
    setAddingOrganization(false);
    setShowAccountSwitcher(false);
    hasConnectedRef.current = false;
    realtimeSequenceRef.current = 0;
    setRealtimeStatus('disconnected');
    setPresenceByMember({});
    setRealtimeEvents([]);
    setReconcileEpoch(0);
  }, []);

  const refreshAccountRegistry = useCallback(async () => {
    const registry = await loadDeviceAccounts();
    setAccountRegistry(registry);
    return registry;
  }, []);

  const activateAccount = useCallback(async (credential, { persistActive = true } = {}) => {
    if (!credential?.serverUrl || !credential?.deviceToken) {
      throw new Error('Saved AkshaConnect account is incomplete');
    }

    setLoadingWorkspace(true);
    try {
      const refreshed = await refreshMobile(
        credential.serverUrl,
        credential.deviceToken
      );
      let accessSession = { ...refreshed };
      delete accessSession.device_token;

      if (
        credential.workspaceId &&
        credential.workspaceId !== accessSession?.workspace?.workspace_id
      ) {
        const switched = await switchWorkspace(
          credential.serverUrl,
          accessSession.access_token,
          credential.workspaceId
        );
        accessSession = {
          ...accessSession,
          ...switched,
          tenant: accessSession.tenant || null,
        };
      }

      const payloads = await loadWorkspacePayload(
        credential.serverUrl,
        accessSession.access_token
      );

      let activeCredential = credential;
      if (persistActive) {
        activeCredential = await setActiveDeviceAccount(credential.accountId);
        await refreshAccountRegistry();
      }

      applySession(activeCredential, accessSession, payloads);
      return accessSession;
    } finally {
      setLoadingWorkspace(false);
    }
  }, [applySession, loadWorkspacePayload, refreshAccountRegistry]);

  const restoreSavedAccount = useCallback(async () => {
    setRestoringSession(true);
    setRestoreError('');

    try {
      const registry = await refreshAccountRegistry();
      const credential = registry.accounts.find(
        (item) => item.accountId === registry.activeAccountId
      ) || registry.accounts[0] || null;

      if (!credential) {
        clearAuthenticatedState();
        return;
      }

      try {
        await activateAccount(credential, { persistActive: true });
      } catch (error) {
        if (isInvalidDeviceSession(error)) {
          await removeDeviceAccount(credential.accountId);
          const nextRegistry = await refreshAccountRegistry();
          const next = nextRegistry.accounts[0] || null;
          if (next) {
            await activateAccount(next, { persistActive: true });
          } else {
            clearAuthenticatedState();
          }
          return;
        }

        setDeviceCredential(credential);
        setRestoreError(error?.message || 'Could not reconnect to AkshaConnect');
      }
    } finally {
      setRestoringSession(false);
    }
  }, [activateAccount, clearAuthenticatedState, refreshAccountRegistry]);

  useEffect(() => {
    restoreSavedAccount();
  }, [restoreSavedAccount]);

  const refreshUnreadCounts = useCallback(
    async (activeServer = serverUrl, activeToken = session?.access_token) => {
      if (!activeServer || !activeToken) return {};
      const payload = await listUnreadCounts(activeServer, activeToken);
      const next = normalizeUnreadCounts(payload);
      setUnreadCounts(next);
      return next;
    },
    [serverUrl, session?.access_token]
  );

  const publishPresence = useCallback((state) => {
    const normalized =
      state === PRESENCE_AWAY
        ? PRESENCE_AWAY
        : PRESENCE_ACTIVE;

    presenceStateRef.current = normalized;

    realtimeClientRef.current?.updatePresence?.({
      state: normalized,
      activeConversationId:
        normalized === PRESENCE_ACTIVE
          ? selectedConversationRef.current?.conversationId || null
          : null,
    });
  }, []);

  const schedulePresenceIdle = useCallback(() => {
    if (presenceIdleTimerRef.current) {
      clearTimeout(presenceIdleTimerRef.current);
      presenceIdleTimerRef.current = null;
    }

    if (appStateRef.current !== 'active') return;

    presenceIdleTimerRef.current = setTimeout(() => {
      presenceIdleTimerRef.current = null;
      if (appStateRef.current === 'active') {
        publishPresence(PRESENCE_AWAY);
      }
    }, PRESENCE_IDLE_MS);
  }, [publishPresence]);

  const markUserActivity = useCallback(() => {
    if (appStateRef.current !== 'active') return;

    publishPresence(PRESENCE_ACTIVE);
    schedulePresenceIdle();
  }, [publishPresence, schedulePresenceIdle]);

  useEffect(() => {
    if (appState === 'active') {
      markUserActivity();
      return undefined;
    }

    if (presenceIdleTimerRef.current) {
      clearTimeout(presenceIdleTimerRef.current);
      presenceIdleTimerRef.current = null;
    }

    return undefined;
  }, [appState, markUserActivity]);

  useEffect(() => {
    realtimeClientRef.current?.updatePresence?.({
      state: presenceStateRef.current,
      activeConversationId:
        presenceStateRef.current === PRESENCE_ACTIVE
          ? selectedConversation?.conversationId || null
          : null,
    });
  }, [selectedConversation?.conversationId]);

  useEffect(
    () => () => {
      if (presenceIdleTimerRef.current) {
        clearTimeout(presenceIdleTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !serverUrl) {
      setRealtimeStatus('disconnected');
      return undefined;
    }
    if (!stableAppActive) {
      setRealtimeStatus('offline');
      return undefined;
    }

    const realtime = createRealtimeClient({
      serverUrl,
      token,
      clientType: 'MOBILE',
      onStatus: setRealtimeStatus,
      onEvent: (payload) => {
        if (payload?.type === 'ready') {
          if (hasConnectedRef.current) {
            setReconcileEpoch((value) => value + 1);
            refreshUnreadCounts(serverUrl, token).catch(() => {});
          } else {
            hasConnectedRef.current = true;
          }
          return;
        }

        if (payload?.type === 'presence.snapshot') {
          setPresenceByMember(
            normalizePresenceMembers(payload.members || [])
          );
          return;
        }

        if (
          payload?.type === 'presence.updated' &&
          payload.workspace_member_id
        ) {
          setPresenceByMember((current) => ({
            ...current,
            [payload.workspace_member_id]:
              clean(payload.status).toUpperCase() ||
              'NOT_AVAILABLE',
          }));
          return;
        }

        if (payload?.type === 'read_cursor.updated') {
          if (payload.conversation_id) {
            setUnreadCounts((current) => ({
              ...current,
              [payload.conversation_id]: 0,
            }));
            clearConversationNotifications(payload.conversation_id).catch(() => {});
            setNotificationToast((current) =>
              current?.selection?.conversationId === payload.conversation_id
                ? null
                : current
            );
          }
          return;
        }

        if (
          !['message.created', 'message.updated', 'message.deleted'].includes(payload?.type) ||
          !payload.message
        ) {
          return;
        }

        realtimeSequenceRef.current += 1;
        setRealtimeEvents((current) => [
          ...current.slice(-99),
          { sequence: realtimeSequenceRef.current, payload },
        ]);

        if (payload.type !== 'message.created') return;

        const ownMessage =
          payload.message.sender_type === 'HUMAN' &&
          payload.message.sender_member_id ===
            sessionRef.current?.membership?.workspace_member_id;
        if (ownMessage) return;

        const activeConversation = selectedConversationRef.current;
        const activelyReading =
          appStateRef.current === 'active' &&
          presenceStateRef.current === PRESENCE_ACTIVE &&
          activeConversation?.conversationId === payload.conversation_id;

        if (activelyReading) {
          return;
        }

        setUnreadCounts((current) => ({
          ...current,
          [payload.conversation_id]:
            Number(current[payload.conversation_id] || 0) + 1,
        }));

        const selection = navigationSelection(
          payload.conversation_id,
          channelsRef.current,
          directMessagesRef.current
        );

        const fallbackToast = {
          id: `${payload.message.message_id}-${Date.now()}`,
          sender:
            payload.message.sender_display_name ||
            (payload.message.sender_type === 'SYSTEM' ? 'System' : 'New message'),
          conversation:
            selection.kind === 'channel' ? `#${selection.title}` : selection.title,
          preview: notificationPreview(payload.message),
          selection,
        };

        displayNativeMessageNotification({
          message: payload.message,
          selection,
        })
          .then((displayed) => {
            if (!displayed) setNotificationToast(fallbackToast);
          })
          .catch(() => setNotificationToast(fallbackToast));
      },
    });

    realtimeClientRef.current = realtime;
    realtime.updatePresence({
      state: presenceStateRef.current,
      activeConversationId:
        presenceStateRef.current === PRESENCE_ACTIVE
          ? selectedConversationRef.current?.conversationId || null
          : null,
    });

    return () => {
      if (realtimeClientRef.current === realtime) {
        realtimeClientRef.current = null;
      }
      realtime.stop();
    };
  }, [refreshUnreadCounts, serverUrl, session?.access_token, stableAppActive]);

  useEffect(() => {
    const openFromNativeNotification = (selection) => {
      if (!selection?.conversationId) return;
      setNotificationToast(null);
      setSelectedConversation(selection);
      setReconcileEpoch((value) => value + 1);
    };

    const unsubscribe = subscribeToNativeNotificationPress(openFromNativeNotification);
    consumeInitialNativeNotification()
      .then((selection) => {
        if (selection) openFromNativeNotification(selection);
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  const refreshDeviceAccess = useCallback(async () => {
    if (!deviceCredential?.serverUrl || !deviceCredential?.deviceToken) return null;
    try {
      const refreshed = await refreshMobile(
        deviceCredential.serverUrl,
        deviceCredential.deviceToken
      );
      const accessSession = { ...refreshed };
      delete accessSession.device_token;
      setSession(accessSession);
      return accessSession;
    } catch (error) {
      if (isInvalidDeviceSession(error)) {
        await removeDeviceAccount(deviceCredential.accountId).catch(() => {});
        await refreshAccountRegistry().catch(() => {});
        clearAuthenticatedState();
      }
      throw error;
    }
  }, [clearAuthenticatedState, deviceCredential, refreshAccountRegistry]);

  useEffect(() => {
    if (
      !session?.access_token ||
      !session?.expires_at ||
      !deviceCredential?.deviceToken
    ) {
      return undefined;
    }

    const expiresAt = Date.parse(session.expires_at);
    const refreshAt = Number.isFinite(expiresAt)
      ? expiresAt - 5 * 60 * 1000
      : Date.now() + 60 * 60 * 1000;
    const delay = Math.max(1000, refreshAt - Date.now());

    const timer = setTimeout(() => {
      refreshDeviceAccess().catch(() => {});
    }, delay);

    return () => clearTimeout(timer);
  }, [deviceCredential?.deviceToken, refreshDeviceAccess, session?.access_token, session?.expires_at]);

  useEffect(() => {
    if (
      !stableAppActive ||
      !session?.access_token ||
      !deviceCredential?.deviceToken
    ) {
      return;
    }

    const expiresAt = Date.parse(session.expires_at || '');
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60 * 60 * 1000) {
      return;
    }

    refreshDeviceAccess().catch(() => {});
  }, [deviceCredential?.deviceToken, refreshDeviceAccess, session?.access_token, session?.expires_at, stableAppActive]);

  const refreshWorkspace = useCallback(async () => {
    if (!session?.access_token || !serverUrl) return;
    setLoadingWorkspace(true);
    try {
      const payloads = await loadWorkspacePayload(serverUrl, session.access_token);
      setChannels(payloads.channelPayload.channels || []);
      setDirectMessages(payloads.dmPayload.direct_messages || []);
      setUnreadCounts(normalizeUnreadCounts(payloads.unreadPayload));
    } finally {
      setLoadingWorkspace(false);
    }
  }, [loadWorkspacePayload, serverUrl, session?.access_token]);

  useEffect(() => {
    const handleFirebaseOpen = (selection) => {
      const conversationId = clean(selection?.conversationId);
      if (conversationId) setPendingPushConversationId(conversationId);
    };

    const unsubscribe = subscribeToFirebaseNotificationPress(handleFirebaseOpen);
    consumeInitialFirebaseNotification()
      .then((selection) => {
        if (selection) handleFirebaseOpen(selection);
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!pendingPushConversationId || !session?.access_token) return;

    const selection = navigationSelection(
      pendingPushConversationId,
      channels,
      directMessages
    );
    const unreadAtOpen = Number(
      unreadCountsRef.current?.[pendingPushConversationId] || 0
    );
    setNotificationToast(null);
    setSelectedConversation({
      ...selection,
      unreadAtOpen,
    });
    setReconcileEpoch((value) => value + 1);
    setPendingPushConversationId('');
  }, [channels, directMessages, pendingPushConversationId, session?.access_token]);

  useEffect(() => {
    if (
      !stableAppActive ||
      !serverUrl ||
      !session?.access_token ||
      !deviceCredential?.deviceToken
    ) {
      return undefined;
    }

    let cancelled = false;

    const registerCurrentToken = async (providedToken = '') => {
      const allowed = await prepareNativeNotifications();
      if (!allowed || cancelled) return;

      const pushToken = clean(providedToken || await getFirebasePushToken() || '');
      if (!pushToken || cancelled) return;

      await registerPush(serverUrl, session.access_token, {
        deviceToken: deviceCredential.deviceToken,
        pushToken,
        platform: DEVICE_PLATFORM,
      });
    };

    registerCurrentToken().catch(() => {});
    const unsubscribe = subscribeToFirebaseTokenRefresh((token) => {
      registerCurrentToken(token).catch(() => {});
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [deviceCredential?.deviceToken, serverUrl, session?.access_token, stableAppActive]);

  const handleConversationRead = useCallback((conversationId) => {
    if (!conversationId) return;

    setUnreadCounts((current) => ({ ...current, [conversationId]: 0 }));
    clearConversationNotifications(conversationId).catch(() => {});
    setNotificationToast((current) =>
      current?.selection?.conversationId === conversationId
        ? null
        : current
    );
  }, []);

  const handleOpenConversation = useCallback((selection) => {
    const conversationId = clean(selection?.conversationId);
    const unreadAtOpen = conversationId
      ? Number(unreadCountsRef.current?.[conversationId] || 0)
      : 0;

    setNotificationToast(null);
    setSelectedConversation({
      ...selection,
      unreadAtOpen,
    });
  }, []);

  const handleSearchWorkspaceMembers = useCallback(
    async (query = '') => {
      if (!serverUrl || !session?.access_token) {
        return [];
      }

      const payload = await listWorkspaceMembers(
        serverUrl,
        session.access_token,
        {
          query: clean(query),
          limit: 50,
        }
      );

      return payload.members || [];
    },
    [serverUrl, session?.access_token]
  );

  const handleStartDirectMessage = useCallback(
    async (member) => {
      const memberId = clean(member?.workspace_member_id);
      if (!memberId || !serverUrl || !session?.access_token) {
        throw new Error('Choose a workspace member to start a message.');
      }

      setLoadingWorkspace(true);
      try {
        const result = await startDirectMessage(
          serverUrl,
          session.access_token,
          memberId
        );

        const conversationId = clean(
          result?.direct_message?.conversation_id
        );

        const payloads = await loadWorkspacePayload(
          serverUrl,
          session.access_token
        );
        const nextChannels = payloads.channelPayload.channels || [];
        const nextDirectMessages = payloads.dmPayload.direct_messages || [];

        setChannels(nextChannels);
        setDirectMessages(nextDirectMessages);
        setUnreadCounts(normalizeUnreadCounts(payloads.unreadPayload));

        const directMessage = nextDirectMessages.find(
          (item) =>
            item.conversation_id === conversationId ||
            item.other_workspace_member_id === memberId
        );

        handleOpenConversation({
          kind: 'dm',
          conversationId:
            directMessage?.conversation_id || conversationId,
          title:
            directMessage?.other_display_name ||
            member.display_name ||
            'Member',
          subtitle:
            directMessage?.other_primary_email ||
            member.primary_email ||
            'Direct message',
          otherWorkspaceMemberId:
            directMessage?.other_workspace_member_id || memberId,
        });

        return result;
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [
      handleOpenConversation,
      loadWorkspacePayload,
      serverUrl,
      session?.access_token,
    ]
  );

  const handleCreateChannel = useCallback(
    async ({ channelName, visibility = 'PUBLIC' } = {}) => {
      const name = clean(channelName);
      if (!name || !serverUrl || !session?.access_token) {
        throw new Error('Channel name is required.');
      }

      setLoadingWorkspace(true);
      try {
        const result = await createChannel(
          serverUrl,
          session.access_token,
          {
            channelName: name,
            visibility,
          }
        );

        const payloads = await loadWorkspacePayload(
          serverUrl,
          session.access_token
        );
        const nextChannels = payloads.channelPayload.channels || [];

        setChannels(nextChannels);
        setDirectMessages(payloads.dmPayload.direct_messages || []);
        setUnreadCounts(normalizeUnreadCounts(payloads.unreadPayload));

        const createdChannel = result?.channel || {};
        const channel = nextChannels.find(
          (item) =>
            item.channel_id === createdChannel.channel_id ||
            item.conversation_id === createdChannel.conversation_id
        ) || createdChannel;

        const conversationId = clean(channel.conversation_id);
        if (!conversationId) {
          throw new Error('Channel was created but its conversation is unavailable.');
        }

        handleOpenConversation({
          kind: 'channel',
          conversationId,
          title: channel.channel_name || name,
          subtitle:
            channel.visibility === 'PRIVATE'
              ? 'Private channel'
              : 'Public channel',
        });

        return result;
      } finally {
        setLoadingWorkspace(false);
      }
    },
    [
      handleOpenConversation,
      loadWorkspacePayload,
      serverUrl,
      session?.access_token,
    ]
  );

  const resetDiscovery = useCallback(() => {
    setDiscoveryEmail('');
    setOrganizations([]);
    setLoginError('');
    setLoginBusy(false);
  }, []);

  const handleDiscover = useCallback(async (email) => {
    setLoginBusy(true);
    setLoginError('');
    try {
      const payload = await discoverMobileOrganizations(DEFAULT_SERVER_URL, email);
      const nextOrganizations = payload.organizations || [];
      setDiscoveryEmail(payload.email || email);
      setOrganizations(nextOrganizations);
      if (!nextOrganizations.length) {
        setLoginError(
          'No AkshaConnect organization is configured for this work email. Ask your company administrator to enable mobile discovery.'
        );
      }
    } catch (error) {
      setOrganizations([]);
      setLoginError(error?.message || 'Could not find your organization.');
    } finally {
      setLoginBusy(false);
    }
  }, []);

  const handleChooseOrganization = useCallback(async (organization, email) => {
    if (clean(organization?.provider_code).toUpperCase() !== 'AKSHAERP') {
      setLoginError('This organization uses a sign-in provider that is not enabled in this mobile build yet.');
      return;
    }

    setLoginBusy(true);
    setLoginError('');

    try {
      // A user explicitly starting a new sign-in supersedes any retained callback
      // from an earlier attempt. Clear only that native fallback before creating
      // the new request; the server-side request itself remains independently guarded.
      if (Platform.OS === 'android') {
        const bridge = NativeModules.AkshaConnectAuthBridge;
        if (bridge?.getPendingCallback && bridge?.acknowledgePendingCallback) {
          try {
            const staleCallback = await bridge.getPendingCallback();
            if (staleCallback) {
              await bridge.acknowledgePendingCallback(staleCallback);
            }
          } catch {}
        }
      }

      pendingMobileAuthRef.current = null;
      processingMobileAuthCallbackUrlRef.current = '';
      completedMobileAuthCallbackUrlRef.current = '';

      const started = await startAkshaErpMobileAuth(DEFAULT_SERVER_URL, {
        email,
        tenantId: organization.tenant_id,
        providerCode: organization.provider_code,
        redirectUri: MOBILE_REDIRECT_URI,
        devicePlatform: DEVICE_PLATFORM,
        deviceLabel: DEVICE_LABEL,
      });

      const pending = await savePendingMobileAuth({
        requestId: started.request_id,
        state: started.state,
        exchangeSecret: started.exchange_secret,
        serverUrl: DEFAULT_SERVER_URL,
        tenantId: organization.tenant_id,
        email,
      });
      pendingMobileAuthRef.current = pending;

      const supported = await Linking.canOpenURL(started.authorization_url);
      if (!supported) {
        throw new Error('This device cannot open your company sign-in page.');
      }

      await Linking.openURL(started.authorization_url);
    } catch (error) {
      pendingMobileAuthRef.current = null;
      await clearPendingMobileAuth().catch(() => {});
      setLoginError(error?.message || 'Could not start company sign-in.');
    } finally {
      setLoginBusy(false);
    }
  }, []);

  const completeMobileAuthorization = useCallback(async (callbackUrl) => {
    const parsed = parseMobileAuthCallback(callbackUrl);
    if (!parsed) return false;

    const { requestId, code, state } = parsed;
    if (!requestId || !code || !state) {
      console.warn('[AkshaConnectAuth] JS callback is incomplete.');
      setLoginError('Company sign-in returned an incomplete authorization.');
      return false;
    }

    setLoginBusy(true);
    setLoadingWorkspace(true);
    setLoginError('');

    let stage = 'load_pending';
    let exchangeConsumed = false;

    try {
      console.info('[AkshaConnectAuth] JS callback accepted.');

      const pending =
        pendingMobileAuthRef.current ||
        await loadPendingMobileAuth();

      if (!pending) {
        throw new Error('Mobile sign-in request is no longer available. Start again.');
      }
      console.info('[AkshaConnectAuth] Pending mobile sign-in state loaded.');

      stage = 'validate_state';
      if (pending.requestId !== requestId || pending.state !== state) {
        throw new Error('Mobile sign-in state did not match. Start again.');
      }
      console.info('[AkshaConnectAuth] Mobile sign-in state validated.');

      stage = 'exchange';
      console.info('[AkshaConnectAuth] Starting mobile authorization exchange.');
      const result = await exchangeMobileAuthorization(pending.serverUrl, {
        requestId,
        code,
        state,
        exchangeSecret: pending.exchangeSecret,
      });
      exchangeConsumed = true;
      console.info('[AkshaConnectAuth] Mobile authorization exchange succeeded.');

      // The authorization code is one-time. Once exchange succeeds, clear both
      // persistent pending state and the retained native callback immediately.
      pendingMobileAuthRef.current = null;
      await clearPendingMobileAuth().catch(() => {});
      if (Platform.OS === 'android') {
        const bridge = NativeModules.AkshaConnectAuthBridge;
        await bridge?.acknowledgePendingCallback?.(callbackUrl).catch(() => {});
      }

      stage = 'validate_session';
      const deviceToken = clean(result?.device_token);
      if (!deviceToken) throw new Error('AkshaConnect did not return a mobile device session.');

      const accessSession = { ...result };
      delete accessSession.device_token;

      stage = 'save_device';
      const credential = await saveDeviceAccount({
        serverUrl: pending.serverUrl,
        deviceToken,
        tenantId: result?.tenant?.tenant_id,
        tenantCode: result?.tenant?.tenant_code,
        tenantName: result?.tenant?.tenant_name,
        identityId: result?.identity?.identity_id,
        displayName: result?.identity?.display_name,
        primaryEmail: result?.identity?.primary_email,
        providerCode: result?.identity?.identity_provider || 'AKSHAERP',
        workspaceId: result?.workspace?.workspace_id,
        workspaceName: result?.workspace?.workspace_name,
      });

      stage = 'load_workspace';
      const payloads = await loadWorkspacePayload(
        pending.serverUrl,
        result.access_token
      );

      stage = 'apply_session';
      await refreshAccountRegistry();
      applySession(credential, accessSession, payloads);
      resetDiscovery();
      console.info('[AkshaConnectAuth] Mobile sign-in completed.');
      return true;
    } catch (error) {
      const status = Number(error?.status || 0);
      const codeValue = clean(error?.code || '');
      const message = error?.message || 'Could not complete company sign-in.';
      console.error(
        `[AkshaConnectAuth] Mobile sign-in failed at ${stage}` +
          `${status ? ` status=${status}` : ''}` +
          `${codeValue ? ` code=${codeValue}` : ''}: ${message}`
      );

      // Before exchange succeeds the callback remains retryable, so preserve the
      // pending secret and native callback. After exchange succeeds the one-time
      // code is consumed and the pending state was already cleared above.
      if (exchangeConsumed) {
        pendingMobileAuthRef.current = null;
      }
      setLoginError(message);
      return false;
    } finally {
      setLoginBusy(false);
      setLoadingWorkspace(false);
    }
  }, [applySession, loadWorkspacePayload, refreshAccountRegistry, resetDiscovery]);

  useEffect(() => {
    let mounted = true;

    const processMobileAuthUrl = ({ url } = {}) => {
      const callbackUrl = clean(url);
      if (
        !mounted ||
        !callbackUrl ||
        !/^akshaconnect:\/\/auth\/callback(?:\?|$)/i.test(callbackUrl) ||
        processingMobileAuthCallbackUrlRef.current === callbackUrl ||
        completedMobileAuthCallbackUrlRef.current === callbackUrl
      ) {
        return;
      }

      // Suppress only concurrent duplicate delivery. A failed pre-exchange
      // attempt remains retryable because the native callback is retained.
      processingMobileAuthCallbackUrlRef.current = callbackUrl;
      console.info('[AkshaConnectAuth] JS received mobile auth callback.');

      completeMobileAuthorization(callbackUrl)
        .then((completed) => {
          if (completed) {
            completedMobileAuthCallbackUrlRef.current = callbackUrl;
          }
        })
        .catch((error) => {
          console.error(
            '[AkshaConnectAuth] Unexpected JS callback processing failure:',
            error?.message || error
          );
        })
        .finally(() => {
          if (processingMobileAuthCallbackUrlRef.current === callbackUrl) {
            processingMobileAuthCallbackUrlRef.current = '';
          }
        });
    };

    const readRetainedMobileAuthUrl = () => {
      Linking.getInitialURL()
        .then((url) => {
          if (mounted && url) processMobileAuthUrl({ url });
        })
        .catch(() => {});
    };

    const linkingSubscription =
      Linking.addEventListener('url', processMobileAuthUrl);

    const resumeRetryTimers = new Set();

    const readNativeMobileAuthUrl = () => {
      if (Platform.OS !== 'android') return;

      const bridge = NativeModules.AkshaConnectAuthBridge;
      if (!bridge?.getPendingCallback) return;

      bridge.getPendingCallback()
        .then((url) => {
          if (mounted && url) {
            console.info('[AkshaConnectAuth] JS read retained native callback.');
            processMobileAuthUrl({ url });
          }
        })
        .catch((error) => {
          console.warn(
            '[AkshaConnectAuth] Could not read retained native callback:',
            error?.message || error
          );
        });
    };

    const nativeCallbackSubscription = Platform.OS === 'android'
      ? DeviceEventEmitter.addListener(
        'AkshaConnectAuthCallback',
        (url) => {
          console.info('[AkshaConnectAuth] JS received native callback event.');
          processMobileAuthUrl({ url });
        }
      )
      : null;

    const readAllMobileAuthUrls = () => {
      readNativeMobileAuthUrl();
      readRetainedMobileAuthUrl();
    };

    const scheduleRetainedMobileAuthRead = () => {
      // The native bridge is the authoritative Android fallback. Keep React Native
      // Linking reads too so standard devices and iOS continue to use normal paths.
      readAllMobileAuthUrls();

      for (const delay of [250, 1000]) {
        const timer = setTimeout(() => {
          resumeRetryTimers.delete(timer);
          if (mounted) readAllMobileAuthUrls();
        }, delay);
        resumeRetryTimers.add(timer);
      }
    };

    const handleMobileAuthAppState = (nextState) => {
      if (nextState === 'active') {
        scheduleRetainedMobileAuthRead();
      }
    };

    const handleMobileAuthFocus = () => {
      scheduleRetainedMobileAuthRead();
    };

    const appStateSubscription =
      AppState.addEventListener('change', handleMobileAuthAppState);
    const focusSubscription = Platform.OS === 'android'
      ? AppState.addEventListener('focus', handleMobileAuthFocus)
      : null;

    readAllMobileAuthUrls();

    return () => {
      mounted = false;
      for (const timer of resumeRetryTimers) {
        clearTimeout(timer);
      }
      resumeRetryTimers.clear();
      linkingSubscription.remove();
      nativeCallbackSubscription?.remove();
      appStateSubscription.remove();
      focusSubscription?.remove();
    };
  }, [completeMobileAuthorization]);

  const handleSwitchWorkspace = useCallback(async (workspace) => {
    if (!session?.access_token || !serverUrl || !deviceCredential) return;
    if (workspace?.workspace_id === session?.workspace?.workspace_id) {
      setShowAccountSwitcher(false);
      return;
    }

    setLoadingWorkspace(true);
    try {
      const switched = await switchWorkspace(
        serverUrl,
        session.access_token,
        workspace.workspace_id
      );
      const nextSession = {
        ...session,
        ...switched,
        tenant: session.tenant || null,
      };

      const savedCredential = await saveDeviceAccount({
        ...deviceCredential,
        workspaceId: switched.workspace?.workspace_id,
        workspaceName: switched.workspace?.workspace_name,
      });
      await refreshAccountRegistry();

      const payloads = await loadWorkspacePayload(
        serverUrl,
        nextSession.access_token
      );
      applySession(savedCredential, nextSession, payloads);
      setShowAccountSwitcher(false);
    } catch (error) {
      setLoginError(error?.message || 'Could not switch workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [
    applySession,
    deviceCredential,
    loadWorkspacePayload,
    refreshAccountRegistry,
    serverUrl,
    session,
  ]);

  const handleSwitchAccount = useCallback(async (account) => {
    setShowAccountSwitcher(false);
    setRestoreError('');
    try {
      await activateAccount(account, { persistActive: true });
    } catch (error) {
      if (isInvalidDeviceSession(error)) {
        await removeDeviceAccount(account.accountId).catch(() => {});
        await refreshAccountRegistry().catch(() => {});
      }
      setLoginError(error?.message || 'Could not open that organization.');
      setAddingOrganization(true);
      clearAuthenticatedState();
    }
  }, [activateAccount, clearAuthenticatedState, refreshAccountRegistry]);

  const handleAddOrganization = useCallback(() => {
    resetDiscovery();
    setShowAccountSwitcher(false);
    setAddingOrganization(true);
  }, [resetDiscovery]);

  const handleReturnToSavedAccount = useCallback(async () => {
    const registry = await refreshAccountRegistry();
    const next = registry.accounts.find(
      (item) => item.accountId === registry.activeAccountId
    ) || registry.accounts[0];

    if (!next) return;
    setAddingOrganization(false);
    resetDiscovery();
    await activateAccount(next, { persistActive: true });
  }, [activateAccount, refreshAccountRegistry, resetDiscovery]);

  const handleLogout = useCallback(async () => {
    const token = session?.access_token;
    const activeServer = serverUrl;
    const credential = deviceCredential;

    setPendingPushConversationId('');

    if (token && activeServer && credential?.deviceToken) {
      try {
        const pushToken = await getFirebasePushToken();
        await unregisterPush(activeServer, token, {
          deviceToken: credential.deviceToken,
          pushToken: pushToken || '',
        });
      } catch {}
    }

    clearAuthenticatedState();

    if (credential?.serverUrl && credential?.deviceToken) {
      try { await logoutMobile(credential.serverUrl, credential.deviceToken); } catch {}
    }
    if (token && activeServer) {
      try { await logout(activeServer, token); } catch {}
    }

    if (credential?.accountId) {
      await removeDeviceAccount(credential.accountId).catch(() => {});
    }

    const registry = await refreshAccountRegistry();
    const next = registry.accounts[0] || null;
    if (next) {
      try {
        await activateAccount(next, { persistActive: true });
        return;
      } catch {}
    }

    resetDiscovery();
    setAddingOrganization(false);
  }, [
    activateAccount,
    clearAuthenticatedState,
    deviceCredential,
    refreshAccountRegistry,
    resetDiscovery,
    serverUrl,
    session?.access_token,
  ]);

  const handleRestoreUseAnother = useCallback(async () => {
    if (deviceCredential?.accountId) {
      await removeDeviceAccount(deviceCredential.accountId).catch(() => {});
    }
    const registry = await refreshAccountRegistry();
    const next = registry.accounts[0] || null;
    setRestoreError('');
    if (next) {
      await activateAccount(next, { persistActive: true }).catch(() => {
        clearAuthenticatedState();
        setAddingOrganization(true);
      });
    } else {
      clearAuthenticatedState();
      setAddingOrganization(true);
    }
  }, [activateAccount, clearAuthenticatedState, deviceCredential?.accountId, refreshAccountRegistry]);


  const showLogin = !session || addingOrganization;

  return (
    <SafeAreaProvider>
      <View
        style={styles.interactionRoot}
        onTouchStart={markUserActivity}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {showSplash || restoringSession ? (
        <BrandSplash />
      ) : restoreError && deviceCredential ? (
        <SessionRestoreScreen
          message={restoreError}
          onRetry={restoreSavedAccount}
          onUseAnotherAccount={handleRestoreUseAnother}
        />
      ) : showLogin ? (
        <LoginScreen
          busy={loginBusy || loadingWorkspace}
          organizations={organizations}
          discoveryEmail={discoveryEmail}
          error={loginError}
          onDiscover={handleDiscover}
          onChooseOrganization={handleChooseOrganization}
          onReset={resetDiscovery}
          savedAccountCount={accounts.length}
          onShowSavedAccounts={handleReturnToSavedAccount}
        />
      ) : selectedConversation ? (
        <ConversationScreen
          session={session}
          serverUrl={serverUrl}
          conversation={selectedConversation}
          realtimeStatus={realtimeStatus}
          realtimeEvents={realtimeEvents}
          reconcileEpoch={reconcileEpoch}
          peerPresenceStatus={peerPresenceStatus(
            selectedConversation,
            presenceByMember
          )}
          onConversationRead={handleConversationRead}
          onUserActivity={markUserActivity}
          onBack={() => setSelectedConversation(null)}
        />
      ) : (
        <View style={styles.authenticatedShell}>
          <HomeScreen
            session={session}
            serverUrl={serverUrl}
            channels={channels}
            directMessages={directMessages}
            unreadCounts={unreadCounts}
            presenceByMember={presenceByMember}
            refreshing={loadingWorkspace}
            realtimeStatus={realtimeStatus}
            onRefresh={refreshWorkspace}
            onLogout={handleLogout}
            onOpenConversation={handleOpenConversation}
            onSearchMembers={handleSearchWorkspaceMembers}
            onStartDirectMessage={handleStartDirectMessage}
            onCreateChannel={handleCreateChannel}
            onOpenAccountSwitcher={() => setShowAccountSwitcher(true)}
          />
        </View>
      )}

      <AccountSwitcher
        visible={showAccountSwitcher && Boolean(session)}
        accounts={accounts}
        activeAccountId={deviceCredential?.accountId}
        workspaces={session?.workspaces || []}
        activeWorkspaceId={session?.workspace?.workspace_id}
        onClose={() => setShowAccountSwitcher(false)}
        onSelect={handleSwitchAccount}
        onSelectWorkspace={handleSwitchWorkspace}
        onAdd={handleAddOrganization}
      />

      {session && !addingOrganization && notificationToast ? (
        <View pointerEvents="box-none" style={styles.notificationLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${notificationToast.conversation}`}
            onPress={() => {
              handleOpenConversation(notificationToast.selection);
              setReconcileEpoch((value) => value + 1);
            }}
            style={({ pressed }) => [
              styles.notificationToast,
              pressed ? styles.notificationToastPressed : null,
            ]}
          >
            <View style={styles.notificationAccent} />
            <View style={styles.notificationCopy}>
              <Text style={styles.notificationSender} numberOfLines={1}>
                {notificationToast.sender}
              </Text>
              <Text style={styles.notificationConversation} numberOfLines={1}>
                {notificationToast.conversation}
              </Text>
              <Text style={styles.notificationPreview} numberOfLines={2}>
                {notificationToast.preview}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}
      </View>
    </SafeAreaProvider>
  );
}

function AccountSwitcher({
  visible,
  accounts,
  activeAccountId,
  workspaces,
  activeWorkspaceId,
  onClose,
  onSelect,
  onSelectWorkspace,
  onAdd,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.accountSheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Organizations</Text>
          <Text style={styles.sheetSubtitle}>
            Switch instantly between companies signed in on this device.
          </Text>

          <ScrollView style={styles.accountList}>
            {accounts.map((account) => {
              const active = account.accountId === activeAccountId;
              const name = account.tenantName || account.workspaceName || 'AkshaConnect';
              return (
                <Pressable
                  key={account.accountId}
                  onPress={() => onSelect(account)}
                  style={[styles.accountRow, active ? styles.accountRowActive : null]}
                >
                  <View style={styles.accountRowAvatar}>
                    <Text style={styles.accountRowAvatarText}>
                      {String(name).slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.accountRowCopy}>
                    <Text style={styles.accountRowName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.accountRowMeta} numberOfLines={1}>
                      {account.displayName || account.primaryEmail || account.providerCode}
                    </Text>
                  </View>
                  {active ? <Text style={styles.activeMark}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {(workspaces || []).length > 1 ? (
            <View style={styles.workspaceSection}>
              <Text style={styles.workspaceSectionTitle}>Workspaces</Text>
              {(workspaces || []).map((workspace) => {
                const active = workspace.workspace_id === activeWorkspaceId;
                return (
                  <Pressable
                    key={workspace.workspace_id}
                    onPress={() => onSelectWorkspace(workspace)}
                    style={[styles.workspaceRow, active ? styles.workspaceRowActive : null]}
                  >
                    <Text style={styles.workspaceRowName}>{workspace.workspace_name}</Text>
                    {active ? <Text style={styles.activeMark}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable style={styles.addAccountButton} onPress={onAdd}>
            <Text style={styles.addAccountText}>+ Add another organization</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BrandSplash() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashCenter}>
        <Image source={brandMark} style={styles.splashLogo} resizeMode="contain" />
        <Image source={brandWordmark} style={styles.splashWordmark} resizeMode="contain" />
        <Text style={styles.splashTagline}>PEOPLE  •  IDEAS  •  TOGETHER</Text>
      </View>
      <View style={styles.splashWaves}>
        <View style={styles.splashOrange} />
        <View style={styles.splashTeal} />
        <View style={styles.splashNavy} />
      </View>
      <Text style={styles.splashPromise}>A BRIGHTER WORKPLACE TOGETHER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  interactionRoot: { flex: 1 },
  authenticatedShell: { flex: 1, backgroundColor: '#F4F7FB' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7, 19, 46, 0.52)',
  },
  accountSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CDD8E4',
    marginBottom: 14,
  },
  sheetTitle: { color: '#0E2455', fontSize: 20, fontWeight: '900' },
  sheetSubtitle: { marginTop: 5, color: '#5F7790', fontSize: 12, lineHeight: 17 },
  accountList: { marginTop: 12, maxHeight: 350 },
  accountRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE6F0',
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  accountRowActive: { borderColor: '#0879E7', backgroundColor: '#F2F8FF' },
  accountRowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FC',
  },
  accountRowAvatarText: { color: '#0879E7', fontSize: 17, fontWeight: '900' },
  accountRowCopy: { flex: 1, marginLeft: 10 },
  accountRowName: { color: '#0E2455', fontSize: 13, fontWeight: '900' },
  accountRowMeta: { marginTop: 3, color: '#5F7790', fontSize: 11 },
  activeMark: { color: '#0879E7', fontSize: 19, fontWeight: '900' },
  workspaceSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5ECF3',
  },
  workspaceSectionTitle: {
    marginBottom: 7,
    color: '#0E2455',
    fontSize: 12,
    fontWeight: '900',
  },
  workspaceRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 11,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  workspaceRowActive: { backgroundColor: '#F2F8FF' },
  workspaceRowName: { color: '#24415E', fontSize: 12.5, fontWeight: '700' },
  addAccountButton: {
    minHeight: 46,
    marginTop: 6,
    borderRadius: 13,
    backgroundColor: '#0879E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAccountText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  closeButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  closeButtonText: { color: '#4F6B88', fontSize: 12, fontWeight: '800' },
  splash: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FB',
  },
  splashCenter: { alignItems: 'center', marginTop: -65 },
  splashLogo: { width: 185, height: 185 },
  splashWordmark: { width: 292, height: 76, marginTop: 4 },
  splashTagline: {
    marginTop: 7,
    color: '#0E2455',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  splashWaves: { position: 'absolute', left: -25, right: -25, bottom: 76, height: 145 },
  splashOrange: {
    position: 'absolute', left: 105, right: -10, bottom: 55, height: 54,
    borderRadius: 80, backgroundColor: '#EF5E1B', transform: [{ rotate: '-8deg' }],
  },
  splashTeal: {
    position: 'absolute', left: -40, right: 15, bottom: 37, height: 64,
    borderRadius: 80, backgroundColor: '#0FA16C', transform: [{ rotate: '7deg' }],
  },
  splashNavy: {
    position: 'absolute', left: -20, right: -20, bottom: -15, height: 85,
    borderRadius: 80, backgroundColor: '#0879E7', transform: [{ rotate: '1deg' }],
  },
  splashPromise: { position: 'absolute', bottom: 28, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  notificationLayer: {
    position: 'absolute', top: 42, left: 12, right: 12, zIndex: 1000, elevation: 30,
  },
  notificationToast: {
    minHeight: 82,
    overflow: 'hidden',
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6E2EC',
    backgroundColor: '#FFFFFF',
    elevation: 20,
  },
  notificationToastPressed: { opacity: 0.9 },
  notificationAccent: { width: 4, backgroundColor: '#EF5E1B' },
  notificationCopy: { flex: 1, paddingHorizontal: 13, paddingVertical: 10 },
  notificationSender: { color: '#0E2455', fontSize: 13, fontWeight: '800' },
  notificationConversation: { marginTop: 2, color: '#0879E7', fontSize: 11, fontWeight: '700' },
  notificationPreview: { marginTop: 4, color: '#4F6B88', fontSize: 12, lineHeight: 16 },
});
