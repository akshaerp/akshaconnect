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
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  listChannels,
  listDirectMessages,
  listUnreadCounts,
  loginMobile,
  logoutMobile,
  refreshMobile,
  registerPush,
  unregisterPush,
  logout,
} from './src/api/client';

import {
  clearDeviceSession,
  loadDeviceSession,
  saveDeviceSession,
} from './src/auth/deviceSession.js';
import { createRealtimeClient } from './src/realtime/client.js';
import {
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

function normalizeUnreadCounts(payload) {
  const next = {};

  for (const item of payload?.unread_counts || []) {
    if (!item?.conversation_id) continue;
    next[item.conversation_id] = Number(item.unread_count || 0);
  }

  return next;
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
      subtitle:
        channel.visibility === 'PRIVATE'
          ? 'Private channel'
          : 'Public channel',
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

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [restoringSession, setRestoringSession] =
    useState(true);

  const [restoreError, setRestoreError] =
    useState('');

  const [
    deviceCredential,
    setDeviceCredential,
  ] = useState(null);

  const [session, setSession] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notificationToast, setNotificationToast] = useState(null);
  const [pendingPushConversationId, setPendingPushConversationId] =
    useState('');

  const [appState, setAppState] = useState(AppState.currentState);
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [realtimeEvents, setRealtimeEvents] = useState([]);
  const [reconcileEpoch, setReconcileEpoch] = useState(0);

  const realtimeSequenceRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const sessionRef = useRef(session);
  const selectedConversationRef = useRef(selectedConversation);
  const channelsRef = useRef(channels);
  const directMessagesRef = useRef(directMessages);
  const appStateRef = useRef(appState);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 950);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) {
      return undefined;
    }

    const subscription =
      BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          setSelectedConversation(null);
          setNotificationToast(null);
          return true;
        }
      );

    return () => subscription.remove();
  }, [selectedConversation]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    directMessagesRef.current = directMessages;
  }, [directMessages]);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      setAppState
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!notificationToast) return undefined;

    const timer = setTimeout(() => {
      setNotificationToast(null);
    }, 4500);

    return () => clearTimeout(timer);
  }, [notificationToast]);

  useEffect(() => {
    if (!session) return undefined;

    prepareNativeNotifications().catch(() => {
      // In-app banner remains the fallback when native permission is unavailable.
    });

    return undefined;
  }, [session]);

  useEffect(() => {
    const openFromNativeNotification = (selection) => {
      if (!selection?.conversationId) return;
      setNotificationToast(null);
      setSelectedConversation(selection);
      setReconcileEpoch((value) => value + 1);
    };

    const unsubscribe = subscribeToNativeNotificationPress(
      openFromNativeNotification
    );

    consumeInitialNativeNotification()
      .then((selection) => {
        if (selection) openFromNativeNotification(selection);
      })
      .catch(() => {
        // Notification routing is best-effort and never blocks app startup.
      });

    return unsubscribe;
  }, []);

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

  useEffect(() => {
    const token = session?.access_token;

    if (!token || !serverUrl) {
      setRealtimeStatus('disconnected');
      return undefined;
    }

    if (appState !== 'active') {
      setRealtimeStatus('offline');
      return undefined;
    }

    const realtime = createRealtimeClient({
      serverUrl,
      token,
      onStatus: setRealtimeStatus,
      onEvent: (payload) => {
        if (payload?.type === 'ready') {
          if (hasConnectedRef.current) {
            setReconcileEpoch((value) => value + 1);
            refreshUnreadCounts(serverUrl, token).catch(() => {
              // Durable unread reconciliation is retried by manual refresh.
            });
          } else {
            hasConnectedRef.current = true;
          }
          return;
        }

        if (payload?.type === 'read_cursor.updated') {
          if (payload.conversation_id) {
            setUnreadCounts((current) => ({
              ...current,
              [payload.conversation_id]: 0,
            }));
          }
          return;
        }

        if (payload?.type !== 'message.created' || !payload.message) {
          return;
        }

        realtimeSequenceRef.current += 1;

        const envelope = {
          sequence: realtimeSequenceRef.current,
          payload,
        };

        setRealtimeEvents((current) => [
          ...current.slice(-99),
          envelope,
        ]);

        const currentSession = sessionRef.current;
        const ownMessage =
          payload.message.sender_type === 'HUMAN' &&
          payload.message.sender_member_id ===
            currentSession?.membership?.workspace_member_id;

        if (ownMessage) return;

        const activeConversation = selectedConversationRef.current;
        const activelyReading =
          appStateRef.current === 'active' &&
          activeConversation?.conversationId === payload.conversation_id;

        if (!activelyReading) {
          setUnreadCounts((current) => ({
            ...current,
            [payload.conversation_id]:
              Number(current[payload.conversation_id] || 0) + 1,
          }));
        }

        const selection = navigationSelection(
          payload.conversation_id,
          channelsRef.current,
          directMessagesRef.current
        );

        const fallbackToast = {
          id: `${payload.message.message_id}-${Date.now()}`,
          sender:
            payload.message.sender_display_name ||
            (payload.message.sender_type === 'SYSTEM'
              ? 'System'
              : 'New message'),
          conversation:
            selection.kind === 'channel'
              ? `#${selection.title}`
              : selection.title,
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
          .catch(() => {
            setNotificationToast(fallbackToast);
          });
      },
    });

    return () => {
      realtime.stop();
    };
  }, [
    appState,
    refreshUnreadCounts,
    serverUrl,
    session?.access_token,
  ]);


  const clearLocalAuthenticatedState =
    useCallback(() => {
      setSession(null);
      setServerUrl('');
      setChannels([]);
      setDirectMessages([]);
      setSelectedConversation(null);
      setUnreadCounts({});
      setNotificationToast(null);
      setRealtimeStatus('disconnected');
      setRealtimeEvents([]);
      setReconcileEpoch(0);

      if (
        typeof hasConnectedRef !==
        'undefined'
      ) {
        hasConnectedRef.current = false;
      }

      if (
        typeof realtimeSequenceRef !==
        'undefined'
      ) {
        realtimeSequenceRef.current = 0;
      }
    }, []);


  const applyRestoredSession =
    useCallback(
      (
        activeServer,
        activeSession,
        channelPayload,
        dmPayload,
        unreadPayload
      ) => {
        setServerUrl(activeServer);
        setSession(activeSession);

        setChannels(
          channelPayload.channels || []
        );

        setDirectMessages(
          dmPayload.direct_messages || []
        );

        setUnreadCounts(
          normalizeUnreadCounts(
            unreadPayload
          )
        );

        setSelectedConversation(null);
        setNotificationToast(null);
      },
      []
    );


  const refreshDeviceAccess =
    useCallback(
      async (
        credential =
          deviceCredential
      ) => {
        if (
          !credential?.serverUrl ||
          !credential?.deviceToken
        ) {
          return null;
        }

        try {
          const refreshed =
            await refreshMobile(
              credential.serverUrl,
              credential.deviceToken
            );

          const accessSession = {
            ...refreshed,
          };

          delete accessSession.device_token;

          setServerUrl(
            credential.serverUrl
          );

          setSession(
            accessSession
          );

          return accessSession;
        } catch (error) {
          if (
            Number(error?.status) === 401 ||
            error?.code ===
              'MOBILE_DEVICE_SESSION_INVALID' ||
            error?.code ===
              'MOBILE_DEVICE_TOKEN_REQUIRED'
          ) {
            try {
              await clearDeviceSession();
            } catch {
              // Secure storage may already
              // be empty.
            }

            setDeviceCredential(null);
            setRestoreError('');
            clearLocalAuthenticatedState();
          }

          throw error;
        }
      },
      [
        clearLocalAuthenticatedState,
        deviceCredential,
      ]
    );


  const restoreDeviceSession =
    useCallback(async () => {
      setRestoringSession(true);
      setRestoreError('');

      try {
        const credential =
          await loadDeviceSession();

        if (!credential) {
          setDeviceCredential(null);
          return;
        }

        setDeviceCredential(
          credential
        );

        const refreshed =
          await refreshMobile(
            credential.serverUrl,
            credential.deviceToken
          );

        const accessSession = {
          ...refreshed,
        };

        delete accessSession.device_token;

        const [
          channelPayload,
          dmPayload,
          unreadPayload,
        ] = await Promise.all([
          listChannels(
            credential.serverUrl,
            accessSession.access_token
          ),

          listDirectMessages(
            credential.serverUrl,
            accessSession.access_token
          ),

          listUnreadCounts(
            credential.serverUrl,
            accessSession.access_token
          ),
        ]);

        applyRestoredSession(
          credential.serverUrl,
          accessSession,
          channelPayload,
          dmPayload,
          unreadPayload
        );
      } catch (error) {
        if (
          Number(error?.status) === 401 ||
          error?.code ===
            'MOBILE_DEVICE_SESSION_INVALID' ||
          error?.code ===
            'MOBILE_DEVICE_TOKEN_REQUIRED'
        ) {
          try {
            await clearDeviceSession();
          } catch {
            // Secure storage may already
            // be empty.
          }

          setDeviceCredential(null);
          setRestoreError('');
          clearLocalAuthenticatedState();

          return;
        }

        /*
         * Important:
         * A temporary network failure must NOT
         * erase the long-lived mobile credential.
         */
        setRestoreError(
          error?.message ||
            'Could not reconnect to AkshaConnect'
        );
      } finally {
        setRestoringSession(false);
      }
    }, [
      applyRestoredSession,
      clearLocalAuthenticatedState,
    ]);


  useEffect(() => {
    restoreDeviceSession();
  }, [restoreDeviceSession]);


  useEffect(() => {
    if (
      !session?.access_token ||
      !session?.expires_at ||
      !deviceCredential?.deviceToken
    ) {
      return undefined;
    }

    const expiresAt =
      Date.parse(
        session.expires_at
      );

    const refreshAt =
      Number.isFinite(expiresAt)
        ? expiresAt -
          5 * 60 * 1000
        : Date.now() +
          60 * 60 * 1000;

    const delay =
      Math.max(
        1000,
        refreshAt - Date.now()
      );

    let retryTimer = null;

    const timer =
      setTimeout(
        async () => {
          try {
            await refreshDeviceAccess();
          } catch (error) {
            if (
              Number(error?.status) !==
              401
            ) {
              retryTimer =
                setTimeout(
                  () => {
                    refreshDeviceAccess()
                      .catch(() => {});
                  },
                  60 * 1000
                );
            }
          }
        },
        delay
      );

    return () => {
      clearTimeout(timer);

      if (retryTimer) {
        clearTimeout(
          retryTimer
        );
      }
    };
  }, [
    deviceCredential?.deviceToken,
    refreshDeviceAccess,
    session?.access_token,
    session?.expires_at,
  ]);


  useEffect(() => {
    if (
      appState !== 'active' ||
      !session?.access_token ||
      !deviceCredential?.deviceToken
    ) {
      return;
    }

    const expiresAt =
      Date.parse(
        session.expires_at || ''
      );

    const refreshNeeded =
      !Number.isFinite(expiresAt) ||
      expiresAt - Date.now() <=
        60 * 60 * 1000;

    if (!refreshNeeded) {
      return;
    }

    refreshDeviceAccess()
      .catch(() => {
        /*
         * Keep the secure credential when
         * the server/network is temporarily
         * unavailable.
         */
      });
  }, [
    appState,
    deviceCredential?.deviceToken,
    refreshDeviceAccess,
    session?.access_token,
    session?.expires_at,
  ]);


  const forgetDeviceSession =
    useCallback(async () => {
      try {
        await clearDeviceSession();
      } catch {
        // Continue to login screen.
      }

      setDeviceCredential(null);
      setRestoreError('');
      clearLocalAuthenticatedState();
    }, [
      clearLocalAuthenticatedState,
    ]);


  const handleLogin = useCallback(
    async ({
      serverUrl: requestedServerUrl,
      workspaceCode,
      loginName,
      password,
    }) => {
      const loginResult =
        await loginMobile(
          requestedServerUrl,
          {
            workspaceCode,
            loginName,
            password,
            devicePlatform: 'ANDROID',
            deviceLabel:
              'AkshaConnect Android',
          }
        );

      const deviceToken =
        String(
          loginResult?.device_token ||
            ''
        ).trim();

      if (!deviceToken) {
        throw new Error(
          'Server did not return a mobile device session'
        );
      }

      const accessSession = {
        ...loginResult,
      };

      delete accessSession.device_token;

      setLoadingWorkspace(true);

      try {
        const [channelPayload, dmPayload, unreadPayload] = await Promise.all([
          listChannels(requestedServerUrl, loginResult.access_token),
          listDirectMessages(requestedServerUrl, loginResult.access_token),
          listUnreadCounts(requestedServerUrl, loginResult.access_token),
        ]);

        hasConnectedRef.current = false;
        realtimeSequenceRef.current = 0;

        setRealtimeStatus('disconnected');
        setRealtimeEvents([]);
        setReconcileEpoch(0);
        setNotificationToast(null);

        const savedCredential =
          await saveDeviceSession({
            serverUrl:
              requestedServerUrl,
            deviceToken,
          });

        setDeviceCredential(
          savedCredential
        );

        setServerUrl(requestedServerUrl);
        setSession(accessSession);
        setChannels(channelPayload.channels || []);
        setDirectMessages(dmPayload.direct_messages || []);
        setUnreadCounts(normalizeUnreadCounts(unreadPayload));
        setSelectedConversation(null);
      } catch (error) {
        try {
          await logoutMobile(
            requestedServerUrl,
            deviceToken
          );
        } catch {
          // Best-effort device-session cleanup.
        }

        try {
          await clearDeviceSession();
        } catch {
          // Secure storage may not have
          // been written yet.
        }

        setDeviceCredential(null);
        try {
          await logout(requestedServerUrl, loginResult.access_token);
        } catch {
          // Best-effort cleanup only if post-login navigation loading fails.
        }
        throw error;
      } finally {
        setLoadingWorkspace(false);
      }
    },
    []
  );

  const refreshWorkspace = useCallback(async () => {
    if (!session?.access_token || !serverUrl) return;

    setLoadingWorkspace(true);

    try {
      const [channelPayload, dmPayload, unreadPayload] = await Promise.all([
        listChannels(serverUrl, session.access_token),
        listDirectMessages(serverUrl, session.access_token),
        listUnreadCounts(serverUrl, session.access_token),
      ]);

      setChannels(channelPayload.channels || []);
      setDirectMessages(dmPayload.direct_messages || []);
      setUnreadCounts(normalizeUnreadCounts(unreadPayload));
    } finally {
      setLoadingWorkspace(false);
    }
  }, [serverUrl, session]);

  useEffect(() => {
    const handleFirebaseOpen = (selection) => {
      const conversationId =
        String(selection?.conversationId || '').trim();

      if (!conversationId) return;

      setPendingPushConversationId(conversationId);
    };

    const unsubscribe =
      subscribeToFirebaseNotificationPress(
        handleFirebaseOpen
      );

    consumeInitialFirebaseNotification()
      .then((selection) => {
        if (selection) {
          handleFirebaseOpen(selection);
        }
      })
      .catch(() => {});

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (
      !pendingPushConversationId ||
      !session?.access_token
    ) {
      return;
    }

    const selection =
      navigationSelection(
        pendingPushConversationId,
        channels,
        directMessages
      );

    setNotificationToast(null);
    setSelectedConversation(selection);
    setReconcileEpoch((value) => value + 1);
    setPendingPushConversationId('');
  }, [
    channels,
    directMessages,
    pendingPushConversationId,
    session?.access_token,
  ]);

  useEffect(() => {
    if (
      appState !== 'active' ||
      !serverUrl ||
      !session?.access_token ||
      !deviceCredential?.deviceToken
    ) {
      return undefined;
    }

    let cancelled = false;

    const registerCurrentToken =
      async (providedToken = '') => {
        const allowed =
          await prepareNativeNotifications();

        if (!allowed || cancelled) {
          return;
        }

        const pushToken =
          String(
            providedToken ||
            await getFirebasePushToken() ||
            ''
          ).trim();

        if (!pushToken || cancelled) {
          return;
        }

        await registerPush(
          serverUrl,
          session.access_token,
          {
            deviceToken:
              deviceCredential.deviceToken,
            pushToken,
            platform: 'ANDROID',
          }
        );
      };

    registerCurrentToken()
      .catch(() => {});

    const unsubscribe =
      subscribeToFirebaseTokenRefresh(
        (token) => {
          registerCurrentToken(token)
            .catch(() => {});
        }
      );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    appState,
    deviceCredential?.deviceToken,
    serverUrl,
    session?.access_token,
  ]);

  const handleConversationRead = useCallback((conversationId) => {
    if (!conversationId) return;

    setUnreadCounts((current) => ({
      ...current,
      [conversationId]: 0,
    }));
  }, []);

  const handleOpenConversation = useCallback((selection) => {
    setNotificationToast(null);
    setSelectedConversation(selection);
  }, []);

  const handleLogout = useCallback(async () => {
    const token = session?.access_token;
    const activeServer = serverUrl;
    const credential = deviceCredential;

    setPendingPushConversationId('');

    if (
      token &&
      activeServer &&
      credential?.deviceToken
    ) {
      try {
        const pushToken =
          await getFirebasePushToken();

        await unregisterPush(
          activeServer,
          token,
          {
            deviceToken:
              credential.deviceToken,
            pushToken:
              pushToken || '',
          }
        );
      } catch {
        // Device revocation below still prevents future delivery.
      }
    }

    try {
      await clearDeviceSession();
    } catch {
      // Local sign-out still proceeds.
    }

    setDeviceCredential(null);
    setRestoreError('');

    hasConnectedRef.current = false;
    realtimeSequenceRef.current = 0;

    setSession(null);
    setChannels([]);
    setDirectMessages([]);
    setSelectedConversation(null);
    setUnreadCounts({});
    setNotificationToast(null);
    setRealtimeStatus('disconnected');
    setRealtimeEvents([]);
    setReconcileEpoch(0);

    if (
      credential?.serverUrl &&
      credential?.deviceToken
    ) {
      try {
        await logoutMobile(
          credential.serverUrl,
          credential.deviceToken
        );
      } catch {
        /*
         * Local Keystore credential has
         * already been removed.
         */
      }
    }

    if (token && activeServer) {
      try {
        await logout(activeServer, token);
      } catch {
        // The local in-memory session remains cleared if the server is unavailable.
      }
    }
  }, [
    deviceCredential,
    serverUrl,
    session,
  ]);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0B2D5B"
      />

      {showSplash || restoringSession ? (
        <BrandSplash />
      ) : restoreError && deviceCredential ? (
        <SessionRestoreScreen
          message={restoreError}
          onRetry={restoreDeviceSession}
          onUseAnotherAccount={
            forgetDeviceSession
          }
        />
      ) : session ? (
        selectedConversation ? (
          <ConversationScreen
            session={session}
            serverUrl={serverUrl}
            conversation={selectedConversation}
            realtimeStatus={realtimeStatus}
            realtimeEvents={realtimeEvents}
            reconcileEpoch={reconcileEpoch}
            onConversationRead={handleConversationRead}
            onBack={() => setSelectedConversation(null)}
          />
        ) : (
          <HomeScreen
            session={session}
            serverUrl={serverUrl}
            channels={channels}
            directMessages={directMessages}
            unreadCounts={unreadCounts}
            refreshing={loadingWorkspace}
            realtimeStatus={realtimeStatus}
            onRefresh={refreshWorkspace}
            onLogout={handleLogout}
            onOpenConversation={handleOpenConversation}
          />
        )
      ) : (
        <LoginScreen
          busy={loadingWorkspace}
          onLogin={handleLogin}
        />
      )}

      {session && notificationToast ? (
        <View
          pointerEvents="box-none"
          style={styles.notificationLayer}
        >
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
              <Text
                style={styles.notificationSender}
                numberOfLines={1}
              >
                {notificationToast.sender}
              </Text>
              <Text
                style={styles.notificationConversation}
                numberOfLines={1}
              >
                {notificationToast.conversation}
              </Text>
              <Text
                style={styles.notificationPreview}
                numberOfLines={2}
              >
                {notificationToast.preview}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}


function BrandSplash() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashCenter}>
        <Image
          source={brandMark}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <Text style={styles.splashName}>
          <Text style={styles.splashAksha}>Aksha</Text>
          <Text style={styles.splashConnect}>Connect</Text>
        </Text>
        <Text style={styles.splashTagline}>
          PEOPLE  •  TEAMS  •  TOGETHER
        </Text>
      </View>

      <View style={styles.splashWaves}>
        <View style={styles.splashOrange} />
        <View style={styles.splashTeal} />
        <View style={styles.splashNavy} />
      </View>

      <Text style={styles.splashPromise}>
        Connect. Collaborate. Achieve.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F7FB',
  },
  splashCenter: {
    alignItems: 'center',
    marginTop: -65,
  },
  splashLogo: {
    width: 185,
    height: 185,
  },
  splashName: {
    marginTop: 5,
    fontSize: 39,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  splashAksha: {
    color: '#0B2D5B',
  },
  splashConnect: {
    color: '#00BFA5',
  },
  splashTagline: {
    marginTop: 7,
    color: '#0B2D5B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  splashWaves: {
    position: 'absolute',
    left: -25,
    right: -25,
    bottom: 76,
    height: 145,
  },
  splashOrange: {
    position: 'absolute',
    left: 105,
    right: -10,
    bottom: 55,
    height: 54,
    borderRadius: 80,
    backgroundColor: '#FF8A00',
    transform: [{ rotate: '-8deg' }],
  },
  splashTeal: {
    position: 'absolute',
    left: -40,
    right: 15,
    bottom: 37,
    height: 64,
    borderRadius: 80,
    backgroundColor: '#00BFA5',
    transform: [{ rotate: '7deg' }],
  },
  splashNavy: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: -15,
    height: 85,
    borderRadius: 80,
    backgroundColor: '#0B2D5B',
    transform: [{ rotate: '1deg' }],
  },
  splashPromise: {
    position: 'absolute',
    bottom: 28,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  notificationLayer: {
    position: 'absolute',
    top: 42,
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 30,
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
  notificationToastPressed: {
    opacity: 0.9,
  },
  notificationAccent: {
    width: 4,
    backgroundColor: '#FF8A00',
  },
  notificationCopy: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  notificationSender: {
    color: '#0B2D5B',
    fontSize: 13,
    fontWeight: '800',
  },
  notificationConversation: {
    marginTop: 2,
    color: '#00A993',
    fontSize: 11,
    fontWeight: '700',
  },
  notificationPreview: {
    marginTop: 4,
    color: '#4F6B88',
    fontSize: 12,
    lineHeight: 16,
  },
});
