BEGIN;

CREATE TABLE ac_device_session (
    device_session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES ac_workspace(workspace_id)
        ON DELETE CASCADE,

    workspace_member_id UUID NOT NULL,
    identity_id UUID NOT NULL,

    device_token_hash CHAR(64) NOT NULL,

    device_platform VARCHAR(20) NOT NULL,
    device_label VARCHAR(120),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    user_agent_hash CHAR(64),
    client_ip_hash CHAR(64),

    CONSTRAINT uq_ac_device_session_token_hash
        UNIQUE (device_token_hash),

    CONSTRAINT fk_ac_device_session_member_identity
        FOREIGN KEY (
            workspace_id,
            workspace_member_id,
            identity_id
        )
        REFERENCES ac_workspace_member(
            workspace_id,
            workspace_member_id,
            identity_id
        )
        ON DELETE CASCADE,

    CONSTRAINT ck_ac_device_session_platform
        CHECK (
            device_platform IN ('ANDROID', 'IOS')
        ),

    CONSTRAINT ck_ac_device_session_expiry
        CHECK (expires_at > created_at),

    CONSTRAINT ck_ac_device_session_revocation
        CHECK (
            revoked_at IS NULL
            OR revoked_at >= created_at
        )
);

CREATE INDEX ix_ac_device_session_active_identity
    ON ac_device_session(
        identity_id,
        expires_at DESC
    )
    WHERE revoked_at IS NULL;

CREATE INDEX ix_ac_device_session_active_member
    ON ac_device_session(
        workspace_id,
        workspace_member_id,
        expires_at DESC
    )
    WHERE revoked_at IS NULL;

COMMIT;
