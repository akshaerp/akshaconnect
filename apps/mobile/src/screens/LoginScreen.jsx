import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

const brandMark = require('../assets/brand/akshaconnect-mark.png');

const DEV_DEFAULTS = __DEV__
  ? {
      serverUrl: 'http://127.0.0.1:4100',
      workspaceCode: 'DEV_ALPHA',
      loginName: 'dev-alice',
      password: 'AkshaConnect-Dev-Only-2026!',
    }
  : {
      serverUrl: 'https://connect.akshaerp.com',
      workspaceCode: '',
      loginName: '',
      password: '',
    };

export default function LoginScreen({ busy = false, onLogin }) {
  const [serverUrl, setServerUrl] = useState(DEV_DEFAULTS.serverUrl);
  const [workspaceCode, setWorkspaceCode] = useState(DEV_DEFAULTS.workspaceCode);
  const [loginName, setLoginName] = useState(DEV_DEFAULTS.loginName);
  const [password, setPassword] = useState(DEV_DEFAULTS.password);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;

    setError('');

    try {
      await onLogin({
        serverUrl: serverUrl.trim(),
        workspaceCode: workspaceCode.trim(),
        loginName: loginName.trim(),
        password,
      });
    } catch (requestError) {
      setError(requestError?.message || 'Sign in failed');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios'
              ? 'interactive'
              : 'on-drag'
          }
        >
          <View style={styles.brandArea}>
            <Image source={brandMark} style={styles.brandLogo} resizeMode="contain" />

            <Text style={styles.brandName}>
              <Text style={styles.brandAksha}>Aksha</Text>
              <Text style={styles.brandConnect}>Connect</Text>
            </Text>

            <Text style={styles.brandTagline}>
              PEOPLE  â€¢  TEAMS  â€¢  TOGETHER
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <Text style={styles.eyebrow}>STANDALONE WORKSPACE</Text>
            <Text style={styles.title}>Sign in to your team</Text>
            <Text style={styles.subtitle}>
              Connect to your AkshaConnect server and use your workspace account.
            </Text>

            <Field
              label="Server URL"
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://connect.example.com"
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
            />

            <Field
              label="Workspace code"
              value={workspaceCode}
              onChangeText={setWorkspaceCode}
              placeholder="Workspace code"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Field
              label="Login name"
              value={loginName}
              onChangeText={setLoginName}
              placeholder="Your login name"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={busy}
              onPress={submit}
              style={({ pressed }) => [
                styles.button,
                pressed && !busy ? styles.buttonPressed : null,
                busy ? styles.buttonDisabled : null,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>

            {__DEV__ ? (
              <Text style={styles.devNote}>
                Development credentials prefilled
              </Text>
            ) : null}
          </View>

          <Text style={styles.footer}>
            Simple  â€¢  Secure  â€¢  Connected
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        returnKeyType={label === 'Password' ? 'done' : 'next'}
      />
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
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 22,
  },
  brandLogo: {
    width: 112,
    height: 112,
  },
  brandName: {
    marginTop: 4,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1,
  },
  brandAksha: {
    color: colors.navy,
  },
  brandConnect: {
    color: colors.teal,
  },
  brandTagline: {
    marginTop: 5,
    color: colors.navy,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 22,
    elevation: 5,
    shadowColor: '#0B2D5B',
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  cardAccent: {
    height: 5,
    marginHorizontal: -20,
    marginBottom: 20,
    backgroundColor: colors.teal,
  },
  eyebrow: {
    color: colors.orange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 7,
    color: colors.navy,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 7,
    marginBottom: 8,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    marginTop: 13,
  },
  label: {
    marginBottom: 6,
    color: colors.navy,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    height: 49,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.input,
    paddingHorizontal: 14,
    color: colors.navy,
    fontSize: 14,
  },
  errorBox: {
    marginTop: 14,
    padding: 11,
    borderRadius: 11,
    backgroundColor: '#FFF0F1',
    borderWidth: 1,
    borderColor: '#F3BBC0',
  },
  errorText: {
    color: '#A23B43',
    fontSize: 12,
    lineHeight: 17,
  },
  button: {
    height: 52,
    marginTop: 19,
    borderRadius: 14,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  devNote: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  footer: {
    marginTop: 22,
    textAlign: 'center',
    color: '#66809A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
});
