'use strict';

const PRESENCE_ACTIVE = 'ACTIVE';
const PRESENCE_AWAY = 'AWAY';

const PUBLIC_LIVE = 'LIVE';
const PUBLIC_AWAY = 'AWAY';
const PUBLIC_NOT_AVAILABLE = 'NOT_AVAILABLE';

const CLIENT_TYPES = new Set(['WEB', 'MOBILE']);

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeClientType(value) {
  const type = clean(value || 'WEB').toUpperCase();
  return CLIENT_TYPES.has(type) ? type : 'WEB';
}

function normalizePresenceState(value) {
  const state = clean(value || PRESENCE_ACTIVE).toUpperCase();
  return state === PRESENCE_AWAY ? PRESENCE_AWAY : PRESENCE_ACTIVE;
}

function profileKey(workspaceId, workspaceMemberId) {
  return `${workspaceId}:${workspaceMemberId}`;
}

function normalizeProfile(workspaceMemberId, profile = {}) {
  const expiryRaw = clean(profile.status_expires_at ?? profile.statusExpiresAt);
  const expiryMs = expiryRaw ? Date.parse(expiryRaw) : NaN;
  const expired = Number.isFinite(expiryMs) && expiryMs <= Date.now();

  return {
    workspace_member_id: workspaceMemberId,
    custom_status: expired
      ? null
      : clean(profile.custom_status ?? profile.customStatus) || null,
    status_expires_at: expired ? null : expiryRaw || null,
    last_seen_at:
      clean(profile.last_seen_at ?? profile.lastSeenAt) || null,
  };
}

function createPresenceRegistry() {
  const connections = new Map();
  const profiles = new Map();

  function rowsForMember(workspaceId, workspaceMemberId) {
    return [...connections.values()].filter(
      (row) =>
        row.workspaceId === workspaceId &&
        row.workspaceMemberId === workspaceMemberId
    );
  }

  function setMemberProfile(workspaceId, workspaceMemberId, profile = {}) {
    if (!workspaceId || !workspaceMemberId) return null;
    const normalized = normalizeProfile(workspaceMemberId, profile);
    profiles.set(profileKey(workspaceId, workspaceMemberId), normalized);
    return normalized;
  }

  function getMemberProfile(workspaceId, workspaceMemberId) {
    const stored = profiles.get(profileKey(workspaceId, workspaceMemberId));
    if (!stored) return normalizeProfile(workspaceMemberId, {});

    const normalized = normalizeProfile(workspaceMemberId, stored);
    if (
      normalized.custom_status !== stored.custom_status ||
      normalized.status_expires_at !== stored.status_expires_at
    ) {
      profiles.set(profileKey(workspaceId, workspaceMemberId), normalized);
    }
    return normalized;
  }

  function getMemberPresence(workspaceId, workspaceMemberId) {
    const rows = rowsForMember(workspaceId, workspaceMemberId);
    const profile = getMemberProfile(workspaceId, workspaceMemberId);

    let status = PUBLIC_NOT_AVAILABLE;
    if (rows.length > 0) {
      status = rows.some((row) => row.state === PRESENCE_ACTIVE)
        ? PUBLIC_LIVE
        : PUBLIC_AWAY;
    }

    return {
      workspace_member_id: workspaceMemberId,
      status,
      custom_status: profile.custom_status,
      status_expires_at: profile.status_expires_at,
      last_seen_at: profile.last_seen_at,
    };
  }

  function publicStatus(workspaceId, workspaceMemberId) {
    return getMemberPresence(workspaceId, workspaceMemberId).status;
  }

  function registerConnection({
    connectionId,
    workspaceId,
    workspaceMemberId,
    clientType = 'WEB',
    state = PRESENCE_ACTIVE,
    activeConversationId = null,
  }) {
    const before = publicStatus(workspaceId, workspaceMemberId);

    connections.set(connectionId, {
      connectionId,
      workspaceId,
      workspaceMemberId,
      clientType: normalizeClientType(clientType),
      state: normalizePresenceState(state),
      activeConversationId: clean(activeConversationId) || null,
      updatedAt: Date.now(),
    });

    const presence = getMemberPresence(workspaceId, workspaceMemberId);

    return {
      changed: before !== presence.status,
      presence,
    };
  }

  function updateConnection(connectionId, { state, activeConversationId } = {}) {
    const current = connections.get(connectionId);
    if (!current) return null;

    const before = publicStatus(current.workspaceId, current.workspaceMemberId);
    const nextState = normalizePresenceState(
      state === undefined ? current.state : state
    );
    const nextConversation =
      nextState === PRESENCE_ACTIVE
        ? clean(activeConversationId) || null
        : null;

    const next = {
      ...current,
      state: nextState,
      activeConversationId: nextConversation,
      updatedAt: Date.now(),
    };

    connections.set(connectionId, next);

    const presence = getMemberPresence(
      current.workspaceId,
      current.workspaceMemberId
    );

    return {
      changed: before !== presence.status,
      presence,
      connection: next,
    };
  }

  function removeConnection(connectionId, { lastSeenAt = null } = {}) {
    const current = connections.get(connectionId);
    if (!current) return null;

    const before = publicStatus(current.workspaceId, current.workspaceMemberId);
    connections.delete(connectionId);

    if (lastSeenAt) {
      const currentProfile = getMemberProfile(
        current.workspaceId,
        current.workspaceMemberId
      );
      setMemberProfile(current.workspaceId, current.workspaceMemberId, {
        ...currentProfile,
        last_seen_at: lastSeenAt,
      });
    }

    const presence = getMemberPresence(
      current.workspaceId,
      current.workspaceMemberId
    );

    return {
      changed:
        before !== presence.status ||
        Boolean(lastSeenAt),
      presence,
      connection: current,
    };
  }

  function snapshot(workspaceId) {
    const memberIds = new Set();

    for (const row of connections.values()) {
      if (row.workspaceId === workspaceId) memberIds.add(row.workspaceMemberId);
    }

    for (const key of profiles.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        memberIds.add(key.slice(String(workspaceId).length + 1));
      }
    }

    return [...memberIds]
      .map((memberId) => getMemberPresence(workspaceId, memberId))
      .sort((left, right) =>
        String(left.workspace_member_id).localeCompare(
          String(right.workspace_member_id)
        )
      );
  }

  function isActivelyReading({ workspaceId, workspaceMemberId, conversationId }) {
    const targetConversation = clean(conversationId);
    if (!targetConversation) return false;

    return rowsForMember(workspaceId, workspaceMemberId).some(
      (row) =>
        row.state === PRESENCE_ACTIVE &&
        row.activeConversationId === targetConversation
    );
  }

  function getConnection(connectionId) {
    return connections.get(connectionId) || null;
  }

  return Object.freeze({
    registerConnection,
    updateConnection,
    removeConnection,
    setMemberProfile,
    getMemberProfile,
    getMemberPresence,
    snapshot,
    isActivelyReading,
    getConnection,
  });
}

module.exports = {
  PRESENCE_ACTIVE,
  PRESENCE_AWAY,
  PUBLIC_LIVE,
  PUBLIC_AWAY,
  PUBLIC_NOT_AVAILABLE,
  normalizeClientType,
  normalizePresenceState,
  normalizeProfile,
  createPresenceRegistry,
};
