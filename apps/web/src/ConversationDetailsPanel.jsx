import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  addConversationPerson,
  getConversationDetails,
  listConversationPeople,
  listConversationPins,
  listConversationShared,
  openSharedAttachment,
  pinConversationMessage,
  removeConversationPerson,
  replaceChannelRules,
  searchConversationPeople,
  unpinConversationMessage,
  updateChannelProfile,
  updateConversationSetting,
} from './conversationDetailsApi.js';

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

  if (value === 'LIVE') return 'Live';
  if (value === 'AWAY') return 'Away';

  return 'Not available';
}

function fileSizeLabel(value) {
  const bytes = Number(value || 0);

  if (!bytes) return '';

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function messagePreview(item) {
  const body = clean(item?.body_text);

  if (body) {
    return body.length > 160
      ? `${body.slice(0, 157)}…`
      : body;
  }

  return item?.message_type === 'ATTACHMENT'
    ? 'Attachment'
    : 'Message';
}

export default function ConversationDetailsPanel({
  token,
  selected,
  onClose,
  onApiFailure,
}) {
  const isChannel =
    selected?.kind === 'channel';

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
  const [candidates, setCandidates] =
    useState([]);
  const [busyMemberId, setBusyMemberId] =
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

  const tabs = useMemo(
    () =>
      isChannel
        ? CHANNEL_TABS
        : DM_TABS,
    [isChannel]
  );

  const handleError = useCallback(
    (requestError, fallback) => {
      if (
        onApiFailure?.(
          requestError
        )
      ) {
        return;
      }

      setError(
        requestError?.message ||
          fallback
      );
    },
    [onApiFailure]
  );

  const refreshDetails = useCallback(
    async () => {
      if (!selected?.id) return;

      setLoading(true);
      setError('');

      try {
        const payload =
          await getConversationDetails(
            token,
            selected.id
          );

        setDetails(payload);

        setChannelName(
          payload?.channel
            ?.channel_name ||
          selected.title ||
          ''
        );
        setDescription(
          payload?.channel
            ?.description || ''
        );
        setTopic(
          payload?.channel
            ?.topic || ''
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
        handleError(
          requestError,
          'Could not load conversation details'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      handleError,
      selected?.id,
      selected?.title,
      token,
    ]
  );

  const loadPeople = useCallback(
    async () => {
      if (
        !isChannel ||
        !selected?.id
      ) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationPeople(
            token,
            selected.id
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
        handleError(
          requestError,
          'Could not load channel people'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      handleError,
      isChannel,
      selected?.id,
      token,
    ]
  );

  const loadShared = useCallback(
    async (kind = sharedTab) => {
      if (!selected?.id) return;

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationShared(
            token,
            selected.id,
            kind
          );

        setSharedItems(
          payload?.items || []
        );
      } catch (requestError) {
        handleError(
          requestError,
          'Could not load shared content'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      handleError,
      selected?.id,
      sharedTab,
      token,
    ]
  );

  const loadPins = useCallback(
    async () => {
      if (!selected?.id) return;

      setLoading(true);
      setError('');

      try {
        const payload =
          await listConversationPins(
            token,
            selected.id
          );

        setPins(
          payload?.pins || []
        );
        setPinCandidates(
          payload?.candidates || []
        );
      } catch (requestError) {
        handleError(
          requestError,
          'Could not load pins'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      handleError,
      selected?.id,
      token,
    ]
  );

  useEffect(() => {
    setTab('OVERVIEW');
    setSharedTab('MEDIA');
    setPeople([]);
    setCandidates([]);
    setSharedItems([]);
    setPins([]);
    setPinCandidates([]);
    refreshDetails();
  }, [
    refreshDetails,
    selected?.id,
  ]);

  useEffect(() => {
    if (tab === 'PEOPLE') {
      loadPeople();
    } else if (tab === 'SHARED') {
      loadShared(sharedTab);
    } else if (tab === 'PINS') {
      loadPins();
    }
  }, [
    loadPeople,
    loadPins,
    loadShared,
    sharedTab,
    tab,
  ]);

  async function saveOverview() {
    setLoading(true);
    setError('');

    try {
      await updateChannelProfile(
        token,
        selected.id,
        {
          channelName:
            channelName.trim(),
          description:
            description.trim(),
          topic:
            topic.trim(),
        }
      );

      await replaceChannelRules(
        token,
        selected.id,
        rulesText
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      );

      await refreshDetails();
    } catch (requestError) {
      handleError(
        requestError,
        'Could not save channel details'
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchPeople(event) {
    event?.preventDefault?.();

    setLoading(true);
    setError('');

    try {
      const payload =
        await searchConversationPeople(
          token,
          peopleQuery.trim()
        );

      const existing =
        new Set(
          people.map(
            (item) =>
              item.workspace_member_id
          )
        );

      setCandidates(
        (payload?.members || [])
          .filter(
            (item) =>
              !existing.has(
                item.workspace_member_id
              )
          )
      );
    } catch (requestError) {
      handleError(
        requestError,
        'Could not search workspace people'
      );
    } finally {
      setLoading(false);
    }
  }

  async function addPerson(member) {
    setBusyMemberId(
      member.workspace_member_id
    );

    try {
      await addConversationPerson(
        token,
        selected.id,
        member.workspace_member_id
      );

      setCandidates((current) =>
        current.filter(
          (item) =>
            item.workspace_member_id !==
            member.workspace_member_id
        )
      );

      await loadPeople();
    } catch (requestError) {
      handleError(
        requestError,
        'Could not add person'
      );
    } finally {
      setBusyMemberId('');
    }
  }

  async function removePerson(member) {
    if (
      !window.confirm(
        `Remove ${
          member.display_name ||
          'this person'
        } from #${selected.title}?`
      )
    ) {
      return;
    }

    setBusyMemberId(
      member.workspace_member_id
    );

    try {
      await removeConversationPerson(
        token,
        selected.id,
        member.workspace_member_id
      );

      await loadPeople();
    } catch (requestError) {
      handleError(
        requestError,
        'Could not remove person'
      );
    } finally {
      setBusyMemberId('');
    }
  }

  async function openShared(item) {
    try {
      if (item.url) {
        window.open(
          item.url,
          '_blank',
          'noopener,noreferrer'
        );
        return;
      }

      await openSharedAttachment(
        token,
        selected.id,
        item
      );
    } catch (requestError) {
      handleError(
        requestError,
        'Could not open shared item'
      );
    }
  }

  async function pinMessage(item) {
    setLoading(true);

    try {
      await pinConversationMessage(
        token,
        selected.id,
        item.message_id
      );

      await loadPins();
    } catch (requestError) {
      handleError(
        requestError,
        'Could not pin message'
      );
    } finally {
      setLoading(false);
    }
  }

  async function unpinMessage(item) {
    setLoading(true);

    try {
      await unpinConversationMessage(
        token,
        selected.id,
        item.message_id
      );

      await loadPins();
    } catch (requestError) {
      handleError(
        requestError,
        'Could not remove pin'
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleNotifications() {
    const next =
      details?.setting
        ?.notification_level ===
      'NONE'
        ? 'ALL'
        : 'NONE';

    setLoading(true);

    try {
      const payload =
        await updateConversationSetting(
          token,
          selected.id,
          next
        );

      setDetails((current) => ({
        ...(current || {}),
        setting:
          payload?.setting || {
            notification_level: next,
          },
      }));
    } catch (requestError) {
      handleError(
        requestError,
        'Could not update notifications'
      );
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <aside
      className="conversation-details-panel"
      aria-label="Conversation details"
    >
      <header
        className="conversation-details-header"
      >
        <div>
          <strong>
            {isChannel
              ? `# ${selected.title}`
              : selected.title}
          </strong>
          <span>
            Conversation details
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation details"
        >
          ×
        </button>
      </header>

      <nav
        className="conversation-details-tabs"
        aria-label="Conversation details sections"
      >
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            className={
              tab === item
                ? 'active'
                : ''
            }
            onClick={() =>
              setTab(item)
            }
          >
            {item[0] +
              item
                .slice(1)
                .toLowerCase()}
          </button>
        ))}
      </nav>

      {error ? (
        <div
          className="conversation-details-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          className="conversation-details-loading"
        >
          Loading…
        </div>
      ) : null}

      <div
        className="conversation-details-body"
      >
        {tab === 'OVERVIEW' ? (
          isChannel ? (
            <>
              <label
                className="details-field"
              >
                <span>About</span>
                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  disabled={
                    !canManageChannel
                  }
                  placeholder="What is this channel for?"
                />
              </label>

              <label
                className="details-field"
              >
                <span>Topic</span>
                <input
                  value={topic}
                  onChange={(event) =>
                    setTopic(
                      event.target.value
                    )
                  }
                  disabled={
                    !canManageChannel
                  }
                  placeholder="Current channel topic"
                />
              </label>

              <label
                className="details-field"
              >
                <span>Channel name</span>
                <input
                  value={channelName}
                  onChange={(event) =>
                    setChannelName(
                      event.target.value
                    )
                  }
                  disabled={
                    !canManageChannel
                  }
                />
              </label>

              <label
                className="details-field"
              >
                <span>
                  Rules · one per line
                </span>
                <textarea
                  className="rules-editor"
                  value={rulesText}
                  onChange={(event) =>
                    setRulesText(
                      event.target.value
                    )
                  }
                  disabled={
                    !canManageChannel
                  }
                />
              </label>

              <div
                className="details-facts"
              >
                <span>Visibility</span>
                <strong>
                  {details?.channel
                    ?.visibility ||
                    '—'}
                </strong>
                <span>Created by</span>
                <strong>
                  {details
                    ?.conversation
                    ?.creator_display_name ||
                    '—'}
                </strong>
              </div>

              {canManageChannel ? (
                <button
                  type="button"
                  className="details-primary-button"
                  onClick={saveOverview}
                  disabled={loading}
                >
                  Save channel details
                </button>
              ) : null}
            </>
          ) : (
            <div
              className="dm-profile-card"
            >
              <div
                className="dm-profile-avatar"
              >
                {String(
                  details?.peer
                    ?.display_name ||
                    selected.title ||
                    'M'
                )
                  .trim()
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <strong>
                {details?.peer
                  ?.display_name ||
                  selected.title}
              </strong>

              <span>
                {details?.peer
                  ?.primary_email ||
                  selected.subtitle ||
                  ''}
              </span>
            </div>
          )
        ) : null}

        {tab === 'PEOPLE' &&
        isChannel ? (
          <>
            <div
              className="presence-summary"
            >
              <span>
                ● Live {liveCount}
              </span>
              <span>
                ◐ Away {awayCount}
              </span>
              <span>
                ○ Not available{' '}
                {Math.max(
                  0,
                  people.length -
                    liveCount -
                    awayCount
                )}
              </span>
            </div>

            {canManagePeople ? (
              <form
                className="details-search"
                onSubmit={searchPeople}
              >
                <input
                  value={peopleQuery}
                  onChange={(event) =>
                    setPeopleQuery(
                      event.target.value
                    )
                  }
                  placeholder="Search workspace people"
                />
                <button type="submit">
                  Search
                </button>
              </form>
            ) : null}

            <div
              className="details-list"
            >
              {people.map((member) => (
                <div
                  key={
                    member.workspace_member_id
                  }
                  className="details-person-row"
                >
                  <div
                    className="details-avatar"
                  >
                    {String(
                      member.display_name ||
                        'M'
                    )
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

                  <div
                    className="details-row-copy"
                  >
                    <strong>
                      {member.display_name ||
                        'Member'}
                    </strong>
                    <span>
                      {member.member_role}
                      {member.primary_email
                        ? ` · ${member.primary_email}`
                        : ''}
                    </span>
                    <span
                      className={`presence-status ${String(
                        member.presence_status ||
                          'NOT_AVAILABLE'
                      ).toLowerCase()}`}
                    >
                      ●{' '}
                      {presenceLabel(
                        member.presence_status
                      )}
                    </span>
                  </div>

                  {canManagePeople &&
                  member.member_role !==
                    'OWNER' ? (
                    <button
                      type="button"
                      className="danger-link"
                      disabled={
                        busyMemberId ===
                        member.workspace_member_id
                      }
                      onClick={() =>
                        removePerson(
                          member
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {candidates.length >
            0 ? (
              <>
                <h4>Add people</h4>

                {candidates.map(
                  (member) => (
                    <div
                      key={
                        member.workspace_member_id
                      }
                      className="details-person-row"
                    >
                      <div
                        className="details-row-copy"
                      >
                        <strong>
                          {member.display_name ||
                            'Member'}
                        </strong>
                        <span>
                          {member.primary_email ||
                            ''}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="success-link"
                        onClick={() =>
                          addPerson(member)
                        }
                      >
                        Add
                      </button>
                    </div>
                  )
                )}
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'SHARED' ? (
          <>
            <div
              className="shared-tabs"
            >
              {SHARED_TABS.map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      sharedTab ===
                      item
                        ? 'active'
                        : ''
                    }
                    onClick={() => {
                      setSharedTab(
                        item
                      );
                      loadShared(item);
                    }}
                  >
                    {item[0] +
                      item
                        .slice(1)
                        .toLowerCase()}
                  </button>
                )
              )}
            </div>

            {sharedItems.length ===
            0 ? (
              <div
                className="details-empty"
              >
                Nothing shared here yet.
              </div>
            ) : (
              sharedItems.map(
                (item, index) => (
                  <button
                    key={
                      item.attachment_id ||
                      `${item.message_id}-${index}`
                    }
                    type="button"
                    className="shared-item-row"
                    onClick={() =>
                      openShared(item)
                    }
                  >
                    <span>
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
                    </span>

                    <div>
                      <strong>
                        {item.url ||
                          item.file_name ||
                          'Shared item'}
                      </strong>
                      <small>
                        {item.sender_display_name ||
                          ''}
                        {item.size_bytes
                          ? ` · ${fileSizeLabel(
                              item.size_bytes
                            )}`
                          : ''}
                      </small>
                    </div>
                  </button>
                )
              )
            )}
          </>
        ) : null}

        {tab === 'PINS' ? (
          <>
            <h4>Pinned</h4>

            {pins.length === 0 ? (
              <div
                className="details-empty"
              >
                No pinned messages yet.
              </div>
            ) : (
              pins.map((item) => (
                <div
                  key={item.message_id}
                  className="pin-card"
                >
                  <strong>
                    {item.sender_display_name ||
                      'Message'}
                  </strong>
                  <p>
                    {messagePreview(item)}
                  </p>
                  <small>
                    Pinned by{' '}
                    {item.pinned_by_display_name ||
                      'member'}
                  </small>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() =>
                      unpinMessage(item)
                    }
                  >
                    Unpin
                  </button>
                </div>
              ))
            )}

            <h4>Recent messages</h4>

            {pinCandidates
              .filter(
                (item) =>
                  !item.is_pinned
              )
              .slice(0, 12)
              .map((item) => (
                <div
                  key={item.message_id}
                  className="pin-card"
                >
                  <strong>
                    {item.sender_display_name ||
                      'Message'}
                  </strong>
                  <p>
                    {messagePreview(item)}
                  </p>
                  <button
                    type="button"
                    className="success-link"
                    onClick={() =>
                      pinMessage(item)
                    }
                  >
                    Pin
                  </button>
                </div>
              ))}
          </>
        ) : null}

        {tab === 'SETTINGS' ? (
          <>
            <h4>Notifications</h4>

            <div
              className="settings-card"
            >
              <div>
                <strong>
                  All notifications
                </strong>
                <p>
                  Receive new-message
                  notifications when you
                  are not actively reading
                  this conversation.
                </p>
              </div>

              <button
                type="button"
                className={
                  details?.setting
                    ?.notification_level ===
                  'NONE'
                    ? 'setting-toggle'
                    : 'setting-toggle on'
                }
                onClick={
                  toggleNotifications
                }
              >
                {details?.setting
                  ?.notification_level ===
                'NONE'
                  ? 'Off'
                  : 'On'}
              </button>
            </div>

            <h4>Future controls</h4>
            <p
              className="details-help"
            >
              Calling, screen sharing,
              retention and advanced
              notification controls will
              use this same settings
              surface.
            </p>
          </>
        ) : null}
      </div>
    </aside>
  );
}
