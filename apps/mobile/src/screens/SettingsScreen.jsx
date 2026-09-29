import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  getOwnPresenceProfile,
  updateOwnPresenceProfile,
} from '../api/client';
import { colors } from '../theme/colors';

function initials(name = '') {
  return (
    String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'AC'
  );
}

function connectionLabel(status) {
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}

function updateLabel(status) {
  if (status === 'checking') return 'Checking…';
  if (status === 'required') return 'Update required';
  if (status === 'available') return 'Update available';
  if (status === 'current') return 'Up to date';
  if (status === 'error') return 'Could not check';
  return 'Not checked';
}

function expiryLabel(value) {
  if (!value) return 'No expiry';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No expiry';
  return `Until ${parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function expiryFromHours(hours) {
  if (!hours) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export default function SettingsScreen({
  session,
  serverUrl,
  realtimeStatus,
  organizationName,
  appVersion,
  updatePolicy,
  updateStatus,
  onCheckForUpdates,
  onOpenUpdate,
  onOpenDeviceSettings,
  onOpenAccountSwitcher,
  onLogout,
}) {
  const identity = session?.identity || {};
  const workspace = session?.workspace || {};
  const token = session?.access_token || '';
  const updateAvailable =
    updateStatus === 'available' ||
    updateStatus === 'required';

  const [statusText, setStatusText] = useState('');
  const [statusExpiry, setStatusExpiry] = useState(null);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [presenceError, setPresenceError] = useState('');
  const [presenceSaved, setPresenceSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!serverUrl || !token) return undefined;

    setPresenceLoading(true);
    setPresenceError('');
    getOwnPresenceProfile(serverUrl, token)
      .then((result) => {
        if (cancelled) return;
        const profile = result?.presence_profile || {};
        setStatusText(String(profile.custom_status || ''));
        setStatusExpiry(profile.status_expires_at || null);
      })
      .catch((error) => {
        if (!cancelled) {
          setPresenceError(error?.message || 'Could not load your status');
        }
      })
      .finally(() => {
        if (!cancelled) setPresenceLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverUrl, token]);

  const statusExpiryText = useMemo(
    () => expiryLabel(statusExpiry),
    [statusExpiry]
  );

  async function savePresence() {
    if (!serverUrl || !token || presenceSaving) return;
    setPresenceSaving(true);
    setPresenceError('');
    setPresenceSaved('');

    try {
      const result = await updateOwnPresenceProfile(serverUrl, token, {
        customStatus: statusText.trim(),
        statusExpiresAt: statusText.trim() ? statusExpiry : null,
      });
      const profile = result?.presence_profile || {};
      setStatusText(String(profile.custom_status || ''));
      setStatusExpiry(profile.status_expires_at || null);
      setPresenceSaved('Status updated');
    } catch (error) {
      setPresenceError(error?.message || 'Could not update your status');
    } finally {
      setPresenceSaving(false);
    }
  }

  function clearPresence() {
    setStatusText('');
    setStatusExpiry(null);
    setPresenceSaved('');
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {initials(identity.display_name)}
          </Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.name}>
            {identity.display_name || 'AkshaConnect member'}
          </Text>
          <Text style={styles.email}>
            {identity.primary_email || 'Member'}
          </Text>
        </View>
      </View>

      <SectionTitle title="STATUS" />
      <SettingCard>
        <View style={styles.statusBlock}>
          <View style={styles.statusHeadingRow}>
            <Text style={styles.statusHeading}>Custom status</Text>
            {presenceLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
          <TextInput
            value={statusText}
            onChangeText={(value) => {
              setStatusText(value);
              setPresenceSaved('');
            }}
            placeholder="What are you working on?"
            placeholderTextColor="#8AA0B5"
            maxLength={120}
            style={styles.statusInput}
          />
          <Text style={styles.statusExpiry}>{statusExpiryText}</Text>
          <View style={styles.expiryOptions}>
            <ExpiryButton label="1 hour" onPress={() => setStatusExpiry(expiryFromHours(1))} />
            <ExpiryButton label="4 hours" onPress={() => setStatusExpiry(expiryFromHours(4))} />
            <ExpiryButton label="1 day" onPress={() => setStatusExpiry(expiryFromHours(24))} />
            <ExpiryButton label="No expiry" onPress={() => setStatusExpiry(null)} />
          </View>
          {presenceError ? <Text style={styles.statusError}>{presenceError}</Text> : null}
          {presenceSaved ? <Text style={styles.statusSaved}>{presenceSaved}</Text> : null}
          <View style={styles.statusActions}>
            <Pressable onPress={clearPresence} style={styles.statusSecondaryButton}>
              <Text style={styles.statusSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={savePresence}
              disabled={presenceSaving || presenceLoading}
              style={styles.statusPrimaryButton}
            >
              <Text style={styles.statusPrimaryText}>
                {presenceSaving ? 'Saving…' : 'Save status'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SettingCard>

      <SectionTitle title="ACCOUNT" />
      <SettingCard>
        <SettingRow label="Organization" value={organizationName} />
        <Divider />
        <SettingRow
          label="Workspace"
          value={workspace.workspace_name || workspace.workspace_code || 'Workspace'}
        />
        <Divider />
        <ActionRow
          label="Manage organizations"
          detail="Switch or add an organization"
          onPress={onOpenAccountSwitcher}
        />
      </SettingCard>

      <SectionTitle title="APP" />
      <SettingCard>
        <SettingRow
          label="Installed version"
          value={appVersion?.versionName || 'Unknown'}
        />
        <Divider />
        <SettingRow
          label="Update status"
          value={updateLabel(updateStatus)}
          accent={updateAvailable}
        />
        {updatePolicy?.release_notes ? (
          <>
            <Divider />
            <View style={styles.notesRow}>
              <Text style={styles.notesLabel}>WHAT'S NEW</Text>
              <Text style={styles.notesText}>{updatePolicy.release_notes}</Text>
            </View>
          </>
        ) : null}
        <Divider />
        {updateAvailable ? (
          <ActionRow
            label="Update AkshaConnect"
            detail={updatePolicy?.latest_version_name || 'New version available'}
            onPress={onOpenUpdate}
            primary
          />
        ) : (
          <ActionRow
            label="Check for updates"
            detail="Checks the AkshaConnect release policy"
            onPress={onCheckForUpdates}
            loading={updateStatus === 'checking'}
          />
        )}
        <Divider />
        <SettingRow label="Automatic update checks" value="On at app launch" />
      </SettingCard>

      <SectionTitle title="DEVICE" />
      <SettingCard>
        <ActionRow
          label="App permissions & notifications"
          detail="Open Android settings for AkshaConnect"
          onPress={onOpenDeviceSettings}
        />
      </SettingCard>

      <SectionTitle title="CONNECTION" />
      <SettingCard>
        <SettingRow label="Realtime" value={connectionLabel(realtimeStatus)} />
        <Divider />
        <SettingRow label="Server" value={serverUrl} multiline />
      </SettingCard>

      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.footer}>AkshaConnect • People • Ideas • Together</Text>
    </ScrollView>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function SettingCard({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function ExpiryButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.expiryButton}>
      <Text style={styles.expiryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SettingRow({ label, value, accent = false, multiline = false }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          accent ? styles.rowValueAccent : null,
          multiline ? styles.rowValueMultiline : null,
        ]}
        numberOfLines={multiline ? 2 : 1}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

function ActionRow({ label, detail, onPress, primary = false, loading = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, primary ? styles.actionPrimary : null]}>
          {label}
        </Text>
        {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={[styles.chevron, primary ? styles.actionPrimary : null]}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 34, backgroundColor: colors.shell },
  hero: { marginBottom: 6, padding: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F1FC' },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  heroCopy: { flex: 1, marginLeft: 12 },
  name: { color: colors.navy, fontSize: 16, fontWeight: '900' },
  email: { marginTop: 3, color: colors.textMuted, fontSize: 11.5 },
  sectionTitle: { marginTop: 18, marginBottom: 7, marginLeft: 4, color: '#7890A6', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  card: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' },
  row: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { flex: 1, color: colors.navy, fontSize: 13, fontWeight: '700' },
  rowValue: { maxWidth: '55%', marginLeft: 12, color: colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  rowValueAccent: { color: colors.brandOrange, fontWeight: '900' },
  rowValueMultiline: { lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14, backgroundColor: colors.border },
  notesRow: { padding: 14, backgroundColor: '#F8FBFF' },
  notesLabel: { color: '#7890A6', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  notesText: { marginTop: 5, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  actionRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  actionCopy: { flex: 1 },
  actionLabel: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  actionPrimary: { color: colors.primary },
  actionDetail: { marginTop: 3, color: colors.textMuted, fontSize: 10.5, lineHeight: 15 },
  chevron: { marginLeft: 12, color: '#8AA0B5', fontSize: 24, fontWeight: '500' },
  statusBlock: { padding: 14 },
  statusHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusHeading: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  statusInput: { marginTop: 10, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.navy, backgroundColor: '#FBFDFF' },
  statusExpiry: { marginTop: 8, color: colors.textMuted, fontSize: 11 },
  expiryOptions: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  expiryButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F8FBFF' },
  expiryButtonText: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800' },
  statusActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  statusSecondaryButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  statusSecondaryText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '800' },
  statusPrimaryButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.primary },
  statusPrimaryText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
  statusError: { marginTop: 8, color: '#A83232', fontSize: 11 },
  statusSaved: { marginTop: 8, color: '#257044', fontSize: 11, fontWeight: '700' },
  signOutButton: { minHeight: 48, marginTop: 22, borderRadius: 14, borderWidth: 1, borderColor: '#F0C9C9', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8F8' },
  signOutText: { color: '#A83232', fontSize: 13, fontWeight: '900' },
  footer: { marginTop: 20, color: '#8BA0B4', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
