import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export default function LoginScreen({ busy = false, onLogin }) {
  const [serverUrl, setServerUrl] = useState('');
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>AkshaConnect</Text>
              <Text style={styles.brandTagline}>Work together. Stay connected.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>STANDALONE WORKSPACE</Text>
            <Text style={styles.title}>Sign in to your team</Text>
            <Text style={styles.subtitle}>
              Connect to your AkshaConnect server and use your workspace account.
            </Text>

            <Field label="Server URL" value={serverUrl} onChangeText={setServerUrl}
              placeholder="https://connect.example.com" autoCapitalize="none" keyboardType="url" autoCorrect={false} />
            <Field label="Workspace code" value={workspaceCode} onChangeText={setWorkspaceCode}
              placeholder="Workspace code" autoCapitalize="characters" autoCorrect={false} />
            <Field label="Login name" value={loginName} onChangeText={setLoginName}
              placeholder="Your login name" autoCapitalize="none" autoCorrect={false} />
            <Field label="Password" value={password} onChangeText={setPassword}
              placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false}
              onSubmitEditing={submit} />

            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

            <Pressable disabled={busy} onPress={submit}
              style={({ pressed }) => [styles.button, pressed && !busy ? styles.buttonPressed : null,
                busy ? styles.buttonDisabled : null]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>

            <Text style={styles.footnote}>P1-V8A native mobile foundation</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.textMuted}
        returnKeyType={label === 'Password' ? 'done' : 'next'} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.shell },
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28 },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  brandMark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, marginRight: 14 },
  brandMarkText: { color: '#FFFFFF', fontSize: 27, fontWeight: '800' },
  brandCopy: { flex: 1 },
  brandName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  brandTagline: { marginTop: 2, color: '#A8B3C7', fontSize: 13 },
  card: { borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 20, paddingVertical: 24,
    shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 24, elevation: 10 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { marginTop: 8, color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 8, marginBottom: 20, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  field: { marginTop: 14 },
  label: { marginBottom: 7, color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  input: { height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.input,
    paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  errorBox: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#3A1E24',
    borderWidth: 1, borderColor: '#6C2937' },
  errorText: { color: '#FFB4C2', fontSize: 13, lineHeight: 18 },
  button: { height: 52, marginTop: 20, borderRadius: 14, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  footnote: { marginTop: 18, textAlign: 'center', color: colors.textMuted, fontSize: 11 },
});
