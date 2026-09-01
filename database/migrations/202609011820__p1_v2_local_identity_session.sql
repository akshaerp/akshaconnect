BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_identity_provider_local_subject_ci
    ON ac_identity_provider_link (LOWER(external_subject))
    WHERE provider_code = 'LOCAL';

ALTER TABLE ac_workspace_member
    ADD CONSTRAINT uq_ac_workspace_member_identity_scope
    UNIQUE (workspace_id, workspace_member_id, identity_id);

CREATE TABLE ac_local_credential (
    identity_id UUID PRIMARY KEY
        REFERENCES ac_identity(identity_id)
        ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    credential_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ac_local_credential_status
        CHECK (credential_status IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT ck_ac_local_credential_failed_attempts
        CHECK (failed_attempts >= 0)
);

CREATE TABLE ac_session (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL
        REFERENCES ac_workspace(workspace_id)
        ON DELETE CASCADE,
    workspace_member_id UUID NOT NULL,
    identity_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    user_agent_hash CHAR(64),
    client_ip_hash CHAR(64),
    CONSTRAINT uq_ac_session_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_ac_session_member_identity
        FOREIGN KEY (workspace_id, workspace_member_id, identity_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id, identity_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_ac_session_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_ac_session_revocation
        CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX ix_ac_session_active_member
    ON ac_session(workspace_id, workspace_member_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX ix_ac_session_identity
    ON ac_session(identity_id, expires_at DESC);

COMMIT;
