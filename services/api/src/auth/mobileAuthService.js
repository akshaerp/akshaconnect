'use strict';

const crypto = require('node:crypto');
const { boundaryError } = require('../core/boundaryError');

const DEFAULT_AUTH_REQUEST_TTL_SECONDS = 10 * 60;
const DEFAULT_DEVICE_TTL_SECONDS = 365 * 24 * 60 * 60;
const DEFAULT_ACCESS_TTL_SECONDS = 8 * 60 * 60;
const MOBILE_REDIRECT_URI = 'akshaconnect://auth/callback';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizedEmail(value) {
  const email = clean(value).toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw boundaryError('MOBILE_EMAIL_INVALID', 'Enter a valid work email address.', 400);
  }
  return email;
}

function emailDomain(email) {
  return email.slice(email.lastIndexOf('@') + 1);
}

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function ttlSeconds(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function requestMetadataHashes(metadata = {}) {
  return {
    userAgentHash: metadata.userAgent ? sha256(metadata.userAgent) : null,
    clientIpHash: metadata.clientIp ? sha256(metadata.clientIp) : null,
  };
}

function createMobileAuthService({
  repository,
  identityGateway,
  ssoRepository,
  sessionRepository,
  authRequestTtlSeconds,
  deviceTtlSeconds,
  accessTtlSeconds,
} = {}) {
  if (!repository) throw new TypeError('Mobile auth repository is required');
  if (!sessionRepository || typeof sessionRepository.createSession !== 'function') {
    throw new TypeError('Session repository is required');
  }

  const requestTtl = ttlSeconds(
    authRequestTtlSeconds,
    DEFAULT_AUTH_REQUEST_TTL_SECONDS,
    30 * 60
  );
  const deviceTtl = ttlSeconds(
    deviceTtlSeconds,
    DEFAULT_DEVICE_TTL_SECONDS,
    730 * 24 * 60 * 60
  );
  const accessTtl = ttlSeconds(
    accessTtlSeconds,
    DEFAULT_ACCESS_TTL_SECONDS,
    7 * 24 * 60 * 60
  );

  async function discover(input = {}) {
    const email = normalizedEmail(input.email);
    const rows = await repository.discoverByEmailDomain(emailDomain(email));

    return Object.freeze({
      email,
      organizations: Object.freeze((rows || []).map((row) => Object.freeze({
        tenant_id: row.tenant_id,
        tenant_code: row.tenant_code,
        tenant_name: row.tenant_name,
        provider_code: row.provider_code,
        sign_in_label:
          row.provider_code === 'AKSHAERP'
            ? 'Continue with AkshaERP'
            : `Continue with ${row.provider_code}`,
      }))),
    });
  }

  async function startAkshaErp(input = {}, metadata = {}) {
    const email = normalizedEmail(input.email);
    const tenantId = clean(input.tenant_id ?? input.tenantId);
    const providerCode = clean((input.provider_code ?? input.providerCode) || 'AKSHAERP').toUpperCase();
    const redirectUri = clean((input.redirect_uri ?? input.redirectUri) || MOBILE_REDIRECT_URI);
    const devicePlatform = clean(input.device_platform ?? input.devicePlatform).toUpperCase();
    const deviceLabel = clean(input.device_label ?? input.deviceLabel).slice(0, 120) || null;

    if (!tenantId) {
      throw boundaryError('MOBILE_TENANT_REQUIRED', 'Choose an organization.', 400);
    }
    if (providerCode !== 'AKSHAERP') {
      throw boundaryError('MOBILE_PROVIDER_UNSUPPORTED', 'This sign-in provider is not supported by this build.', 400);
    }
    if (redirectUri !== MOBILE_REDIRECT_URI) {
      throw boundaryError('MOBILE_REDIRECT_URI_INVALID', 'Mobile redirect URI is invalid.', 400);
    }
    if (!['ANDROID', 'IOS'].includes(devicePlatform)) {
      throw boundaryError('MOBILE_DEVICE_PLATFORM_INVALID', 'Mobile device platform must be ANDROID or IOS.', 400);
    }

    const target = await repository.findDiscoveryTarget({
      tenantId,
      emailDomain: emailDomain(email),
      providerCode,
    });

    if (!target) {
      throw boundaryError('MOBILE_ORGANIZATION_NOT_AVAILABLE', 'The selected organization is not available for this email domain.', 404);
    }

    const stateValue = randomToken(24);
    const exchangeSecret = randomToken(32);
    const expiresAt = new Date(Date.now() + requestTtl * 1000);
    const hashes = requestMetadataHashes(metadata);

    const request = await repository.createAuthRequest({
      tenantId,
      providerCode,
      requestedEmail: email,
      redirectUri,
      stateValue,
      exchangeSecretHash: sha256(exchangeSecret),
      devicePlatform,
      deviceLabel,
      expiresAt,
      ...hashes,
    });

    const authorizationUrl = new URL('/acn/mobile-authorize', target.authorization_origin);
    authorizationUrl.searchParams.set('request_id', request.auth_request_id);

    return Object.freeze({
      request_id: request.auth_request_id,
      state: stateValue,
      exchange_secret: exchangeSecret,
      expires_at: new Date(request.expires_at).toISOString(),
      authorization_url: authorizationUrl.toString(),
      tenant: Object.freeze({
        tenant_id: target.tenant_id,
        tenant_code: target.tenant_code,
        tenant_name: target.tenant_name,
      }),
      provider_code: providerCode,
    });
  }

  async function authorizeAkshaErp(input = {}) {
    if (!identityGateway || typeof identityGateway.verifyAccessToken !== 'function') {
      throw boundaryError('AKSHAERP_MOBILE_AUTH_NOT_CONFIGURED', 'AkshaERP mobile sign-in is not configured.', 503);
    }
    if (!ssoRepository || typeof ssoRepository.provisionIdentity !== 'function') {
      throw boundaryError('AKSHAERP_MOBILE_AUTH_NOT_CONFIGURED', 'AkshaERP mobile sign-in is not configured.', 503);
    }

    const requestId = clean(input.request_id ?? input.requestId);
    const erpToken = clean(input.erp_access_token ?? input.erpAccessToken);

    if (!requestId || !erpToken) {
      throw boundaryError('MOBILE_AUTHORIZATION_REQUIRED', 'Mobile authorization request and ERP session are required.', 401);
    }

    const request = await repository.findActiveAuthRequest(requestId);
    if (!request || request.provider_code !== 'AKSHAERP') {
      throw boundaryError('MOBILE_AUTH_REQUEST_INVALID', 'Mobile sign-in request is invalid or expired.', 400);
    }
    if (request.authorized_at) {
      throw boundaryError('MOBILE_AUTH_REQUEST_ALREADY_AUTHORIZED', 'Mobile sign-in request was already authorized.', 409);
    }

    const claims = await identityGateway.verifyAccessToken(erpToken);
    const tenantSubject = clean(claims?.tenant_id).toUpperCase();
    const expectedTenantSubject = clean(request.provider_tenant_subject).toUpperCase();
    const userId = positiveInt(claims?.user_id);
    const organizationId = positiveInt(claims?.active_organization_id);
    const branchId = positiveInt(claims?.active_branch_id);
    const displayName = clean(claims?.display_name);
    const verifiedEmails = [claims?.akshamail, claims?.email]
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean);

    if (
      !tenantSubject ||
      tenantSubject !== expectedTenantSubject ||
      !userId ||
      !organizationId ||
      !displayName
    ) {
      throw boundaryError('MOBILE_AKSHAERP_IDENTITY_MISMATCH', 'The authenticated AkshaERP account does not belong to the selected organization.', 403);
    }

    if (!verifiedEmails.includes(clean(request.requested_email).toLowerCase())) {
      throw boundaryError(
        'MOBILE_AKSHAERP_EMAIL_MISMATCH',
        `Sign in with the AkshaERP account for ${request.requested_email}.`,
        403
      );
    }

    const provisioned = await ssoRepository.provisionIdentity({
      tenantId: claims.tenant_id,
      organizationId,
      branchId,
      userId,
      displayName,
      primaryEmail: clean(claims?.akshamail) || clean(claims?.email) || null,
      username: claims?.username,
      email: claims?.email,
      akshamail: claims?.akshamail,
    });

    if (clean(provisioned?.tenant_id) !== clean(request.tenant_id)) {
      throw boundaryError('MOBILE_TENANT_MAPPING_MISMATCH', 'Authenticated tenant does not match the selected AkshaConnect organization.', 403);
    }

    const authorizationCode = randomToken(32);
    const authorized = await repository.authorizeRequest({
      authRequestId: request.auth_request_id,
      authorizationCodeHash: sha256(authorizationCode),
      identityId: provisioned.identity_id,
      workspaceId: provisioned.workspace_id,
      workspaceMemberId: provisioned.workspace_member_id,
    });

    if (!authorized) {
      throw boundaryError('MOBILE_AUTH_REQUEST_INVALID', 'Mobile sign-in request is invalid, expired, or already used.', 409);
    }

    return Object.freeze({
      redirect_uri: authorized.redirect_uri,
      request_id: authorized.auth_request_id,
      code: authorizationCode,
      state: authorized.state_value,
      expires_at: new Date(authorized.expires_at).toISOString(),
    });
  }

  async function exchange(input = {}, metadata = {}) {
    const requestId = clean(input.request_id ?? input.requestId);
    const authorizationCode = clean(input.code);
    const stateValue = clean(input.state);
    const exchangeSecret = clean(input.exchange_secret ?? input.exchangeSecret);

    if (!requestId || !authorizationCode || !stateValue || !exchangeSecret) {
      throw boundaryError('MOBILE_EXCHANGE_INVALID', 'Mobile authorization exchange is incomplete.', 400);
    }

    const context = await repository.consumeAuthorization({
      authRequestId: requestId,
      authorizationCodeHash: sha256(authorizationCode),
      exchangeSecretHash: sha256(exchangeSecret),
      stateValue,
    });

    if (!context) {
      throw boundaryError('MOBILE_EXCHANGE_INVALID', 'Mobile authorization code is invalid, expired, or already used.', 401);
    }

    const deviceToken = randomToken(32);
    const deviceExpiresAt = new Date(Date.now() + deviceTtl * 1000);
    const accessToken = randomToken(32);
    const accessExpiresAt = new Date(Date.now() + accessTtl * 1000);
    const hashes = requestMetadataHashes(metadata);

    const deviceSession = await repository.createDeviceSession({
      workspaceId: context.workspace_id,
      workspaceMemberId: context.workspace_member_id,
      identityId: context.identity_id,
      identityProvider: context.provider_code,
      tokenHash: sha256(deviceToken),
      expiresAt: deviceExpiresAt,
      devicePlatform: context.device_platform,
      deviceLabel: context.device_label,
      ...hashes,
    });

    const session = await sessionRepository.createSession({
      workspaceId: context.workspace_id,
      workspaceMemberId: context.workspace_member_id,
      identityId: context.identity_id,
      identityProvider: context.provider_code,
      tokenHash: sha256(accessToken),
      expiresAt: accessExpiresAt,
      ...hashes,
    });

    const workspaces = await repository.listIdentityWorkspaces({
      identityId: context.identity_id,
      tenantId: context.tenant_id,
    });

    return Object.freeze({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: new Date(session.expires_at).toISOString(),
      session_id: session.session_id,
      device_token: deviceToken,
      device_expires_at: new Date(deviceSession.expires_at).toISOString(),
      identity: Object.freeze({
        identity_id: context.identity_id,
        display_name: context.display_name,
        primary_email: context.primary_email || null,
        identity_provider: context.provider_code,
      }),
      tenant: Object.freeze({
        tenant_id: context.tenant_id,
        tenant_code: context.tenant_code,
        tenant_name: context.tenant_name,
      }),
      workspace: Object.freeze({
        workspace_id: context.workspace_id,
        workspace_code: context.workspace_code,
        workspace_name: context.workspace_name,
      }),
      membership: Object.freeze({
        workspace_member_id: context.workspace_member_id,
        member_role: context.member_role,
      }),
      workspaces: Object.freeze(workspaces.map((row) => Object.freeze(row))),
    });
  }

  async function refresh(input = {}, metadata = {}) {
    const deviceToken = clean(input.device_token ?? input.deviceToken);
    if (!deviceToken) {
      throw boundaryError('MOBILE_DEVICE_TOKEN_REQUIRED', 'Mobile device token is required.', 401);
    }

    const row = await repository.findActiveDeviceSession(sha256(deviceToken));
    if (
      !row ||
      row.identity_status !== 'ACTIVE' ||
      row.workspace_status !== 'ACTIVE' ||
      row.member_status !== 'ACTIVE' ||
      (row.tenant_id && row.tenant_status !== 'ACTIVE')
    ) {
      throw boundaryError('MOBILE_DEVICE_SESSION_INVALID', 'Mobile device session is invalid or expired.', 401);
    }

    const nextDeviceExpiry = new Date(Date.now() + deviceTtl * 1000);
    const touched = await repository.touchDeviceSession({
      deviceSessionId: row.device_session_id,
      expiresAt: nextDeviceExpiry,
    });
    if (!touched) {
      throw boundaryError('MOBILE_DEVICE_SESSION_INVALID', 'Mobile device session is invalid or expired.', 401);
    }

    const accessToken = randomToken(32);
    const accessExpiresAt = new Date(Date.now() + accessTtl * 1000);
    const hashes = requestMetadataHashes(metadata);

    const session = await sessionRepository.createSession({
      workspaceId: row.workspace_id,
      workspaceMemberId: row.workspace_member_id,
      identityId: row.identity_id,
      identityProvider: row.identity_provider,
      tokenHash: sha256(accessToken),
      expiresAt: accessExpiresAt,
      ...hashes,
    });

    const workspaces = row.tenant_id
      ? await repository.listIdentityWorkspaces({ identityId: row.identity_id, tenantId: row.tenant_id })
      : [];

    return Object.freeze({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: new Date(session.expires_at).toISOString(),
      session_id: session.session_id,
      device_expires_at: new Date(touched.expires_at).toISOString(),
      identity: Object.freeze({
        identity_id: row.identity_id,
        display_name: row.display_name,
        primary_email: row.primary_email || null,
        identity_provider: row.identity_provider,
      }),
      tenant: row.tenant_id ? Object.freeze({
        tenant_id: row.tenant_id,
        tenant_code: row.tenant_code,
        tenant_name: row.tenant_name,
      }) : null,
      workspace: Object.freeze({
        workspace_id: row.workspace_id,
        workspace_code: row.workspace_code,
        workspace_name: row.workspace_name,
      }),
      membership: Object.freeze({
        workspace_member_id: row.workspace_member_id,
        member_role: row.member_role,
      }),
      workspaces: Object.freeze(workspaces.map((workspace) => Object.freeze(workspace))),
    });
  }

  async function logout(input = {}) {
    const deviceToken = clean(input.device_token ?? input.deviceToken);
    if (!deviceToken) {
      throw boundaryError('MOBILE_DEVICE_TOKEN_REQUIRED', 'Mobile device token is required.', 401);
    }
    await repository.revokeDeviceSession(sha256(deviceToken));
    return Object.freeze({ success: true });
  }

  return Object.freeze({
    discover,
    startAkshaErp,
    authorizeAkshaErp,
    exchange,
    refresh,
    logout,
  });
}

module.exports = {
  MOBILE_REDIRECT_URI,
  createMobileAuthService,
};
