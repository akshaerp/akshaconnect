'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMobileAuthService,
  MOBILE_REDIRECT_URI,
} = require('../services/api/src/auth/mobileAuthService');

function buildFixture() {
  const stored = {
    request: null,
    authorized: null,
    consumed: false,
    device: null,
    session: null,
  };

  const repository = {
    async discoverByEmailDomain(domain) {
      assert.equal(domain, 'akshaerp.com');
      return [{
        tenant_id: 'tenant-1',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
        provider_code: 'AKSHAERP',
        authorization_origin: 'https://app.akshaerp.com',
      }];
    },
    async findDiscoveryTarget(input) {
      assert.equal(input.tenantId, 'tenant-1');
      assert.equal(input.emailDomain, 'akshaerp.com');
      return {
        tenant_id: 'tenant-1',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
        provider_code: 'AKSHAERP',
        authorization_origin: 'https://app.akshaerp.com',
        provider_tenant_subject: 'APP',
      };
    },
    async createAuthRequest(input) {
      stored.request = {
        ...input,
        auth_request_id: 'request-1',
        created_at: new Date(),
        expires_at: input.expiresAt,
      };
      return stored.request;
    },
    async findActiveAuthRequest(id) {
      assert.equal(id, 'request-1');
      return {
        auth_request_id: 'request-1',
        tenant_id: 'tenant-1',
        provider_code: 'AKSHAERP',
        requested_email: 'user@akshaerp.com',
        redirect_uri: MOBILE_REDIRECT_URI,
        state_value: stored.request.stateValue,
        exchange_secret_hash: stored.request.exchangeSecretHash,
        device_platform: 'ANDROID',
        device_label: 'AkshaConnect Android',
        expires_at: stored.request.expiresAt,
        authorized_at: null,
        consumed_at: null,
        provider_tenant_subject: 'APP',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
      };
    },
    async authorizeRequest(input) {
      stored.authorized = input;
      return {
        auth_request_id: 'request-1',
        redirect_uri: MOBILE_REDIRECT_URI,
        state_value: stored.request.stateValue,
        expires_at: stored.request.expiresAt,
      };
    },
    async consumeAuthorization(input) {
      if (stored.consumed) return null;
      assert.equal(input.authRequestId, 'request-1');
      assert.equal(input.stateValue, stored.request.stateValue);
      stored.consumed = true;
      return {
        auth_request_id: 'request-1',
        tenant_id: 'tenant-1',
        provider_code: 'AKSHAERP',
        requested_email: 'user@akshaerp.com',
        device_platform: 'ANDROID',
        device_label: 'AkshaConnect Android',
        identity_id: 'identity-1',
        workspace_id: 'workspace-1',
        workspace_member_id: 'member-1',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
        display_name: 'Test User',
        primary_email: 'user@akshaerp.com',
        member_role: 'MEMBER',
        workspace_code: 'AKSHAERP',
        workspace_name: 'Company',
      };
    },
    async listIdentityWorkspaces() {
      return [{
        workspace_id: 'workspace-1',
        workspace_code: 'AKSHAERP',
        workspace_name: 'Company',
        workspace_member_id: 'member-1',
        member_role: 'MEMBER',
        default_flag: 'Y',
      }];
    },
    async createDeviceSession(input) {
      stored.device = input;
      return {
        device_session_id: 'device-session-1',
        expires_at: input.expiresAt,
      };
    },
    async findActiveDeviceSession() {
      return {
        device_session_id: 'device-session-1',
        workspace_id: 'workspace-1',
        workspace_member_id: 'member-1',
        identity_id: 'identity-1',
        identity_provider: 'AKSHAERP',
        device_platform: 'ANDROID',
        device_label: 'AkshaConnect Android',
        identity_status: 'ACTIVE',
        workspace_status: 'ACTIVE',
        member_status: 'ACTIVE',
        tenant_id: 'tenant-1',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
        tenant_status: 'ACTIVE',
        display_name: 'Test User',
        primary_email: 'user@akshaerp.com',
        workspace_code: 'AKSHAERP',
        workspace_name: 'Company',
        member_role: 'MEMBER',
      };
    },
    async touchDeviceSession({ expiresAt }) {
      return { expires_at: expiresAt };
    },
    async revokeDeviceSession() {
      return true;
    },
  };

  const identityGateway = {
    async verifyAccessToken(token) {
      assert.equal(token, 'erp-token');
      return {
        tenant_id: 'APP',
        user_id: 27,
        active_organization_id: 11,
        active_branch_id: 16,
        display_name: 'Test User',
        username: 'test.user',
        email: 'user@akshaerp.com',
        akshamail: 'user@akshaerp.com',
      };
    },
  };

  const ssoRepository = {
    async provisionIdentity(input) {
      assert.equal(input.userId, 27);
      return {
        identity_id: 'identity-1',
        tenant_id: 'tenant-1',
        workspace_id: 'workspace-1',
        workspace_member_id: 'member-1',
      };
    },
  };

  const sessionRepository = {
    async createSession(input) {
      stored.session = input;
      return {
        session_id: 'session-1',
        expires_at: input.expiresAt,
      };
    },
  };

  const service = createMobileAuthService({
    repository,
    identityGateway,
    ssoRepository,
    sessionRepository,
  });

  return { service, stored };
}

test('mobile discovery returns company/provider without authenticating the user', async () => {
  const { service } = buildFixture();
  const result = await service.discover({ email: ' User@AkshaERP.com ' });

  assert.equal(result.email, 'user@akshaerp.com');
  assert.equal(result.organizations.length, 1);
  assert.equal(result.organizations[0].tenant_code, 'AKSHAERP_INTERNAL');
  assert.equal(result.organizations[0].provider_code, 'AKSHAERP');
});

test('mobile start creates server-side proof and ERP authorization URL', async () => {
  const { service, stored } = buildFixture();
  const result = await service.startAkshaErp({
    email: 'user@akshaerp.com',
    tenant_id: 'tenant-1',
    provider_code: 'AKSHAERP',
    redirect_uri: MOBILE_REDIRECT_URI,
    device_platform: 'ANDROID',
    device_label: 'AkshaConnect Android',
  });

  assert.equal(result.request_id, 'request-1');
  assert.ok(result.state.length >= 20);
  assert.ok(result.exchange_secret.length >= 30);
  assert.equal(
    result.authorization_url,
    'https://app.akshaerp.com/acn/mobile-authorize?request_id=request-1'
  );
  assert.notEqual(stored.request.exchangeSecretHash, result.exchange_secret);
});

test('ERP authorization verifies tenant/email and provisions only after ERP authentication', async () => {
  const { service, stored } = buildFixture();
  await service.startAkshaErp({
    email: 'user@akshaerp.com',
    tenant_id: 'tenant-1',
    device_platform: 'ANDROID',
  });

  const result = await service.authorizeAkshaErp({
    request_id: 'request-1',
    erp_access_token: 'erp-token',
  });

  assert.equal(result.redirect_uri, MOBILE_REDIRECT_URI);
  assert.equal(result.request_id, 'request-1');
  assert.ok(result.code.length >= 30);
  assert.equal(stored.authorized.identityId, 'identity-1');
});

test('mobile exchange creates AKSHAERP device/access sessions and is one-time', async () => {
  const { service, stored } = buildFixture();
  const started = await service.startAkshaErp({
    email: 'user@akshaerp.com',
    tenant_id: 'tenant-1',
    device_platform: 'ANDROID',
  });

  const authorized = await service.authorizeAkshaErp({
    request_id: 'request-1',
    erp_access_token: 'erp-token',
  });

  const result = await service.exchange({
    request_id: 'request-1',
    code: authorized.code,
    state: authorized.state,
    exchange_secret: started.exchange_secret,
  });

  assert.equal(result.identity.identity_provider, 'AKSHAERP');
  assert.equal(result.tenant.tenant_code, 'AKSHAERP_INTERNAL');
  assert.equal(stored.device.identityProvider, 'AKSHAERP');
  assert.equal(stored.session.identityProvider, 'AKSHAERP');

  await assert.rejects(
    service.exchange({
      request_id: 'request-1',
      code: authorized.code,
      state: authorized.state,
      exchange_secret: started.exchange_secret,
    }),
    (error) => error?.code === 'MOBILE_EXCHANGE_INVALID'
  );
});

test('provider-neutral refresh preserves AKSHAERP identity provider', async () => {
  const { service, stored } = buildFixture();
  const result = await service.refresh({ device_token: 'device-token' });

  assert.equal(result.identity.identity_provider, 'AKSHAERP');
  assert.equal(result.tenant.tenant_code, 'AKSHAERP_INTERNAL');
  assert.equal(stored.session.identityProvider, 'AKSHAERP');
});
