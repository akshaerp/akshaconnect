import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

const brandMark = require('../assets/brand/akshaconnect-mark.png');

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

function realtimeLabel(status) {
  if (status === 'connected') return 'Live';
  if (status === 'connecting') return 'Connecting';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}

export default function HomeScreen({
  session,
  serverUrl,
  channels,
  directMessages,
  unreadCounts,
  refreshing,
  realtimeStatus,
  onRefresh,
  onLogout,
  onOpenConversation,
}) {
  const identity = session?.identity || {};
  const workspace = session?.workspace || {};
  const membership = session?.membership || {};
  const [activeTab, setActiveTab] = useState('chats');

  const unreadSummary = useMemo(() => {
    const channelUnread = channels.reduce(
      (total, channel) =>
        total + Number(unreadCounts?.[channel.conversation_id] || 0),
      0
    );

    const directMessageUnread = directMessages.reduce(
      (total, dm) =>
        total + Number(unreadCounts?.[dm.conversation_id] || 0),
      0
    );

    return {
      channels: channelUnread,
      directMessages: directMessageUnread,
    };
  }, [channels, directMessages, unreadCounts]);

  const live = realtimeStatus === 'connected';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image source={brandMark} style={styles.brandLogo} resizeMode="contain" />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandText}>
              <Text style={styles.brandAksha}>Aksha</Text>
              <Text style={styles.brandConnect}>Connect</Text>
            </Text>
            <Text style={styles.workspaceName} numberOfLines={1}>
              {workspace.workspace_name || workspace.workspace_code || 'Workspace'}
            </Text>
          </View>
        </View>

        <View style={[styles.livePill, live ? styles.livePillOn : styles.livePillOff]}>
          <View style={[styles.liveDot, live ? styles.liveDotOn : styles.liveDotOff]} />
          <Text style={[styles.liveText, live ? styles.liveTextOn : styles.liveTextOff]}>
            {realtimeLabel(realtimeStatus)}
          </Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TopTab
          label="Chats"
          active={activeTab === 'chats'}
          unread={unreadSummary.directMessages}
          onPress={() => setActiveTab('chats')}
        />
        <TopTab
          label="Channels"
          active={activeTab === 'channels'}
          unread={unreadSummary.channels}
          onPress={() => setActiveTab('channels')}
        />
        <TopTab
          label="Profile"
          active={activeTab === 'profile'}
          onPress={() => setActiveTab('profile')}
        />
      </View>

      {activeTab === 'profile' ? (
        <ScrollView
          contentContainerStyle={styles.profilePage}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.teal}
            />
          }
        >
          <View style={styles.profileHero}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {initials(identity.display_name)}
              </Text>
            </View>
            <Text style={styles.profileName}>
              {identity.display_name || 'AkshaConnect member'}
            </Text>
            <Text style={styles.profileEmail}>
              {identity.primary_email || membership.member_role || 'Member'}
            </Text>
          </View>

          <InfoCard label="WORKSPACE" value={workspace.workspace_name || workspace.workspace_code || 'Workspace'} />
          <InfoCard label="SERVER" value={serverUrl} />
          <InfoCard label="CONNECTION" value={realtimeLabel(realtimeStatus)} />

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
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.page}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.teal}
            />
          }
        >
          <View style={styles.sectionIntro}>
            <View>
              <Text style={styles.sectionTitle}>
                {activeTab === 'chats' ? 'Direct messages' : 'Channels'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {activeTab === 'chats'
                  ? 'Your conversations'
                  : 'Team spaces'}
              </Text>
            </View>

            {refreshing ? (
              <ActivityIndicator color={colors.teal} />
            ) : null}
          </View>

          <View style={styles.listCard}>
            {activeTab === 'chats' ? (
              directMessages.length === 0 ? (
                <EmptyState text="No direct messages yet." />
              ) : (
                directMessages.map((dm, index) => (
                  <ConversationRow
                    key={dm.conversation_id}
                    first={index === 0}
                    avatar
                    icon={initials(dm.other_display_name)}
                    title={dm.other_display_name || 'Member'}
                    subtitle={dm.other_primary_email || 'Direct message'}
                    unreadCount={unreadCounts?.[dm.conversation_id] || 0}
                    onPress={() =>
                      onOpenConversation({
                        kind: 'dm',
                        conversationId: dm.conversation_id,
                        title: dm.other_display_name || 'Member',
                        subtitle: dm.other_primary_email || 'Direct message',
                      })
                    }
                  />
                ))
              )
            ) : channels.length === 0 ? (
              <EmptyState text="No channels available yet." />
            ) : (
              channels.map((channel, index) => (
                <ConversationRow
                  key={channel.channel_id || channel.conversation_id}
                  first={index === 0}
                  icon="#"
                  title={channel.channel_name || 'Channel'}
                  subtitle={
                    channel.visibility === 'PRIVATE'
                      ? 'Private channel'
                      : 'Public channel'
                  }
                  unreadCount={unreadCounts?.[channel.conversation_id] || 0}
                  onPress={() =>
                    onOpenConversation({
                      kind: 'channel',
                      conversationId: channel.conversation_id,
                      title: channel.channel_name || 'Channel',
                      subtitle:
                        channel.visibility === 'PRIVATE'
                          ? 'Private channel'
                          : 'Public channel',
                    })
                  }
                />
              ))
            )}
          </View>

          <View style={styles.brandFooter}>
            <Text style={styles.brandFooterText}>
              Simple  •  Secure  •  Connected
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TopTab({ label, active, unread = 0, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.tabLabelRow}>
        <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
          {label}
        </Text>
        {unread > 0 ? (
          <View style={styles.sectionUnreadPill}>
            <Text style={styles.sectionUnreadText}>
              {Math.min(99, Number(unread || 0))}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.tabIndicator, active ? styles.tabIndicatorActive : null]} />
    </Pressable>
  );
}

function ConversationRow({
  first,
  icon,
  title,
  subtitle,
  avatar = false,
  unreadCount = 0,
  onPress,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first ? styles.firstRow : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={avatar ? styles.rowAvatar : styles.rowIcon}>
        <Text style={avatar ? styles.rowAvatarText : styles.rowIconText}>
          {icon}
        </Text>
      </View>

      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {unreadCount > 0 ? (
        <View style={styles.rowUnreadPill}>
          <Text style={styles.rowUnreadText}>
            {Math.min(99, Number(unreadCount || 0))}
          </Text>
        </View>
      ) : null}

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function EmptyState({ text }) {
  return (
    <View style={styles.emptyState}>
      <Image source={brandMark} style={styles.emptyLogo} resizeMode="contain" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function InfoCard({ label, value }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navy,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 44,
    height: 44,
    marginRight: 10,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  brandAksha: {
    color: '#FFFFFF',
  },
  brandConnect: {
    color: colors.teal,
  },
  workspaceName: {
    marginTop: 1,
    color: '#BCD0E2',
    fontSize: 10,
    fontWeight: '600',
  },
  livePill: {
    marginLeft: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePillOn: {
    backgroundColor: '#0E4C4A',
  },
  livePillOff: {
    backgroundColor: '#4A3823',
  },
  liveDot: {
    width: 6,
    height: 6,
    marginRight: 5,
    borderRadius: 99,
  },
  liveDotOn: {
    backgroundColor: '#50E3C2',
  },
  liveDotOff: {
    backgroundColor: colors.orange,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
  },
  liveTextOn: {
    color: '#CBFFF3',
  },
  liveTextOff: {
    color: '#FFE2BC',
  },
  tabs: {
    height: 54,
    flexDirection: 'row',
    backgroundColor: colors.navy,
  },
  tab: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  tabLabelRow: {
    flex: 1,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    color: '#B9C9D9',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionUnreadPill: {
    minWidth: 20,
    height: 20,
    marginLeft: 6,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  sectionUnreadText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  tabIndicator: {
    height: 3,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: colors.teal,
  },
  page: {
    paddingBottom: 32,
  },
  sectionIntro: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
  },
  row: {
    minHeight: 74,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  firstRow: {
    borderTopWidth: 0,
  },
  rowPressed: {
    backgroundColor: '#F0F7F8',
  },
  rowAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6F7F4',
  },
  rowAvatarText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '900',
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
  },
  rowIconText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  rowCopy: {
    flex: 1,
    marginLeft: 13,
  },
  rowTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  rowSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  rowUnreadPill: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  rowUnreadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  chevron: {
    marginLeft: 9,
    color: '#9AAFC2',
    fontSize: 24,
  },
  profilePage: {
    padding: 18,
    paddingBottom: 36,
  },
  profileHero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  profileName: {
    marginTop: 12,
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  profileEmail: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 12,
  },
  infoCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  infoLabel: {
    color: colors.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  infoValue: {
    marginTop: 5,
    color: colors.navy,
    fontSize: 13,
    lineHeight: 18,
  },
  signOutButton: {
    height: 50,
    marginTop: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyState: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  emptyLogo: {
    width: 72,
    height: 72,
    opacity: 0.22,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
  },
  brandFooter: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  brandFooterText: {
    color: '#66809A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
  },
  pressed: {
    opacity: 0.78,
  },
});
