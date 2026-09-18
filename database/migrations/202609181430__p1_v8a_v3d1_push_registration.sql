BEGIN;

CREATE TABLE ac_push_registration (
    push_registration_id UUID
        PRIMARY KEY
        DEFAULT gen_random_uuid(),

    device_session_id UUID NOT NULL
        REFERENCES ac_device_session(
            device_session_id
        )
        ON DELETE CASCADE,

    provider VARCHAR(20) NOT NULL,

    platform VARCHAR(20) NOT NULL,

    push_token TEXT NOT NULL,

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    last_seen_at TIMESTAMPTZ
        NOT NULL
        DEFAULT NOW(),

    revoked_at TIMESTAMPTZ,

    CONSTRAINT uq_ac_push_registration_provider_token
        UNIQUE (
            provider,
            push_token
        ),

    CONSTRAINT ck_ac_push_registration_provider
        CHECK (
            provider IN ('FCM')
        ),

    CONSTRAINT ck_ac_push_registration_platform
        CHECK (
            platform IN (
                'ANDROID',
                'IOS'
            )
        ),

    CONSTRAINT ck_ac_push_registration_token_length
        CHECK (
            char_length(push_token)
                BETWEEN 20 AND 4096
        ),

    CONSTRAINT ck_ac_push_registration_revocation
        CHECK (
            revoked_at IS NULL
            OR revoked_at >= created_at
        )
);

CREATE INDEX ix_ac_push_registration_active_device
    ON ac_push_registration(
        device_session_id,
        provider,
        last_seen_at DESC
    )
    WHERE revoked_at IS NULL;
-- AkshaConnect application role requires only the privileges used by
-- push registration and push delivery. DELETE is intentionally omitted.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.ac_push_registration
TO akshaconnect;

COMMIT;