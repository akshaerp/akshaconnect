'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createCollaborationService,
} = require(
  '../services/api/src/collaboration/collaborationService'
);

const WORKSPACE =
  '11111111-1111-4111-8111-111111111111';
const ALICE =
  'e1111111-1111-4111-8111-111111111111';
const BOB =
  'e2222222-2222-4222-8222-222222222222';
const CAROL =
  'e3333333-3333-4333-8333-333333333333';
const CONVERSATION =
  'c1111111-1111-4111-8111-111111111111';

function claims(memberId = ALICE) {
  return {
    identity_id:
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    workspace_id: WORKSPACE,
    workspace_member_id: memberId,
  };
}

function activeMember(
  memberId,
  role = 'MEMBER'
) {
  return {
    workspace_member_id: memberId,
    identity_id:
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    member_role: role,
    member_status: 'ACTIVE',
    identity_status: 'ACTIVE',
    display_name:
      memberId === BOB
        ? 'Bob Alpha'
        : memberId === CAROL
          ? 'Carol Alpha'
          : 'Alice Alpha',
    primary_email: null,
  };
}

function repository({
  workspaceRole = 'MEMBER',
  channelRole = 'MEMBER',
  visibility = 'PRIVATE',
  requesterIsMember = true,
  targetChannelRole = 'MEMBER',
} = {}) {
  const calls = {
    add: null,
    remove: null,
  };

  return {
    calls,
    repo: {
      async getActiveWorkspaceMember({
        workspaceMemberId,
      }) {
        if (workspaceMemberId === ALICE) {
          return activeMember(
            ALICE,
            workspaceRole
          );
        }

        return activeMember(
          workspaceMemberId,
          'MEMBER'
        );
      },

      async getChannelForConversation() {
        return {
          channel_id: 'channel-1',
          conversation_id: CONVERSATION,
          channel_name: 'Private Team',
          visibility,
          requester_is_member:
            requesterIsMember,
          requester_channel_role:
            channelRole,
        };
      },

      async listChannelMembers() {
        return [
          {
            workspace_member_id: ALICE,
            member_role: channelRole,
            display_name: 'Alice Alpha',
          },
        ];
      },

      async getChannelMember({
        workspaceMemberId,
      }) {
        return {
          workspace_member_id:
            workspaceMemberId,
          member_role:
            targetChannelRole,
          display_name: 'Target',
        };
      },

      async addChannelMember(input) {
        calls.add = input;
        return {
          workspace_member_id:
            input.workspaceMemberId,
          member_role: 'MEMBER',
          display_name: 'Bob Alpha',
        };
      },

      async removeChannelMember(input) {
        calls.remove = input;
        return {
          workspace_member_id:
            input.workspaceMemberId,
          member_role:
            targetChannelRole,
        };
      },
    },
  };
}

test(
  'V14.2 regular private-channel member can list people but cannot manage them',
  async () => {
    const { repo, calls } = repository();
    const service =
      createCollaborationService(repo);

    const listed =
      await service.listChannelMembers(
        claims(),
        CONVERSATION
      );

    assert.equal(
      listed.can_manage_members,
      false
    );

    await assert.rejects(
      () =>
        service.addChannelMember(
          claims(),
          CONVERSATION,
          {
            workspace_member_id: BOB,
          }
        ),
      (error) =>
        error.code ===
          'CHANNEL_MEMBER_MANAGE_FORBIDDEN' &&
        error.statusCode === 403
    );

    assert.equal(calls.add, null);
  }
);

test(
  'V14.2 channel moderator can add ordinary workspace members',
  async () => {
    const { repo, calls } = repository({
      channelRole: 'MODERATOR',
    });

    const service =
      createCollaborationService(repo);

    const result =
      await service.addChannelMember(
        claims(),
        CONVERSATION,
        {
          workspace_member_id: BOB,
        }
      );

    assert.equal(
      result.member.workspace_member_id,
      BOB
    );

    assert.deepEqual(calls.add, {
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      workspaceMemberId: BOB,
    });
  }
);

test(
  'V14.2 workspace admin can manage a private channel without explicit membership',
  async () => {
    const { repo } = repository({
      workspaceRole: 'ADMIN',
      channelRole: '',
      requesterIsMember: false,
    });

    const service =
      createCollaborationService(repo);

    const result =
      await service.listChannelMembers(
        claims(),
        CONVERSATION
      );

    assert.equal(
      result.can_manage_members,
      true
    );
  }
);

test(
  'V14.2 private channel remains hidden from nonmember regular workspace users',
  async () => {
    const { repo } = repository({
      requesterIsMember: false,
      channelRole: '',
    });

    const service =
      createCollaborationService(repo);

    await assert.rejects(
      () =>
        service.listChannelMembers(
          claims(),
          CONVERSATION
        ),
      (error) =>
        error.code ===
          'CHANNEL_NOT_FOUND' &&
        error.statusCode === 404
    );
  }
);

test(
  'V14.2 channel owner membership is protected from removal',
  async () => {
    const { repo, calls } = repository({
      channelRole: 'OWNER',
      targetChannelRole: 'OWNER',
    });

    const service =
      createCollaborationService(repo);

    await assert.rejects(
      () =>
        service.removeChannelMember(
          claims(),
          CONVERSATION,
          BOB
        ),
      (error) =>
        error.code ===
          'CHANNEL_OWNER_PROTECTED' &&
        error.statusCode === 409
    );

    assert.equal(calls.remove, null);
  }
);

test(
  'V14.2 moderator cannot remove another moderator',
  async () => {
    const { repo, calls } = repository({
      channelRole: 'MODERATOR',
      targetChannelRole: 'MODERATOR',
    });

    const service =
      createCollaborationService(repo);

    await assert.rejects(
      () =>
        service.removeChannelMember(
          claims(),
          CONVERSATION,
          CAROL
        ),
      (error) =>
        error.code ===
          'CHANNEL_MEMBER_MANAGE_FORBIDDEN' &&
        error.statusCode === 403
    );

    assert.equal(calls.remove, null);
  }
);

test(
  'V14.2 repository preserves membership history using left_at',
  () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'services',
        'api',
        'src',
        'collaboration',
        'collaborationRepository.js'
      ),
      'utf8'
    );

    assert.match(
      source,
      /async function listChannelMembers/
    );
    assert.match(
      source,
      /async function addChannelMember/
    );
    assert.match(
      source,
      /async function removeChannelMember/
    );
    assert.match(
      source,
      /SET left_at = NOW\(\)/
    );
    assert.match(
      source,
      /left_at = NULL/
    );
    assert.doesNotMatch(
      source,
      /DELETE FROM ac_channel_member/
    );
  }
);

test(
  'V14.2 HTTP surface exposes authenticated channel-member list/add/remove routes',
  () => {
    const app = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'services',
        'api',
        'src',
        'app.js'
      ),
      'utf8'
    );

    assert.match(
      app,
      /channelMembersRoute/
    );
    assert.match(
      app,
      /channelMemberRoute/
    );
    assert.match(
      app,
      /collaborationService\.listChannelMembers/
    );
    assert.match(
      app,
      /collaborationService\.addChannelMember/
    );
    assert.match(
      app,
      /collaborationService\.removeChannelMember/
    );
    assert.match(
      app,
      /verifyAccessToken/
    );
  }
);

test(
  'V14.2 mobile exposes channel People UI with search add and remove',
  () => {
    const api = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'mobile',
        'src',
        'api',
        'channelMembers.js'
      ),
      'utf8'
    );

    const screen = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'mobile',
        'src',
        'screens',
        'ConversationScreen.jsx'
      ),
      'utf8'
    );

    const details = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'mobile',
        'src',
        'screens',
        'ConversationDetailsModal.jsx'
      ),
      'utf8'
    );

    assert.match(
      api,
      /export function listChannelMembers/
    );
    assert.match(
      api,
      /export function addChannelMember/
    );
    assert.match(
      api,
      /export function removeChannelMember/
    );
    assert.match(
      screen,
      /accessibilityLabel="Conversation details"/
    );
    assert.match(
      screen,
      /<ConversationDetailsModal/
    );
    assert.match(
      details,
      /Search workspace people/
    );
    assert.match(
      details,
      /Add people/
    );
    assert.match(
      details,
      /Remove/
    );
  }
);

test(
  'V14.2 web exposes channel People dialog with search add and remove',
  () => {
    const api = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'web',
        'src',
        'channelMembersApi.js'
      ),
      'utf8'
    );

    const app = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'web',
        'src',
        'App.jsx'
      ),
      'utf8'
    );

    const css = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'web',
        'src',
        'channelMembers.css'
      ),
      'utf8'
    );

    assert.match(
      api,
      /export function listChannelMembers/
    );
    assert.match(
      app,
      /function ChannelPeopleDialog/
    );
    assert.match(
      app,
      /className="channel-people-button"/
    );
    assert.match(
      app,
      /Search workspace people/
    );
    assert.match(
      app,
      /removeChannelMember/
    );
    assert.match(
      css,
      /\.channel-people-dialog/
    );
  }
);

test(
  'V14.2 requires no database migration and remains valid on the current VC20 Android identity',
  () => {
    const schema = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'database',
        'migrations',
        '202609011610__p1_v1_collaboration_foundation.sql'
      ),
      'utf8'
    );

    const gradle = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'apps',
        'mobile',
        'android',
        'app',
        'build.gradle'
      ),
      'utf8'
    );

    assert.match(
      schema,
      /CREATE TABLE ac_channel_member/
    );
    assert.match(
      schema,
      /member_role IN \('OWNER', 'MODERATOR', 'MEMBER'\)/
    );
    assert.match(
      schema,
      /left_at TIMESTAMPTZ/
    );
    assert.match(
      gradle,
      /versionCode 20/
    );
    assert.match(
      gradle,
      /versionName "0\.3\.0-v20"/
    );
  }
);
