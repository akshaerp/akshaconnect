'use strict';

const { boundaryError } = require('../core/boundaryError');
const {
  createVerifiedRequestContextFromClaims,
  assertVerifiedRequestContext,
} = require('../core/verifiedRequestContext');
const { assertBoundaryPorts } = require('./portContracts');

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function positiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeLimit(value, fallback = 25, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function requireText(value, fieldName) {
  const text = clean(value);
  if (!text) throw boundaryError('BOUNDARY_INPUT_REQUIRED', `${fieldName} is required`, 400);
  return text;
}

function requireResourceId(value) {
  const id = clean(value);
  if (!id) throw boundaryError('BOUNDARY_INPUT_REQUIRED', 'resource_id is required', 400);
  return id;
}

function createIntegrationBoundaryService(rawPorts) {
  const ports = assertBoundaryPorts(rawPorts);

  async function authenticate(accessToken) {
    const token = clean(accessToken);
    if (!token) {
      throw boundaryError('ACCESS_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    const claims = await ports.identityGateway.verifyAccessToken(token);
    return createVerifiedRequestContextFromClaims(claims);
  }

  async function searchUsers(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);

    if (trusted.workspace_id) {
      return ports.identityGateway.searchUsers({
        workspace_id: trusted.workspace_id,
        requester_identity_id: trusted.identity_id,
        requester_member_id: trusted.workspace_member_id,
        search_text: clean(input.search_text ?? input.searchText) || '',
        limit: safeLimit(input.limit, 50, 100),
      });
    }

    return ports.identityGateway.searchUsers({
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      requester_user_id: trusted.user_id,
      search_text: clean(input.search_text ?? input.searchText) || '',
      limit: safeLimit(input.limit, 50, 100),
    });
  }

  async function searchBusinessRecords(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);
    return ports.businessGateway.searchRecords({
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      branch_id: trusted.active_branch_id,
      actor_user_id: trusted.user_id,
      resource_type: requireText(
        input.resource_type ?? input.resourceType,
        'resource_type'
      ).toUpperCase(),
      query: clean(input.query) || '',
      limit: safeLimit(input.limit, 25, 100),
      correlation_id: clean(input.correlation_id ?? input.correlationId) || null,
    });
  }

  async function executeBusinessAction(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);

    return ports.businessGateway.executeAction({
      contract_version: clean(input.contract_version ?? input.contractVersion) || '1.0',
      action_attempt_id: requireText(
        input.action_attempt_id ?? input.actionAttemptId,
        'action_attempt_id'
      ),
      event_id: requireText(input.event_id ?? input.eventId, 'event_id'),
      correlation_id: requireText(
        input.correlation_id ?? input.correlationId,
        'correlation_id'
      ),
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      branch_id: trusted.active_branch_id,
      actor_user_id: trusted.user_id,
      resource_type: requireText(
        input.resource_type ?? input.resourceType,
        'resource_type'
      ).toUpperCase(),
      resource_id: requireResourceId(input.resource_id ?? input.resourceId),
      action: requireText(input.action, 'action').toUpperCase(),
      client_context: {
        surface: clean(input.client_context?.surface ?? input.clientContext?.surface) || 'UNKNOWN',
      },
    });
  }

  async function enqueuePush(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);
    const recipientUserId = positiveInt(input.recipient_user_id);
    if (!recipientUserId) {
      throw boundaryError('BOUNDARY_INPUT_REQUIRED', 'recipient_user_id is required', 400);
    }

    return ports.notificationPort.enqueuePush({
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      branch_id: trusted.active_branch_id,
      requested_by_user_id: trusted.user_id,
      recipient_user_id: recipientUserId,
      notification_type: requireText(input.notification_type, 'notification_type'),
      title: requireText(input.title, 'title'),
      body: requireText(input.body, 'body'),
      data: input.data && typeof input.data === 'object' ? { ...input.data } : {},
      correlation_id: clean(input.correlation_id) || null,
    });
  }

  return Object.freeze({
    authenticate,
    searchUsers,
    searchBusinessRecords,
    executeBusinessAction,
    enqueuePush,
  });
}

module.exports = {
  createIntegrationBoundaryService,
};
