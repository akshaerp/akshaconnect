import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Text from '../theme/AppText';
import TextInput from '../theme/AppTextInput';
import { colors } from '../theme/colors';
import { useAppAppearance } from '../theme/appearanceStore';
import SettingsScreen from './SettingsScreen.jsx';
import SavedMessagesScreen from './SavedMessagesScreen.jsx';

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
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}

function presenceLabel(status) {
  if (status === 'LIVE') return 'Online';
  if (status === 'AWAY') return 'Away';
  return 'Offline';
}

function presenceStyle(status) {
  if (status === 'LIVE') return styles.presenceLive;
  if (status === 'AWAY') return styles.presenceAway;
  return styles.presenceUnavailable;
}

export default function HomeScreen({
  session,
  serverUrl,
  channels,
  directMessages,
  unreadCounts,
  presenceByMember,
  presenceProfilesByMember,
  refreshing,
  realtimeStatus,
  onRefresh,
  onLogout,
  onOpenConversation,
  onSearchMembers,
  onStartDirectMessage,
  onCreateChannel,
  onOpenAccountSwitcher,
  appVersion,
  updatePolicy,
  updateStatus,
  onCheckForUpdates,
  onOpenUpdate,
  onOpenDeviceSettings,
}) {
  const { palette } = useAppAppearance();
  const tenant = session?.tenant || {};
  const workspace = session?.workspace || {};
  const membership = session?.membership || {};
  const [activeTab, setActiveTab] = useState('chats');
  const [chatFilter, setChatFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [composerMode, setComposerMode] = useState(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [busyMemberId, setBusyMemberId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelVisibility, setChannelVisibility] = useState('PUBLIC');
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelError, setChannelError] = useState('');

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

  const filteredDirectMessages = useMemo(() => {
    const query = chatFilter.trim().toLowerCase();
    if (!query) return directMessages;

    return directMessages.filter((dm) =>
      [dm.other_display_name, dm.other_primary_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [chatFilter, directMessages]);

  const filteredChannels = useMemo(() => {
    const query = channelFilter.trim().toLowerCase();
    if (!query) return channels;

    return channels.filter((channel) =>
      [channel.channel_name, channel.channel_code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [channelFilter, channels]);

  useEffect(() => {
    if (composerMode !== 'dm' || typeof onSearchMembers !== 'function') {
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setMemberLoading(true);
      setMemberError('');

      Promise.resolve(onSearchMembers(memberQuery))
        .then((members) => {
          if (!cancelled) setMemberResults(members || []);
        })
        .catch((error) => {
          if (!cancelled) {
            setMemberResults([]);
            setMemberError(error?.message || 'Could not search workspace members.');
          }
        })
        .finally(() => {
          if (!cancelled) setMemberLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [composerMode, memberQuery, onSearchMembers]);

  const availableMembers = memberResults.filter(
    (member) => member.workspace_member_id !== membership.workspace_member_id
  );

  const closeComposer = () => {
    setComposerMode(null);
    setMemberQuery('');
    setMemberResults([]);
    setMemberError('');
    setBusyMemberId('');
    setChannelName('');
    setChannelVisibility('PUBLIC');
    setChannelError('');
    setChannelBusy(false);
  };

  const chooseMember = async (member) => {
    const memberId = member?.workspace_member_id || '';
    if (!memberId || typeof onStartDirectMessage !== 'function') return;

    setBusyMemberId(memberId);
    setMemberError('');
    try {
      await onStartDirectMessage(member);
      closeComposer();
    } catch (error) {
      setMemberError(error?.message || 'Could not start direct message.');
    } finally {
      setBusyMemberId('');
    }
  };

  const submitChannel = async () => {
    if (typeof onCreateChannel !== 'function') return;
    const name = channelName.trim();
    if (!name) {
      setChannelError('Channel name is required.');
      return;
    }

    setChannelBusy(true);
    setChannelError('');
    try {
      await onCreateChannel({
        channelName: name,
        visibility: channelVisibility,
      });
      closeComposer();
    } catch (error) {
      setChannelError(error?.message || 'Could not create channel.');
    } finally {
      setChannelBusy(false);
    }
  };

  const live = realtimeStatus === 'connected';
  const organizationName =
    tenant.tenant_name ||
    workspace.workspace_name ||
    workspace.workspace_code ||
    'Workspace';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.shell }]} edges={['top', 'bottom']}>
      <View style={[styles.topBar, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch organization"
          onPress={onOpenAccountSwitcher}
          style={({ pressed }) => [
            styles.brandRow,
            pressed ? styles.brandRowPressed : null,
          ]}
        >
          <Image source={brandMark} style={styles.brandLogo} resizeMode="contain" />
          <View style={styles.brandTextWrap}>
            <Text
              style={styles.brandText}
              numberOfLines={1}
            >
              <Text style={styles.brandAksha}>Aksha</Text>
              <Text style={styles.brandConnect}>Connect</Text>
            </Text>
            <View style={styles.organizationLine}>
              <Text style={styles.organizationName} numberOfLines={1}>
                {organizationName}
              </Text>
              <Text style={styles.organizationChevron}>⌄</Text>
            </View>
          </View>
        </Pressable>

        <View style={[styles.livePill, live ? styles.livePillOn : styles.livePillOff]}>
          <View style={[styles.liveDot, live ? styles.liveDotOn : styles.liveDotOff]} />
          <Text style={[styles.liveText, live ? styles.liveTextOn : styles.liveTextOff]}>
            {realtimeLabel(realtimeStatus)}
          </Text>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
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
          label="Saved"
          active={activeTab === 'saved'}
          onPress={() => setActiveTab('saved')}
        />
        <TopTab
          label="Settings"
          active={activeTab === 'settings'}
          onPress={() => setActiveTab('settings')}
        />
      </View>

      {activeTab === 'settings' ? (
        <SettingsScreen
          session={session}
          serverUrl={serverUrl}
          realtimeStatus={realtimeStatus}
          organizationName={organizationName}
          appVersion={appVersion}
          updatePolicy={updatePolicy}
          updateStatus={updateStatus}
          onCheckForUpdates={onCheckForUpdates}
          onOpenUpdate={onOpenUpdate}
          onOpenDeviceSettings={onOpenDeviceSettings}
          onOpenAccountSwitcher={onOpenAccountSwitcher}
          onLogout={onLogout}
        />
      ) : activeTab === 'saved' ? (
        <SavedMessagesScreen
          session={session}
          onOpenConversation={onOpenConversation}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.page, { backgroundColor: palette.shell }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.teal}
            />
          }
        >
          <View style={[styles.sectionIntro, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
                {activeTab === 'chats' ? 'Direct messages' : 'Channels'}
              </Text>
              <Text style={[styles.sectionSubtitle, { color: palette.textMuted }]}>
                {activeTab === 'chats'
                  ? 'Your conversations'
                  : 'Team spaces'}
              </Text>
            </View>

            <View style={styles.sectionActions}>
              {refreshing ? (
                <ActivityIndicator color={colors.teal} />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  activeTab === 'chats' ? 'Start new chat' : 'Create new channel'
                }
                onPress={() =>
                  setComposerMode(activeTab === 'chats' ? 'dm' : 'channel')
                }
                style={({ pressed }) => [
                  styles.newButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={styles.newButtonText}
                  numberOfLines={1}
                >
                  {activeTab === 'chats' ? '+ New chat' : '+ New channel'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.listSearchWrap, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
            <TextInput
              value={activeTab === 'chats' ? chatFilter : channelFilter}
              onChangeText={
                activeTab === 'chats' ? setChatFilter : setChannelFilter
              }
              placeholder={
                activeTab === 'chats' ? 'Search chats' : 'Search channels'
              }
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.listSearchInput, { backgroundColor: palette.input, borderColor: palette.border, color: palette.textPrimary }]}
            />
          </View>

          <View style={[styles.listCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {activeTab === 'chats' ? (
              filteredDirectMessages.length === 0 ? (
                <EmptyState text={chatFilter ? "No matching chats." : "No direct messages yet."} />
              ) : (
                filteredDirectMessages.map((dm, index) => (
                  <ConversationRow
                    key={dm.conversation_id}
                    first={index === 0}
                    avatar
                    icon={initials(dm.other_display_name)}
                    title={dm.other_display_name || 'Member'}
                    subtitle={dm.other_primary_email || 'Direct message'}
                    presenceStatus={
                      presenceByMember?.[
                        dm.other_workspace_member_id
                      ] || 'NOT_AVAILABLE'
                    }
                    presenceProfile={
                      presenceProfilesByMember?.[
                        dm.other_workspace_member_id
                      ] || null
                    }
                    unreadCount={unreadCounts?.[dm.conversation_id] || 0}
                    onPress={() =>
                      onOpenConversation({
                        kind: 'dm',
                        conversationId: dm.conversation_id,
                        title: dm.other_display_name || 'Member',
                        subtitle: dm.other_primary_email || 'Direct message',
                        otherWorkspaceMemberId:
                          dm.other_workspace_member_id || '',
                        unreadAtOpen: Number(unreadCounts?.[dm.conversation_id] || 0),
                      })
                    }
                  />
                ))
              )
            ) : filteredChannels.length === 0 ? (
              <EmptyState text={channelFilter ? "No matching channels." : "No channels available yet."} />
            ) : (
              filteredChannels.map((channel, index) => (
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
                      unreadAtOpen: Number(unreadCounts?.[channel.conversation_id] || 0),
                    })
                  }
                />
              ))
            )}
          </View>

          <View style={styles.brandFooter}>
            <Text style={styles.brandFooterText}>
              PEOPLE  •  IDEAS  •  TOGETHER
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={composerMode === 'dm'}
        transparent
        animationType="slide"
        onRequestClose={closeComposer}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>New message</Text>
                <Text style={styles.modalSubtitle}>Search people in this workspace</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close new message"
                onPress={closeComposer}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <TextInput
              autoFocus
              value={memberQuery}
              onChangeText={setMemberQuery}
              placeholder="Search by name or email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />

            {memberError ? (
              <Text style={styles.modalError}>{memberError}</Text>
            ) : null}

            <ScrollView
              style={styles.memberList}
              keyboardShouldPersistTaps="handled"
            >
              {memberLoading ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={colors.teal} />
                  <Text style={styles.modalLoadingText}>Searching people…</Text>
                </View>
              ) : availableMembers.length === 0 ? (
                <Text style={styles.modalEmpty}>No matching people.</Text>
              ) : (
                availableMembers.map((member) => (
                  <Pressable
                    key={member.workspace_member_id}
                    accessibilityRole="button"
                    onPress={() => chooseMember(member)}
                    disabled={busyMemberId === member.workspace_member_id}
                    style={({ pressed }) => [
                      styles.memberRow,
                      pressed ? styles.rowPressed : null,
                    ]}
                  >
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {initials(member.display_name)}
                      </Text>
                    </View>
                    <View style={styles.memberCopy}>
                      <View style={styles.memberNameLine}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.display_name || 'Member'}
                        </Text>
                        {member?.presence_profile?.custom_status ? (
                          <View style={styles.customStatusPill}>
                            <Text style={styles.customStatusText} numberOfLines={1}>
                              {member.presence_profile.custom_status}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.memberMetaLine}>
                        <Text style={styles.memberEmail} numberOfLines={1}>
                          {member.primary_email || member.member_role || 'Workspace member'}
                        </Text>
                        {member?.presence_profile ? (
                          <Text style={[styles.rowPresenceText, presenceStyle(member.presence_profile.status || 'NOT_AVAILABLE')]}>
                            {presenceLabel(member.presence_profile.status || 'NOT_AVAILABLE')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.memberAction}>
                      {busyMemberId === member.workspace_member_id
                        ? 'Opening…'
                        : 'Message'}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={composerMode === 'channel'}
        transparent
        animationType="slide"
        onRequestClose={closeComposer}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalSheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.channelModalContent}
            >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Create channel</Text>
                <Text style={styles.modalSubtitle}>Start a new team space</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close create channel"
                onPress={closeComposer}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>CHANNEL NAME</Text>
            <TextInput
              autoFocus
              value={channelName}
              onChangeText={setChannelName}
              placeholder="e.g. Sales team"
              placeholderTextColor={colors.textMuted}
              maxLength={160}
              style={styles.modalInput}
            />

            <Text style={styles.fieldLabel}>VISIBILITY</Text>
            <View style={styles.visibilityRow}>
              {['PUBLIC', 'PRIVATE'].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  onPress={() => setChannelVisibility(value)}
                  style={[
                    styles.visibilityButton,
                    channelVisibility === value
                      ? styles.visibilityButtonActive
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.visibilityButtonText,
                      channelVisibility === value
                        ? styles.visibilityButtonTextActive
                        : null,
                    ]}
                  >
                    {value === 'PUBLIC' ? 'Public' : 'Private'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.visibilityHelp}>
              {channelVisibility === 'PUBLIC'
                ? 'Only channel members see its messages; workspace admins manage membership.'
                : 'Only invited members can access this channel.'}
            </Text>

            {channelError ? (
              <Text style={styles.modalError}>{channelError}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={submitChannel}
              disabled={channelBusy}
              style={({ pressed }) => [
                styles.createButton,
                channelBusy ? styles.createButtonDisabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {channelBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.createButtonText}>Create channel</Text>
              )}
            </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
        <Text
          style={[styles.tabText, active ? styles.tabTextActive : null]}
          numberOfLines={1}
        >
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
  presenceStatus = null,
  presenceProfile = null,
  unreadCount = 0,
  onPress,
}) {
  const { palette } = useAppAppearance();
  const customStatus = String(presenceProfile?.custom_status || '').trim();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderTopColor: palette.border },
        first ? styles.firstRow : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.rowAvatarWrap}>
        <View style={avatar ? styles.rowAvatar : styles.rowIcon}>
          <Text style={avatar ? styles.rowAvatarText : styles.rowIconText}>
            {icon}
          </Text>
        </View>
        {avatar && presenceStatus ? (
          <View
            style={[
              styles.rowPresenceDot,
              presenceStyle(presenceStatus),
            ]}
          />
        ) : null}
      </View>

      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, { color: palette.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {customStatus ? (
            <View style={styles.customStatusPill}>
              <Text style={styles.customStatusText} numberOfLines={1}>
                {customStatus}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rowSubtitleLine}>
          <Text style={[styles.rowSubtitle, { color: palette.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
          {presenceStatus ? (
            <Text
              style={[
                styles.rowPresenceText,
                presenceStatus === 'LIVE'
                  ? styles.rowPresenceTextLive
                  : presenceStatus === 'AWAY'
                    ? styles.rowPresenceTextAway
                    : styles.rowPresenceTextUnavailable,
              ]}
            >
              {presenceLabel(presenceStatus)}
            </Text>
          ) : null}
        </View>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.shell,
  },
  topBar: {
    minHeight: 74,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandRow: {
    flex: 1,
    minHeight: 60,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  brandRowPressed: {
    opacity: 0.78,
  },
  brandLogo: {
    width: 46,
    height: 46,
    marginRight: 10,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandText: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  brandAksha: {
    color: colors.brandNavy,
  },
  brandConnect: {
    color: colors.brandBlue,
  },
  organizationLine: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizationName: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
  },
  organizationChevron: {
    marginLeft: 4,
    marginTop: -1,
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  livePill: {
    marginLeft: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePillOn: {
    backgroundColor: '#E7F8EE',
  },
  livePillOff: {
    backgroundColor: '#FFF2E8',
  },
  liveDot: {
    width: 6,
    height: 6,
    marginRight: 5,
    borderRadius: 99,
  },
  liveDotOn: {
    backgroundColor: colors.brandGreen,
  },
  liveDotOff: {
    backgroundColor: colors.brandOrange,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
  },
  liveTextOn: {
    color: '#117A45',
  },
  liveTextOff: {
    color: '#A95A16',
  },
  tabs: {
    height: 54,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.brandNavy,
    fontWeight: '900',
  },
  sectionUnreadPill: {
    minWidth: 20,
    height: 20,
    marginLeft: 6,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandOrange,
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
    backgroundColor: colors.primary,
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
    backgroundColor: colors.surface,
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
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  newButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  listSearchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listSearchInput: {
    height: 42,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    color: colors.navy,
    fontSize: 13,
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
    backgroundColor: '#EDF5FF',
  },
  rowAvatarWrap: {
    width: 42,
    height: 42,
    position: 'relative',
  },
  rowAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
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
    backgroundColor: colors.primary,
  },
  rowIconText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  rowPresenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  presenceLive: {
    backgroundColor: colors.brandGreen,
  },
  presenceAway: {
    backgroundColor: colors.brandOrange,
  },
  presenceUnavailable: {
    backgroundColor: '#94A3B8',
  },
  rowCopy: {
    flex: 1,
    marginLeft: 13,
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customStatusPill: { maxWidth: '52%', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: '#EAF4FF' },
  customStatusText: { color: '#1769AA', fontSize: 8.5, fontWeight: '800' },
  rowTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  rowSubtitleLine: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSubtitle: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  rowPresenceText: {
    marginLeft: 8,
    fontSize: 10,
    fontWeight: '800',
  },
  rowPresenceTextLive: {
    color: '#117A45',
  },
  rowPresenceTextAway: {
    color: '#A95A16',
  },
  rowPresenceTextUnavailable: {
    color: '#718096',
  },
  rowUnreadPill: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandOrange,
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
    color: colors.primary,
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
    backgroundColor: colors.brandOrange,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 29, 55, 0.34)',
  },
  modalSheet: {
    maxHeight: '88%',
    padding: 18,
    paddingBottom: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  channelModalContent: {
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF5FB',
  },
  closeButtonText: {
    color: colors.navy,
    fontSize: 24,
    lineHeight: 26,
  },
  modalInput: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFF',
    color: colors.navy,
    fontSize: 14,
  },
  modalError: {
    marginTop: 10,
    color: '#B42318',
    fontSize: 12,
    fontWeight: '700',
  },
  modalLoading: {
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 12,
  },
  modalEmpty: {
    paddingVertical: 28,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
  },
  memberList: {
    marginTop: 10,
  },
  memberRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  memberAvatarText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '900',
  },
  memberCopy: {
    flex: 1,
    marginLeft: 11,
  },
  memberNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberMetaLine: { marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  memberName: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  memberEmail: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 11,
  },
  memberAction: {
    marginLeft: 8,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 7,
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  visibilityButton: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  visibilityButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#EAF3FF',
  },
  visibilityButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  visibilityButtonTextActive: {
    color: colors.primary,
  },
  visibilityHelp: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 11,
  },
  createButton: {
    height: 50,
    marginTop: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
