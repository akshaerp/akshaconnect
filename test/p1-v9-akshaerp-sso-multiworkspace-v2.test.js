'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  providerTenantSubject,
  providerIdentitySubject,
} = require('../services/api/src/auth/akshaErpSsoRepository');

const {
  createAkshaErpSsoService,
} = require('../services/api/src/auth/akshaErpSsoService');

test('provider subjects isolate ERP tenants and users', () => {
  assert.equal(providerTenantSubject('app'), 'APP');
  assert.equal(providerIdentitySubject('app', 2), 'APP:2');
  assert.equal(providerIdentitySubject('VISALAANDHRA', 2), 'VISALAANDHRA:2');
  assert.notEqual(
    providerIdentitySubject('app', 2),
    providerIdentitySubject('VISALAANDHRA', 2)
  );
});

test('SSO result carries tenant plus multiple-workspace membership list', async () => {
  const calls = {};

  const identityGateway = {
    async verifyAccessToken(token) {
      calls.erpToken = token;
      return {
        tenant_id: 'app',
        user_id: 2,
        active_organization_id: 11,
        active_branch_id: 16,
        display_name: 'Test User',
        email: 'test@example.com',
        akshamail: 'test@aksha.example',
        username: 'test',
      };
    },
  };

  const repository = {
    async provisionIdentity(input) {
      calls.provision = input;
      return {
        identity_id: '11111111-1111-1111-1111-111111111111',
        display_name: input.displayName,
        primary_email: input.primaryEmail,
        tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        tenant_code: 'AKSHAERP_INTERNAL',
        tenant_name: 'AkshaERP Solutions Private Limited',
        workspace_id: '22222222-2222-2222-2222-222222222222',
        workspace_code: 'AKSHAERP',
        workspace_name: 'AkshaERP Solutions Private Limited',
        workspace_member_id: '33333333-3333-3333-3333-333333333333',
        member_role: 'MEMBER',
        workspaces: [
          {
            workspace_id: '22222222-2222-2222-2222-222222222222',
            workspace_code: 'AKSHAERP',
            workspace_name: 'AkshaERP Solutions Private Limited',
            workspace_member_id: '33333333-3333-3333-3333-333333333333',
            member_role: 'MEMBER',
            default_flag: 'Y',
          },
          {
            workspace_id: '44444444-4444-4444-4444-444444444444',
            workspace_code: 'DEV',
            workspace_name: 'Development',
            workspace_member_id: '55555555-5555-5555-5555-555555555555',
            member_role: 'MEMBER',
            default_flag: 'N',
          },
        ],
        created_identity: true,
        created_membership: true,
        external_subject: 'APP:2',
      };
    },
  };

  const sessionRepository = {
    async createSession(input) {
      calls.session = input;
      return {
        session_id: '66666666-6666-6666-6666-666666666666',
        expires_at: input.expiresAt,
      };
    },
  };

  const service = createAkshaErpSsoService({
    identityGateway,
    repository,
    sessionRepository,
    sessionTtlSeconds: 3600,
  });

  const result = await service.loginFromErpToken('erp-token', {
    userAgent: 'test-agent',
    clientIp: '127.0.0.1',
  });

  assert.equal(calls.erpToken, 'erp-token');
  assert.equal(calls.provision.tenantId, 'app');
  assert.equal(calls.session.identityProvider, 'AKSHAERP');
  assert.equal(result.tenant.tenant_code, 'AKSHAERP_INTERNAL');
  assert.equal(result.identity.external_subject, 'APP:2');
  assert.equal(result.workspaces.length, 2);
  assert.equal(result.workspace.workspace_code, 'AKSHAERP');
});
