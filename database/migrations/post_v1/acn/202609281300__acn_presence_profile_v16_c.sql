-- AkshaConnect V16-C Presence Profile
-- Additive migration: durable custom status, expiry, and last-seen metadata.
-- Deployment runner owns transaction + migration ledger.

DO $$
DECLARE
    v_count bigint;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_workspace_member') IS NULL
       OR to_regclass('public.ac_db_baseline') IS NULL
       OR to_regclass('public.ac_db_migrations') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect foundation is missing';
    END IF;

    IF to_regclass('public.ac_member_presence_profile') IS NOT NULL THEN
        RAISE EXCEPTION 'ac_member_presence_profile already exists before V16-C migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_baseline
    WHERE baseline_code = 'AKSHACONNECT_DB_BASELINE_V1';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one AKSHACONNECT_DB_BASELINE_V1 marker, found %', v_count;
    END IF;
END
$$;

CREATE TABLE public.ac_member_presence_profile (
    workspace_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    custom_status VARCHAR(120),
    status_expires_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (workspace_id, workspace_member_id),

    CONSTRAINT fk_ac_member_presence_profile_member
        FOREIGN KEY (workspace_id, workspace_member_id)
        REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,

    CONSTRAINT ck_ac_member_presence_profile_custom_status
        CHECK (
          custom_status IS NULL
          OR LENGTH(BTRIM(custom_status)) BETWEEN 1 AND 120
        ),

    CONSTRAINT ck_ac_member_presence_profile_expiry
        CHECK (
          status_expires_at IS NULL
          OR custom_status IS NOT NULL
        )
);

CREATE INDEX ix_ac_member_presence_profile_expiry
    ON public.ac_member_presence_profile(workspace_id, status_expires_at)
    WHERE status_expires_at IS NOT NULL;

CREATE INDEX ix_ac_member_presence_profile_last_seen
    ON public.ac_member_presence_profile(workspace_id, last_seen_at DESC)
    WHERE last_seen_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.ac_member_presence_profile
TO akshaconnect;

DO $$
BEGIN
    IF to_regclass('public.ac_member_presence_profile') IS NULL THEN
        RAISE EXCEPTION 'V16-C presence profile table was not created';
    END IF;
END
$$;
