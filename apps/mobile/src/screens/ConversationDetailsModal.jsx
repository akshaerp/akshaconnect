import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReactNativeBlobUtil from 'react-native-blob-util';

import {
  downloadAttachmentToCache,
  listWorkspaceMembers,
} from '../api/client';
import {
  addConversationPerson,
  getConversationDetails,
  listConversationPeople,
  listConversationPins,
  listConversationShared,
  pinConversationMessage,
  removeConversationPerson,
  replaceChannelRules,
  unpinConversationMessage,
  updateChannelProfile,
  updateConversationSetting,
} from '../api/conversationDetails';
import Text from '../theme/AppText';
import TextInput from '../theme/AppTextInput';
import { colors } from '../theme/colors';
import { ConversationHeader } from './ConversationChrome.jsx';

const CHANNEL_TABS = [
  'OVERVIEW',
  'PEOPLE',
  'SHARED',
  'PINS',
  'SETTINGS',
];

const DM_TABS = [
  'OVERVIEW',
  'SHARED',
  'PINS',
  'SETTINGS',
];

const SHARED_TABS = [
  'MEDIA',
  'FILES',
  'LINKS',
];

function clean(value) {
  return value == null
    ? ''
    : String(value).trim();
}

function presenceLabel(status) {
  const value =
    clean(status).toUpperCase();

  if (value === 'LIVE') return 'Online';
  if (value === 'AWAY') return 'Away';

  return 'Offline';
}

function presenceStyle(status) {
  const value =
    clean(status).toUpperCase();

  if (value === 'LIVE') {
    return styles.presenceLive;
  }

  if (value === 'AWAY') {
    return styles.presenceAway;
  }

  return styles.presenceOffline;
}

function fileSizeLabel(value) {
  const bytes = Number(value || 0);

  if (!bytes) return '';

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(
      bytes / 1024
    )} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function messagePreview(item) {
  const body = clean(item?.body_text);

  if (body) {
    return body.length > 150
      ? `${body.slice(0, 147)}…`
      : body;
  }

  if (
    item?.message_type ===
    'ATTACHMENT'
  ) {
    return 'Attachment';
  }

  return 'Message';
}

export default function ConversationDetailsModal({
  visible,
  onClose,
  serverUrl,
  token,
  conversation,
  onPinsChanged,
}) {
  const isChannel =
    conversation?.kind === 'channel';

  const conversationId =
    conversation?.conversationId || '';

  const [tab, setTab] =
    useState('OVERVIEW');
  const [details, setDetails] =
    useState(null);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');

  const [people, setPeople] =
    useState([]);
  const [peopleQuery, setPeopleQuery] =
    useState('');
  const [peopleCandidates, setPeopleCandidates] =
    useState([]);
  const [peopleBusyId, setPeopleBusyId] =
    useState('');

  const [sharedTab, setSharedTab] =
    useState('MEDIA');
  const [sharedItems, setSharedItems] =
    useState([]);

  const [pins, setPins] =
    useState([]);
  const [pinCandidates, setPinCandidates] =
    useState([]);

  const [channelName, setChannelName] =
    useState('');
  const [description, setDescription] =
    useState('');
  const [topic, setTopic] =
    useState('');
  const [rulesText, setRulesText] =
    useState('');

  const canManageChannel =
    Boolean(
      details?.permissions
        ?.can_manage_channel
    );

  const canManagePeople =
    Boolean(
      details?.people_permissions
        ?.can_manage_members
    );

  const availableTabs = useMemo(
    () =>
      isChannel
        ? CHANNEL_TABS
        : DM_TABS,
    [isChannel]
  );

  const hydrateDetails = useCallback(
    async () => {
      if (
        !visible ||
        !conversationId ||
        !token
      ) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload =
          await getConversationDetails(
            serverUrl,
            token,
            conversationId
          );

        setDetails(payload);

        const channel =
          payload?.channel;

        setChannelName(
          channel?.channel_name ||
          conversation?.title ||
          ''
        );
        setDescription(
          channel?.description || ''
        );
        setTopic(
          channel?.topic || ''
        );
        setRulesText(
          (payload?.rules || [])
            .map(
              (item) =>
                item.rule_text
            )
            .join('\n')
        );
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Could not load conversation details'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      conversation?.title,
      conversationId,
      serverUrl,
      token,
      visible,
    ]
  );

  const loadPeople = useCallback(
    async () => {
      if (
        !isChannel ||
        !conversationId ||
        !token
      ) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationPeople(
            serverUrl,
            token,
            conversationId
          );

        setPeople(
          payload?.members || []
        );

        setDetails((current) => ({
          ...(current || {}),
          people_permissions: {
            can_manage_members:
              Boolean(
                payload
                  ?.can_manage_members
              ),
          },
        }));
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Could not load channel people'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      isChannel,
      serverUrl,
      token,
    ]
  );

  const loadShared = useCallback(
    async (kind = sharedTab) => {
      if (
        !conversationId ||
        !token
      ) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationShared(
            serverUrl,
            token,
            conversationId,
            kind
          );

        setSharedItems(
          payload?.items || []
        );
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Could not load shared content'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      serverUrl,
      sharedTab,
      token,
    ]
  );

  const loadPins = useCallback(
    async () => {
      if (
        !conversationId ||
        !token
      ) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationPins(
            serverUrl,
            token,
            conversationId
          );

        setPins(
          payload?.pins || []
        );
        setPinCandidates(
          payload?.candidates || []
        );
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Could not load pins'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      serverUrl,
      token,
    ]
  );

  useEffect(() => {
    if (!visible) return;

    setTab('OVERVIEW');
    setSharedTab('MEDIA');
    setPeople([]);
    setPeopleCandidates([]);
    setSharedItems([]);
    setPins([]);
    setPinCandidates([]);
    setError('');
    hydrateDetails();
  }, [
    conversationId,
    hydrateDetails,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;

    if (tab === 'PEOPLE') {
      loadPeople();
    }

    if (tab === 'SHARED') {
      loadShared(sharedTab);
    }

    if (tab === 'PINS') {
      loadPins();
    }
  }, [
    loadPeople,
    loadPins,
    loadShared,
    sharedTab,
    tab,
    visible,
  ]);

  async function saveOverview() {
    setLoading(true);
    setError('');

    try {
      await updateChannelProfile(
        serverUrl,
        token,
        conversationId,
        {
          channelName:
            channelName.trim(),
          description:
            description.trim(),
          topic:
            topic.trim(),
        }
      );

      const rules =
        rulesText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);

      await replaceChannelRules(
        serverUrl,
        token,
        conversationId,
        rules
      );

      await hydrateDetails();
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not save channel details'
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchPeople() {
    setLoading(true);
    setError('');

    try {
      const payload =
        await listWorkspaceMembers(
          serverUrl,
          token,
          {
            query:
              peopleQuery.trim(),
            limit: 50,
          }
        );

      const existing =
        new Set(
          people.map(
            (item) =>
              item.workspace_member_id
          )
        );

      setPeopleCandidates(
        (payload?.members || [])
          .filter(
            (item) =>
              !existing.has(
                item.workspace_member_id
              )
          )
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not search workspace people'
      );
    } finally {
      setLoading(false);
    }
  }

  async function addPerson(member) {
    const memberId =
      member?.workspace_member_id;

    if (!memberId) return;

    setPeopleBusyId(memberId);
    setError('');

    try {
      await addConversationPerson(
        serverUrl,
        token,
        conversationId,
        memberId
      );

      setPeopleCandidates(
        (current) =>
          current.filter(
            (item) =>
              item.workspace_member_id !==
              memberId
          )
      );

      await loadPeople();
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not add person'
      );
    } finally {
      setPeopleBusyId('');
    }
  }

  function removePerson(member) {
    if (
      !member?.workspace_member_id
    ) {
      return;
    }

    Alert.alert(
      'Remove from channel?',
      `${
        member.display_name ||
        'This person'
      } will lose access to a private channel.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const memberId =
              member.workspace_member_id;

            setPeopleBusyId(
              memberId
            );
            setError('');

            try {
              await removeConversationPerson(
                serverUrl,
                token,
                conversationId,
                memberId
              );

              await loadPeople();
            } catch (requestError) {
              setError(
                requestError?.message ||
                  'Could not remove person'
              );
            } finally {
              setPeopleBusyId('');
            }
          },
        },
      ]
    );
  }

  async function openSharedItem(item) {
    if (item?.url) {
      await Linking.openURL(
        item.url
      );
      return;
    }

    if (!item?.attachment_id) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const downloaded =
        await downloadAttachmentToCache(
          serverUrl,
          token,
          conversationId,
          item
        );

      if (Platform.OS === 'android') {
        await ReactNativeBlobUtil
          .android
          .actionViewIntent(
            downloaded.localPath,
            item.content_type ||
              'application/octet-stream'
          );
      } else {
        await Linking.openURL(
          `file://${downloaded.localPath}`
        );
      }
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not open shared item'
      );
    } finally {
      setLoading(false);
    }
  }

  async function pinMessage(item) {
    try {
      setLoading(true);
      setError('');

      await pinConversationMessage(
        serverUrl,
        token,
        conversationId,
        item.message_id
      );

      await loadPins();
      onPinsChanged?.();
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not pin message'
      );
    } finally {
      setLoading(false);
    }
  }

  async function unpinMessage(item) {
    try {
      setLoading(true);
      setError('');

      await unpinConversationMessage(
        serverUrl,
        token,
        conversationId,
        item.message_id
      );

      await loadPins();
      onPinsChanged?.();
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not remove pin'
      );
    } finally {
      setLoading(false);
    }
  }

  async function setNotifications(
    enabled
  ) {
    try {
      setLoading(true);
      setError('');

      const payload =
        await updateConversationSetting(
          serverUrl,
          token,
          conversationId,
          {
            notificationLevel:
              enabled
                ? 'ALL'
                : 'NONE',
          }
        );

      setDetails((current) => ({
        ...(current || {}),
        setting:
          payload?.setting || {
            notification_level:
              enabled
                ? 'ALL'
                : 'NONE',
          },
      }));
    } catch (requestError) {
      setError(
        requestError?.message ||
          'Could not update notifications'
      );
    } finally {
      setLoading(false);
    }
  }

  const liveCount =
    people.filter(
      (item) =>
        item.presence_status ===
        'LIVE'
    ).length;

  const awayCount =
    people.filter(
      (item) =>
        item.presence_status ===
        'AWAY'
    ).length;

  const unavailableCount =
    Math.max(
      0,
      people.length -
        liveCount -
        awayCount
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={styles.screen}
      >
        <StatusBar
          backgroundColor={colors.primary}
          barStyle="light-content"
        />
        <ConversationHeader
          title={
            isChannel
              ? `# ${conversation?.title || 'Channel'}`
              : conversation?.title || 'Conversation'
          }
          subtitle="Conversation details"
          onBack={onClose}
          backAccessibilityLabel="Close conversation details"
          style={styles.header}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={styles.tabScroller}
          contentContainerStyle={
            styles.tabs
          }
        >
          {availableTabs.map(
            (item) => (
              <Pressable
                key={item}
                onPress={() =>
                  setTab(item)
                }
                style={[
                  styles.tab,
                  tab === item
                    ? styles.tabActive
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    tab === item
                      ? styles.tabTextActive
                      : null,
                  ]}
                >
                  {item[0] +
                    item
                      .slice(1)
                      .toLowerCase()}
                </Text>
              </Pressable>
            )
          )}
        </ScrollView>

        {error ? (
          <Text style={styles.error}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <View
            style={styles.loading}
          >
            <ActivityIndicator
              color={colors.primary}
            />
          </View>
        ) : null}

        <ScrollView
          style={styles.body}
          contentContainerStyle={
            styles.bodyContent
          }
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'OVERVIEW' ? (
            isChannel ? (
              <View>
                <Text
                  style={styles.sectionTitle}
                >
                  About
                </Text>

                <TextInput
                  value={description}
                  onChangeText={
                    setDescription
                  }
                  editable={
                    canManageChannel
                  }
                  multiline
                  placeholder="What is this channel for?"
                  placeholderTextColor={
                    colors.textMuted
                  }
                  style={[
                    styles.textArea,
                    !canManageChannel
                      ? styles.readOnly
                      : null,
                  ]}
                />

                <Text
                  style={styles.sectionTitle}
                >
                  Topic
                </Text>

                <TextInput
                  value={topic}
                  onChangeText={setTopic}
                  editable={
                    canManageChannel
                  }
                  placeholder="Current channel topic"
                  placeholderTextColor={
                    colors.textMuted
                  }
                  style={[
                    styles.input,
                    !canManageChannel
                      ? styles.readOnly
                      : null,
                  ]}
                />

                <Text
                  style={styles.sectionTitle}
                >
                  Channel name
                </Text>

                <TextInput
                  value={channelName}
                  onChangeText={
                    setChannelName
                  }
                  editable={
                    canManageChannel
                  }
                  style={[
                    styles.input,
                    !canManageChannel
                      ? styles.readOnly
                      : null,
                  ]}
                />

                <Text
                  style={styles.sectionTitle}
                >
                  Rules
                </Text>

                <TextInput
                  value={rulesText}
                  onChangeText={
                    setRulesText
                  }
                  editable={
                    canManageChannel
                  }
                  multiline
                  placeholder={'One rule per line'}
                  placeholderTextColor={
                    colors.textMuted
                  }
                  style={[
                    styles.rulesInput,
                    !canManageChannel
                      ? styles.readOnly
                      : null,
                  ]}
                />

                <View
                  style={styles.infoCard}
                >
                  <Text
                    style={styles.infoLabel}
                  >
                    Visibility
                  </Text>
                  <Text
                    style={styles.infoValue}
                  >
                    {details?.channel
                      ?.visibility ||
                      '—'}
                  </Text>

                  <Text
                    style={styles.infoLabel}
                  >
                    Created by
                  </Text>
                  <Text
                    style={styles.infoValue}
                  >
                    {details
                      ?.conversation
                      ?.creator_display_name ||
                      '—'}
                  </Text>
                </View>

                {canManageChannel ? (
                  <Pressable
                    onPress={saveOverview}
                    disabled={loading}
                    style={styles.primaryButton}
                  >
                    <Text
                      style={
                        styles.primaryButtonText
                      }
                    >
                      Save channel details
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View>
                <View
                  style={styles.profileCard}
                >
                  <View
                    style={
                      styles.profileAvatar
                    }
                  >
                    <Text
                      style={
                        styles.profileAvatarText
                      }
                    >
                      {String(
                        details?.peer
                          ?.display_name ||
                          conversation?.title ||
                          'M'
                      )
                        .trim()
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <Text
                    style={styles.profileName}
                  >
                    {details?.peer
                      ?.display_name ||
                      conversation?.title ||
                      'Member'}
                  </Text>

                  <Text
                    style={styles.profileEmail}
                  >
                    {details?.peer
                      ?.primary_email ||
                      conversation?.subtitle ||
                      ''}
                  </Text>
                </View>
              </View>
            )
          ) : null}

          {tab === 'PEOPLE' &&
          isChannel ? (
            <View>
              <View
                style={
                  styles.presenceSummary
                }
              >
                <Text
                  style={styles.summaryChip}
                >
                  ● Online {liveCount}
                </Text>
                <Text
                  style={styles.summaryChip}
                >
                  ◐ Away {awayCount}
                </Text>
                <Text
                  style={styles.summaryChip}
                >
                  ○ Offline{' '}
                  {unavailableCount}
                </Text>
              </View>

              {canManagePeople ? (
                <View
                  style={styles.searchRow}
                >
                  <TextInput
                    value={peopleQuery}
                    onChangeText={
                      setPeopleQuery
                    }
                    placeholder="Search workspace people"
                    placeholderTextColor={
                      colors.textMuted
                    }
                    style={
                      styles.searchInput
                    }
                    onSubmitEditing={
                      searchPeople
                    }
                  />

                  <Pressable
                    onPress={searchPeople}
                    style={
                      styles.searchButton
                    }
                  >
                    <Text
                      style={
                        styles.searchButtonText
                      }
                    >
                      Search
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {people.map((member) => (
                <View
                  key={
                    member.workspace_member_id
                  }
                  style={styles.personRow}
                >
                  <View
                    style={
                      styles.personAvatar
                    }
                  >
                    <Text
                      style={
                        styles.personAvatarText
                      }
                    >
                      {String(
                        member.display_name ||
                          'M'
                      )
                        .trim()
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.personCopy
                    }
                  >
                    <Text
                      style={
                        styles.personName
                      }
                    >
                      {member.display_name ||
                        'Member'}
                    </Text>

                    <Text
                      style={
                        styles.personMeta
                      }
                    >
                      {member.member_role}
                      {member.primary_email
                        ? ` · ${member.primary_email}`
                        : ''}
                    </Text>

                    <Text
                      style={[
                        styles.presenceText,
                        presenceStyle(
                          member.presence_status
                        ),
                      ]}
                    >
                      ●{' '}
                      {presenceLabel(
                        member.presence_status
                      )}
                    </Text>
                  </View>

                  {canManagePeople &&
                  member.member_role !==
                    'OWNER' ? (
                    <Pressable
                      onPress={() =>
                        removePerson(member)
                      }
                      disabled={
                        peopleBusyId ===
                        member.workspace_member_id
                      }
                      style={
                        styles.removeButton
                      }
                    >
                      <Text
                        style={
                          styles.removeText
                        }
                      >
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              {peopleCandidates.length >
              0 ? (
                <>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Add people
                  </Text>

                  {peopleCandidates.map(
                    (member) => (
                      <View
                        key={
                          member.workspace_member_id
                        }
                        style={
                          styles.personRow
                        }
                      >
                        <View
                          style={
                            styles.personCopy
                          }
                        >
                          <Text
                            style={
                              styles.personName
                            }
                          >
                            {member.display_name ||
                              'Member'}
                          </Text>
                          <Text
                            style={
                              styles.personMeta
                            }
                          >
                            {member.primary_email ||
                              ''}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() =>
                            addPerson(member)
                          }
                          style={
                            styles.addButton
                          }
                        >
                          <Text
                            style={
                              styles.addText
                            }
                          >
                            Add
                          </Text>
                        </Pressable>
                      </View>
                    )
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          {tab === 'SHARED' ? (
            <View>
              <View
                style={
                  styles.sharedTabs
                }
              >
                {SHARED_TABS.map(
                  (item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        setSharedTab(
                          item
                        );
                        loadShared(item);
                      }}
                      style={[
                        styles.sharedTab,
                        sharedTab === item
                          ? styles.sharedTabActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sharedTabText,
                          sharedTab === item
                            ? styles.sharedTabTextActive
                            : null,
                        ]}
                      >
                        {item[0] +
                          item
                            .slice(1)
                            .toLowerCase()}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              {sharedItems.length ===
              0 ? (
                <Text
                  style={styles.emptyText}
                >
                  Nothing shared here yet.
                </Text>
              ) : (
                sharedItems.map(
                  (item, index) => (
                    <Pressable
                      key={
                        item.attachment_id ||
                        `${item.message_id}-${index}`
                      }
                      onPress={() =>
                        openSharedItem(
                          item
                        )
                      }
                      style={
                        styles.sharedRow
                      }
                    >
                      <View
                        style={
                          styles.sharedIcon
                        }
                      >
                        <Text>
                          {item.url
                            ? '🔗'
                            : String(
                                item.content_type ||
                                  ''
                              ).startsWith(
                                'image/'
                              )
                              ? '🖼️'
                              : '📄'}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.sharedCopy
                        }
                      >
                        <Text
                          style={
                            styles.sharedName
                          }
                          numberOfLines={2}
                        >
                          {item.url ||
                            item.file_name ||
                            'Shared item'}
                        </Text>

                        <Text
                          style={
                            styles.sharedMeta
                          }
                          numberOfLines={1}
                        >
                          {item.sender_display_name ||
                            ''}
                          {item.size_bytes
                            ? ` · ${fileSizeLabel(
                                item.size_bytes
                              )}`
                            : ''}
                        </Text>
                      </View>
                    </Pressable>
                  )
                )
              )}
            </View>
          ) : null}

          {tab === 'PINS' ? (
            <View>
              <Text
                style={styles.sectionTitle}
              >
                Pinned
              </Text>

              {pins.length === 0 ? (
                <Text
                  style={styles.emptyText}
                >
                  No pinned messages yet.
                </Text>
              ) : (
                pins.map((item) => (
                  <View
                    key={item.message_id}
                    style={styles.pinCard}
                  >
                    <Text
                      style={styles.pinSender}
                    >
                      {item.sender_display_name ||
                        'Message'}
                    </Text>

                    <Text
                      style={styles.pinText}
                    >
                      {messagePreview(item)}
                    </Text>

                    <Text
                      style={styles.pinMeta}
                    >
                      Pinned by{' '}
                      {item.pinned_by_display_name ||
                        'member'}
                    </Text>

                    <Pressable
                      onPress={() =>
                        unpinMessage(item)
                      }
                    >
                      <Text
                        style={
                          styles.unpinText
                        }
                      >
                        Unpin message
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}

              <Text
                style={styles.sectionTitle}
              >
                Recent messages
              </Text>

              {pinCandidates
                .filter(
                  (item) =>
                    !item.is_pinned
                )
                .slice(0, 12)
                .map((item) => (
                  <View
                    key={item.message_id}
                    style={styles.pinCard}
                  >
                    <Text
                      style={styles.pinSender}
                    >
                      {item.sender_display_name ||
                        'Message'}
                    </Text>

                    <Text
                      style={styles.pinText}
                    >
                      {messagePreview(item)}
                    </Text>

                    <Pressable
                      onPress={() =>
                        pinMessage(item)
                      }
                    >
                      <Text
                        style={styles.addText}
                      >
                        Pin
                      </Text>
                    </Pressable>
                  </View>
                ))}
            </View>
          ) : null}

          {tab === 'SETTINGS' ? (
            <View>
              <Text
                style={styles.sectionTitle}
              >
                Notifications
              </Text>

              <Text
                style={styles.settingHelp}
              >
                Choose whether this conversation
                can send push notifications to
                this device/account.
              </Text>

              <View
                style={styles.settingRow}
              >
                <View
                  style={styles.settingCopy}
                >
                  <Text
                    style={styles.settingTitle}
                  >
                    All notifications
                  </Text>

                  <Text
                    style={styles.settingHelp}
                  >
                    Receive new-message
                    notifications when you are
                    not actively reading this
                    conversation.
                  </Text>
                </View>

                <Pressable
                  onPress={() =>
                    setNotifications(
                      details?.setting
                        ?.notification_level ===
                        'NONE'
                    )
                  }
                  style={[
                    styles.toggle,
                    details?.setting
                      ?.notification_level !==
                      'NONE'
                      ? styles.toggleOn
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.toggleText
                    }
                  >
                    {details?.setting
                      ?.notification_level ===
                    'NONE'
                      ? 'Off'
                      : 'On'}
                  </Text>
                </Pressable>
              </View>

              <Text
                style={styles.sectionTitle}
              >
                Future controls
              </Text>

              <Text
                style={styles.settingHelp}
              >
                Calling, screen sharing,
                retention and advanced
                notification controls will use
                this same settings surface.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F9FD',
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 36,
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 2,
    color: '#BFD0E9',
    fontSize: 11,
  },
  tabScroller: {
    flexGrow: 0,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECF4',
  },
  tabs: {
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  tabTextActive: {
    color: colors.primary,
  },
  error: {
    margin: 12,
    padding: 10,
    borderRadius: 10,
    color: '#A12A3A',
    backgroundColor: '#FFF0F3',
    fontSize: 12,
  },
  loading: {
    paddingVertical: 8,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 42,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    color: colors.navy,
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CAD7E6',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: colors.text,
  },
  textArea: {
    minHeight: 96,
    padding: 12,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#CAD7E6',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: colors.text,
  },
  rulesInput: {
    minHeight: 140,
    padding: 12,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#CAD7E6',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: colors.text,
  },
  readOnly: {
    backgroundColor: '#EEF3F8',
  },
  infoCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  infoLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    marginTop: 2,
    color: colors.navy,
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 46,
    marginTop: 18,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  profileCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  profileAvatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  profileAvatarText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900',
  },
  profileName: {
    marginTop: 12,
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  profileEmail: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 12,
  },
  presenceSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  summaryChip: {
    marginRight: 7,
    marginBottom: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    color: colors.navy,
    backgroundColor: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#CAD7E6',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: colors.text,
  },
  searchButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  personRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF5',
  },
  personAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF3FF',
  },
  personAvatarText: {
    color: colors.primary,
    fontWeight: '900',
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 10,
  },
  personName: {
    color: colors.navy,
    fontWeight: '800',
  },
  personMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
  },
  presenceText: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '800',
  },
  presenceLive: {
    color: '#1C9B57',
  },
  presenceAway: {
    color: '#CC7A00',
  },
  presenceOffline: {
    color: '#8090A4',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EAF7EF',
  },
  addText: {
    color: '#117A45',
    fontSize: 11,
    fontWeight: '900',
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFF0F3',
  },
  removeText: {
    color: '#A12A3A',
    fontSize: 10,
    fontWeight: '900',
  },
  sharedTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#EAF0F7',
  },
  sharedTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  sharedTabActive: {
    backgroundColor: '#FFFFFF',
  },
  sharedTabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  sharedTabTextActive: {
    color: colors.primary,
  },
  sharedRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF5',
  },
  sharedIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF5FF',
  },
  sharedCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  sharedName: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: '800',
  },
  sharedMeta: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10,
  },
  emptyText: {
    paddingVertical: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pinCard: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  pinSender: {
    color: colors.navy,
    fontWeight: '900',
    fontSize: 11,
  },
  pinText: {
    marginTop: 5,
    color: colors.text,
    fontSize: 12,
  },
  pinMeta: {
    marginTop: 7,
    color: colors.textMuted,
    fontSize: 9,
  },
  unpinText: {
    marginTop: 8,
    color: '#A12A3A',
    fontSize: 10,
    fontWeight: '900',
  },
  settingRow: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  settingCopy: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    color: colors.navy,
    fontWeight: '900',
  },
  settingHelp: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  toggle: {
    minWidth: 54,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#D9E2EC',
  },
  toggleOn: {
    backgroundColor: '#DFF5E8',
  },
  toggleText: {
    color: colors.navy,
    fontSize: 10,
    fontWeight: '900',
  },
});
