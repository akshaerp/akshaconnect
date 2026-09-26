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

function createPresenceRegistry() {
  const connections = new Map();

  function rowsForMember(workspaceId, workspaceMemberId) {
    return [...connections.values()].filter(
      (row) =>
        row.workspaceId === workspaceId &&
        row.workspaceMemberId === workspaceMemberId
    );
  }

  function getMemberPresence(workspaceId, workspaceMemberId) {
    const rows = rowsForMember(workspaceId, workspaceMemberId);

    if (rows.length === 0) {
      return {
        workspace_member_id: workspaceMemberId,
        status: PUBLIC_NOT_AVAILABLE,
      };
    }

    const status = rows.some((row) => row.state === PRESENCE_ACTIVE)
      ? PUBLIC_LIVE
      : PUBLIC_AWAY;

    return {
      workspace_member_id: workspaceMemberId,
      status,
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

  function updateConnection(
    connectionId,
    {
      state,
      activeConversationId,
    } = {}
  ) {
    const current = connections.get(connectionId);
    if (!current) return null;

    const before = publicStatus(
      current.workspaceId,
      current.workspaceMemberId
    );

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

  function removeConnection(connectionId) {
    const current = connections.get(connectionId);
    if (!current) return null;

    const before = publicStatus(
      current.workspaceId,
      current.workspaceMemberId
    );

    connections.delete(connectionId);

    const presence = getMemberPresence(
      current.workspaceId,
      current.workspaceMemberId
    );

    return {
      changed: before !== presence.status,
      presence,
      connection: current,
    };
  }

  function snapshot(workspaceId) {
    const memberIds = new Set();

    for (const row of connections.values()) {
      if (row.workspaceId === workspaceId) {
        memberIds.add(row.workspaceMemberId);
      }
    }

    return [...memberIds]
      .map((memberId) => getMemberPresence(workspaceId, memberId))
      .filter((item) => item.status !== PUBLIC_NOT_AVAILABLE)
      .sort((left, right) =>
        String(left.workspace_member_id).localeCompare(
          String(right.workspace_member_id)
        )
      );
  }

  function isActivelyReading({
    workspaceId,
    workspaceMemberId,
    conversationId,
  }) {
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
  createPresenceRegistry,
};
