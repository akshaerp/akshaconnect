import React, { useMemo } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

function initials(name = '') {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || 'AC';
}

export default function HomeScreen({
  session, serverUrl, channels, directMessages, refreshing, onRefresh, onLogout,
}) {
  const identity = session?.identity || {};
  const workspace = session?.workspace || {};
  const membership = session?.membership || {};
  const summary = useMemo(() => ({
    channels: channels.length,
    directMessages: directMessages.length,
  }), [channels.length, directMessages.length]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>A</Text></View>
          <View style={styles.headerCopy}>
            <Text style={styles.productName}>AkshaConnect</Text>
            <Text style={styles.workspaceName} numberOfLines={1}>
              {workspace.workspace_name || workspace.workspace_code || 'Workspace'}
            </Text>
          </View>
        </View>
        <Pressable onPress={onLogout} style={({ pressed }) => [styles.logoutButton, pressed ? styles.pressed : null]}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(identity.display_name)}</Text></View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{identity.display_name || 'AkshaConnect member'}</Text>
            <Text style={styles.profileMeta}>{identity.primary_email || membership.member_role || 'Member'}</Text>
          </View>
          <View style={styles.connectedPill}>
            <View style={styles.connectedDot} /><Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>

        <View style={styles.serverCard}>
          <Text style={styles.serverLabel}>SERVER</Text>
          <Text style={styles.serverValue} numberOfLines={2}>{serverUrl}</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard value={summary.channels} label="Channels" />
          <StatCard value={summary.directMessages} label="Direct messages" />
        </View>

        <SectionHeader title="Channels" count={channels.length} />
        <View style={styles.listCard}>
          {channels.length === 0 ? <EmptyState text="No channels available yet." /> :
            channels.map((channel, index) => (
              <Row key={channel.channel_id || channel.conversation_id} first={index === 0} icon="#"
                title={channel.channel_name || 'Channel'}
                subtitle={channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel'} />
            ))}
        </View>

        <SectionHeader title="Direct messages" count={directMessages.length} />
        <View style={styles.listCard}>
          {directMessages.length === 0 ? <EmptyState text="No direct messages yet." /> :
            directMessages.map((dm, index) => (
              <Row key={dm.conversation_id} first={index === 0} icon={initials(dm.other_display_name)}
                title={dm.other_display_name || 'Member'}
                subtitle={dm.other_primary_email || 'Direct message'} avatar />
            ))}
        </View>

        {refreshing ? (
          <View style={styles.refreshing}><ActivityIndicator color={colors.accent} />
            <Text style={styles.refreshingText}>Refreshing workspace…</Text></View>
        ) : null}

        <Text style={styles.phaseNote}>
          P1-V8A V1 proves native sign-in and workspace navigation against the existing AkshaConnect API.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ value, label }) {
  return <View style={styles.statCard}><Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text></View>;
}
function SectionHeader({ title, count }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.countPill}><Text style={styles.countText}>{count}</Text></View></View>;
}
function Row({ first, icon, title, subtitle, avatar = false }) {
  return (
    <View style={[styles.row, first ? styles.firstRow : null]}>
      <View style={avatar ? styles.rowAvatar : styles.rowIcon}>
        <Text style={avatar ? styles.rowAvatarText : styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}
function EmptyState({ text }) {
  return <View style={styles.emptyState}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.shell },
  header: { minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#263247' },
  headerBrand: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, marginRight: 11 },
  brandMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  headerCopy: { flex: 1 },
  productName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  workspaceName: { marginTop: 1, color: '#A8B3C7', fontSize: 12 },
  logoutButton: { marginLeft: 12, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#1C2739' },
  logoutText: { color: '#DCE5F3', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  page: { padding: 16, paddingBottom: 36 },
  profileCard: { padding: 16, borderRadius: 20, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#263C68', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#D8E6FF', fontSize: 17, fontWeight: '800' },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  profileMeta: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  connectedPill: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 999,
    backgroundColor: '#173628', flexDirection: 'row', alignItems: 'center' },
  connectedDot: { width: 7, height: 7, borderRadius: 999, marginRight: 6, backgroundColor: colors.success },
  connectedText: { color: '#A7F3C7', fontSize: 10, fontWeight: '800' },
  serverCard: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: '#131E2E',
    borderWidth: 1, borderColor: colors.border },
  serverLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  serverValue: { marginTop: 5, color: '#D8E3F2', fontSize: 12, lineHeight: 17 },
  statsRow: { marginTop: 12, flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 18, backgroundColor: colors.surface },
  statValue: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  statLabel: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  sectionHeader: { marginTop: 24, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  countPill: { marginLeft: 8, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#263247' },
  countText: { color: '#C9D4E5', fontSize: 11, fontWeight: '800' },
  listCard: { overflow: 'hidden', borderRadius: 18, backgroundColor: colors.surface },
  row: { minHeight: 67, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  firstRow: { borderTopWidth: 0 },
  rowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#1A2840', alignItems: 'center', justifyContent: 'center' },
  rowIconText: { color: '#91A9D1', fontSize: 18, fontWeight: '800' },
  rowAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#263C68', alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: '#D8E6FF', fontSize: 11, fontWeight: '800' },
  rowCopy: { flex: 1, marginLeft: 12 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowSubtitle: { marginTop: 3, color: colors.textMuted, fontSize: 11 },
  chevron: { marginLeft: 8, color: '#6F829D', fontSize: 24 },
  emptyState: { paddingVertical: 22, paddingHorizontal: 15 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  refreshing: { marginTop: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  refreshingText: { marginLeft: 8, color: colors.textSecondary, fontSize: 12 },
  phaseNote: { marginTop: 24, color: '#64758E', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
