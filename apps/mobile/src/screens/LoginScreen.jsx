import React, { useMemo, useState } from 'react';
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
const brandWordmark = require('../assets/brand/akshaconnect-wordmark.png');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export default function LoginScreen({
  busy = false,
  organizations = [],
  discoveryEmail = '',
  error = '',
  onDiscover,
  onChooseOrganization,
  onReset,
  savedAccountCount = 0,
  onShowSavedAccounts,
}) {
  const [email, setEmail] = useState(discoveryEmail);
  const hasResults = organizations.length > 0;

  const helper = useMemo(() => {
    if (hasResults) {
      return `Choose the organization you want to connect as ${discoveryEmail}.`;
    }
    return 'Enter your work email. We will find your organization and its sign-in method.';
  }, [discoveryEmail, hasResults]);

  async function submit() {
    if (busy) return;
    const value = normalizeEmail(email);
    if (!value) return;
    await onDiscover?.(value);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandArea}>
            <Image source={brandMark} style={styles.brandLogo} resizeMode="contain" />
            <Image source={brandWordmark} style={styles.brandWordmark} resizeMode="contain" />
            <Text style={styles.brandTagline}>PEOPLE  •  IDEAS  •  TOGETHER</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardAccent} />

            <Text style={styles.eyebrow}>ONE APP · ALL YOUR COMPANIES</Text>
            <Text style={styles.title}>
              {hasResults ? 'Choose your organization' : 'Find your organization'}
            </Text>
            <Text style={styles.subtitle}>{helper}</Text>

            {!hasResults ? (
              <>
                <Text style={styles.label}>Work email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@company.com"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  editable={!busy}
                  style={styles.input}
                />

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  disabled={busy || !normalizeEmail(email)}
                  onPress={submit}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !busy ? styles.buttonPressed : null,
                    busy || !normalizeEmail(email) ? styles.buttonDisabled : null,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Continue</Text>
                  )}
                </Pressable>

                <Text style={styles.securityNote}>
                  Your email is used only to discover eligible organizations. Your company sign-in provider verifies who you are.
                </Text>

                {savedAccountCount > 0 ? (
                  <Pressable onPress={onShowSavedAccounts} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      Use a saved organization ({savedAccountCount})
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.organizationList}>
                  {organizations.map((organization) => (
                    <Pressable
                      key={`${organization.tenant_id}:${organization.provider_code}`}
                      disabled={busy}
                      onPress={() => onChooseOrganization?.(organization, discoveryEmail)}
                      style={({ pressed }) => [
                        styles.organizationCard,
                        pressed && !busy ? styles.organizationCardPressed : null,
                      ]}
                    >
                      <View style={styles.organizationIcon}>
                        <Text style={styles.organizationIconText}>
                          {String(organization.tenant_name || 'A').trim().slice(0, 1).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.organizationCopy}>
                        <Text style={styles.organizationName} numberOfLines={2}>
                          {organization.tenant_name}
                        </Text>
                        <Text style={styles.organizationProvider}>
                          {organization.sign_in_label || `Continue with ${organization.provider_code}`}
                        </Text>
                      </View>

                      <Text style={styles.organizationArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>

                {busy ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.busyText}>Opening secure company sign-in…</Text>
                  </View>
                ) : null}

                <Pressable disabled={busy} onPress={onReset} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Use a different email</Text>
                </Pressable>
              </>
            )}
          </View>

          <Text style={styles.footer}>A BRIGHTER WORKPLACE TOGETHER</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.shell },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  brandArea: { alignItems: 'center', marginBottom: 12 },
  brandLogo: { width: 88, height: 88 },
  brandWordmark: { width: 240, height: 54, marginTop: 2 },
  brandTagline: {
    marginTop: 4,
    color: colors.navy,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.1,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 18,
    elevation: 5,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  cardAccent: {
    height: 5,
    marginHorizontal: -20,
    marginBottom: 14,
    backgroundColor: colors.primary,
  },
  eyebrow: {
    color: colors.brandOrange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
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
    marginBottom: 14,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    marginBottom: 7,
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
    fontSize: 15,
  },
  primaryButton: {
    height: 50,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  buttonPressed: { opacity: 0.86 },
  buttonDisabled: { opacity: 0.5 },
  errorBox: {
    marginTop: 12,
    padding: 11,
    borderRadius: 11,
    backgroundColor: '#FFF0F1',
    borderWidth: 1,
    borderColor: '#F3BBC0',
  },
  errorText: { color: '#A23B43', fontSize: 12, lineHeight: 17 },
  securityNote: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  organizationList: { gap: 10 },
  organizationCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: '#FAFCFE',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  organizationCardPressed: { backgroundColor: '#F1F7FD' },
  organizationIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FC',
  },
  organizationIconText: { color: colors.primary, fontSize: 19, fontWeight: '900' },
  organizationCopy: { flex: 1, marginLeft: 12 },
  organizationName: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  organizationProvider: { marginTop: 4, color: colors.textSecondary, fontSize: 11.5, fontWeight: '600' },
  organizationArrow: { color: colors.primary, fontSize: 30, lineHeight: 32, marginLeft: 8 },
  busyRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  footer: {
    marginTop: 12,
    textAlign: 'center',
    color: '#66809A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
