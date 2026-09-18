'use strict';

const crypto = require('node:crypto');

const {
  boundaryError,
} = require('../core/boundaryError');

const SUPPORTED_PROVIDER = 'FCM';
const SUPPORTED_PLATFORMS =
  new Set(['ANDROID', 'IOS']);

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex');
}

function trustedClaims(claims = {}) {
  const workspaceId =
    clean(claims.workspace_id);

  const workspaceMemberId =
    clean(claims.workspace_member_id);

  const identityId =
    clean(claims.identity_id);

  if (
    !workspaceId ||
    !workspaceMemberId ||
    !identityId
  ) {
    throw boundaryError(
      'VERIFIED_CONTEXT_REQUIRED',
      'Trusted workspace context is required',
      401
    );
  }

  return {
    workspaceId,
    workspaceMemberId,
    identityId,
  };
}

function normalizeProvider(value) {
  const provider =
    clean(value || SUPPORTED_PROVIDER)
      .toUpperCase();

  if (provider !== SUPPORTED_PROVIDER) {
    throw boundaryError(
      'PUSH_PROVIDER_INVALID',
      'Push provider must be FCM',
      400
    );
  }

  return provider;
}

function normalizePlatform(value) {
  const platform =
    clean(value).toUpperCase();

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw boundaryError(
      'PUSH_PLATFORM_INVALID',
      'Push platform must be ANDROID or IOS',
      400
    );
  }

  return platform;
}

function normalizePushToken(value) {
  const pushToken = clean(value);

  if (
    pushToken.length < 20 ||
    pushToken.length > 4096
  ) {
    throw boundaryError(
      'PUSH_TOKEN_INVALID',
      'Push registration token is invalid',
      400
    );
  }

  return pushToken;
}

function createPushRegistrationService({
  identityRepository,
  pushRegistrationRepository,
} = {}) {
  if (
    !identityRepository ||
    typeof identityRepository
      .findActiveDeviceSession !== 'function'
  ) {
    throw new TypeError(
      'Identity repository is required'
    );
  }

  if (
    !pushRegistrationRepository ||
    typeof pushRegistrationRepository
      .upsertRegistration !== 'function'
  ) {
    throw new TypeError(
      'Push registration repository is required'
    );
  }

  async function requireDeviceSession(
    claims,
    input = {}
  ) {
    const actor = trustedClaims(claims);

    const deviceToken =
      clean(
        input.device_token ??
        input.deviceToken
      );

    if (!deviceToken) {
      throw boundaryError(
        'MOBILE_DEVICE_TOKEN_REQUIRED',
        'Mobile device token is required',
        401
      );
    }

    const row =
      await identityRepository
        .findActiveDeviceSession(
          sha256(deviceToken)
        );

    if (
      !row ||
      clean(row.workspace_id) !==
        actor.workspaceId ||
      clean(row.workspace_member_id) !==
        actor.workspaceMemberId ||
      clean(row.identity_id) !==
        actor.identityId
    ) {
      throw boundaryError(
        'MOBILE_DEVICE_SESSION_INVALID',
        'Mobile device session is invalid or expired',
        401
      );
    }

    return {
      actor,
      deviceSession: row,
    };
  }

  async function register(
    claims,
    input = {}
  ) {
    const {
      deviceSession,
    } =
      await requireDeviceSession(
        claims,
        input
      );

    const provider =
      normalizeProvider(
        input.provider
      );

    const platform =
      normalizePlatform(
        input.platform ??
        deviceSession.device_platform
      );

    if (
      platform !==
      clean(
        deviceSession.device_platform
      ).toUpperCase()
    ) {
      throw boundaryError(
        'PUSH_PLATFORM_MISMATCH',
        'Push platform does not match the mobile device session',
        400
      );
    }

    const pushToken =
      normalizePushToken(
        input.push_token ??
        input.pushToken
      );

    const registration =
      await pushRegistrationRepository
        .upsertRegistration({
          deviceSessionId:
            deviceSession.device_session_id,
          provider,
          platform,
          pushToken,
        });

    return Object.freeze({
      registered: true,
      push_registration_id:
        registration?.push_registration_id ||
        null,
      provider,
      platform,
      last_seen_at:
        registration?.last_seen_at ||
        null,
    });
  }

  async function unregister(
    claims,
    input = {}
  ) {
    const {
      deviceSession,
    } =
      await requireDeviceSession(
        claims,
        input
      );

    const provider =
      normalizeProvider(
        input.provider
      );

    const rawPushToken =
      clean(
        input.push_token ??
        input.pushToken
      );

    const pushToken =
      rawPushToken
        ? normalizePushToken(rawPushToken)
        : null;

    const revoked =
      await pushRegistrationRepository
        .revokeRegistration({
          deviceSessionId:
            deviceSession.device_session_id,
          provider,
          pushToken,
        });

    return Object.freeze({
      success: true,
      revoked,
    });
  }

  return Object.freeze({
    register,
    unregister,
  });
}

module.exports = {
  SUPPORTED_PROVIDER,
  clean,
  sha256,
  createPushRegistrationService,
};