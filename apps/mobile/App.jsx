import React, { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  listChannels,
  listDirectMessages,
  loginLocal,
  logout,
} from './src/api/client';
import HomeScreen from './src/screens/HomeScreen.jsx';
import LoginScreen from './src/screens/LoginScreen.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const handleLogin = useCallback(
    async ({
      serverUrl: requestedServerUrl,
      workspaceCode,
      loginName,
      password,
    }) => {
      const loginResult = await loginLocal(requestedServerUrl, {
        workspaceCode,
        loginName,
        password,
      });

      setLoadingWorkspace(true);

      try {
        const [channelPayload, dmPayload] = await Promise.all([
          listChannels(requestedServerUrl, loginResult.access_token),
          listDirectMessages(requestedServerUrl, loginResult.access_token),
        ]);

        setServerUrl(requestedServerUrl);
        setSession(loginResult);
        setChannels(channelPayload.channels || []);
        setDirectMessages(dmPayload.direct_messages || []);
      } catch (error) {
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
      const [channelPayload, dmPayload] = await Promise.all([
        listChannels(serverUrl, session.access_token),
        listDirectMessages(serverUrl, session.access_token),
      ]);

      setChannels(channelPayload.channels || []);
      setDirectMessages(dmPayload.direct_messages || []);
    } finally {
      setLoadingWorkspace(false);
    }
  }, [serverUrl, session]);

  const handleLogout = useCallback(async () => {
    const token = session?.access_token;
    const activeServer = serverUrl;

    setSession(null);
    setChannels([]);
    setDirectMessages([]);

    if (token && activeServer) {
      try {
        await logout(activeServer, token);
      } catch {
        // The local in-memory session remains cleared if the server is unavailable.
      }
    }
  }, [serverUrl, session]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#101828" />
      {session ? (
        <HomeScreen
          session={session}
          serverUrl={serverUrl}
          channels={channels}
          directMessages={directMessages}
          refreshing={loadingWorkspace}
          onRefresh={refreshWorkspace}
          onLogout={handleLogout}
        />
      ) : (
        <LoginScreen busy={loadingWorkspace} onLogin={handleLogin} />
      )}
    </SafeAreaProvider>
  );
}
