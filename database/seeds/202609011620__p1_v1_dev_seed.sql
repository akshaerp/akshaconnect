-- DEV/TEST ONLY. Do not run in production.
BEGIN;

INSERT INTO ac_workspace (workspace_id, workspace_code, workspace_name)
VALUES
 ('11111111-1111-4111-8111-111111111111','DEV_ALPHA','AkshaConnect Dev Alpha'),
 ('22222222-2222-4222-8222-222222222222','DEV_BETA','AkshaConnect Dev Beta')
ON CONFLICT (workspace_code) DO NOTHING;

INSERT INTO ac_identity (identity_id, display_name, primary_email)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Alice Alpha','alice.alpha@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','Bob Alpha','bob.alpha@example.invalid'),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','Carol Beta','carol.beta@example.invalid')
ON CONFLICT (identity_id) DO NOTHING;

INSERT INTO ac_identity_provider_link (identity_provider_link_id, identity_id, provider_code, external_subject)
VALUES
 ('d1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','LOCAL','dev-alice'),
 ('d2222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','LOCAL','dev-bob'),
 ('d3333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','LOCAL','dev-carol')
ON CONFLICT (provider_code, external_subject) DO NOTHING;

INSERT INTO ac_workspace_member (workspace_member_id, workspace_id, identity_id, member_role)
VALUES
 ('e1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','OWNER'),
 ('e2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','MEMBER'),
 ('e3333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','OWNER')
ON CONFLICT (workspace_id, identity_id) DO NOTHING;

INSERT INTO ac_conversation (conversation_id, workspace_id, conversation_type, title, created_by_member_id)
VALUES
 ('f1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','CHANNEL','general','e1111111-1111-4111-8111-111111111111'),
 ('f2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','CHANNEL','general','e3333333-3333-4333-8333-333333333333')
ON CONFLICT (conversation_id) DO NOTHING;

INSERT INTO ac_channel (channel_id, workspace_id, conversation_id, channel_code, channel_name, visibility, created_by_member_id)
VALUES
 ('c1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111','general','General','PUBLIC','e1111111-1111-4111-8111-111111111111'),
 ('c2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','f2222222-2222-4222-8222-222222222222','general','General','PUBLIC','e3333333-3333-4333-8333-333333333333')
ON CONFLICT (workspace_id, channel_code) DO NOTHING;

INSERT INTO ac_channel_member (workspace_id, channel_id, workspace_member_id, member_role)
VALUES
 ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','OWNER'),
 ('11111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222','MEMBER'),
 ('22222222-2222-4222-8222-222222222222','c2222222-2222-4222-8222-222222222222','e3333333-3333-4333-8333-333333333333','OWNER')
ON CONFLICT DO NOTHING;

COMMIT;
