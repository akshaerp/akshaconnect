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
    return ports.identityGateway.searchUsers({
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      requester_user_id: trusted.user_id,
      search_text: clean(input.search_text ?? input.searchText) || '',
      limit: safeLimit(input.limit, 50, 100),
    });
  }

  async function lookupErpRecords(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);
    return ports.erpGateway.lookupRecords({
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      branch_id: trusted.active_branch_id,
      user_id: trusted.user_id,
      module_code: requireText(input.module_code, 'module_code'),
      function_code: requireText(input.function_code, 'function_code'),
      entity_type: requireText(input.entity_type, 'entity_type'),
      query: clean(input.query) || '',
      limit: safeLimit(input.limit, 25, 100),
      correlation_id: clean(input.correlation_id) || null,
    });
  }

  async function executeErpAction(context, input = {}) {
    const trusted = assertVerifiedRequestContext(context);
    const entityId = positiveInt(input.entity_id);
    if (!entityId) throw boundaryError('BOUNDARY_INPUT_REQUIRED', 'entity_id is required', 400);

    return ports.erpGateway.executeAction({
      contract_version: clean(input.contract_version) || '1.0',
      action_attempt_id: requireText(input.action_attempt_id, 'action_attempt_id'),
      event_id: requireText(input.event_id, 'event_id'),
      correlation_id: requireText(input.correlation_id, 'correlation_id'),
      tenant_id: trusted.tenant_id,
      organization_id: trusted.active_organization_id,
      branch_id: trusted.active_branch_id,
      user_id: trusted.user_id,
      entity_type: requireText(input.entity_type, 'entity_type'),
      entity_id: entityId,
      action_code: requireText(input.action_code, 'action_code').toUpperCase(),
      client_context: {
        surface: clean(input.client_context?.surface) || 'UNKNOWN',
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
    lookupErpRecords,
    executeErpAction,
    enqueuePush,
  });
}

module.exports = {
  createIntegrationBoundaryService,
};
