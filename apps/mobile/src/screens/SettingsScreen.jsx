import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  const updateAvailable =
    updateStatus === 'available' ||
    updateStatus === 'required';

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
        <SettingRow
          label="Automatic update checks"
          value="On at app launch"
        />
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
        <SettingRow
          label="Realtime"
          value={connectionLabel(realtimeStatus)}
        />
        <Divider />
        <SettingRow
          label="Server"
          value={serverUrl}
          multiline
        />
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

function SettingRow({
  label,
  value,
  accent = false,
  multiline = false,
}) {
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

function ActionRow({
  label,
  detail,
  onPress,
  primary = false,
  loading = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.actionRow,
        pressed ? styles.pressed : null,
      ]}
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
  page: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 34,
    backgroundColor: colors.shell,
  },
  hero: {
    marginBottom: 6,
    padding: 16,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FC',
  },
  avatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  heroCopy: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  email: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 11.5,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 7,
    marginLeft: 4,
    color: '#7890A6',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  row: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    flex: 1,
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  rowValue: {
    maxWidth: '55%',
    marginLeft: 12,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  rowValueAccent: {
    color: colors.brandOrange,
    fontWeight: '900',
  },
  rowValueMultiline: {
    lineHeight: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    backgroundColor: colors.border,
  },
  notesRow: {
    padding: 14,
    backgroundColor: '#F8FBFF',
  },
  notesLabel: {
    color: '#7890A6',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  notesText: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCopy: {
    flex: 1,
  },
  actionLabel: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  actionPrimary: {
    color: colors.primary,
  },
  actionDetail: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  chevron: {
    marginLeft: 12,
    color: '#8AA0B5',
    fontSize: 24,
    fontWeight: '500',
  },
  signOutButton: {
    minHeight: 48,
    marginTop: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0C9C9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8F8',
  },
  signOutText: {
    color: '#A83232',
    fontSize: 13,
    fontWeight: '900',
  },
  footer: {
    marginTop: 20,
    color: '#8BA0B4',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
