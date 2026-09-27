-- AkshaConnect Conversation Platform V14 Wave 1
-- Additive product migration.
-- No BEGIN/COMMIT here: deployment runner owns transaction + migration ledger.

DO $$
DECLARE
    v_count bigint;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_db_baseline') IS NULL
       OR to_regclass('public.ac_db_migrations') IS NULL
       OR to_regclass('public.ac_channel') IS NULL
       OR to_regclass('public.ac_channel_member') IS NULL
       OR to_regclass('public.ac_message') IS NULL
       OR to_regclass('public.ac_attachment') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect collaboration foundation is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_baseline
    WHERE baseline_code = 'AKSHACONNECT_DB_BASELINE_V1';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one AKSHACONNECT_DB_BASELINE_V1 marker, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_migrations
    WHERE status = 'FAILED';

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAILED AkshaConnect migration rows must be resolved first: %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='ac_channel'
          AND column_name IN ('description', 'topic')
    ) THEN
        RAISE EXCEPTION 'ac_channel V14 profile columns already exist before migration';
    END IF;

    IF to_regclass('public.ac_channel_rule') IS NOT NULL
       OR to_regclass('public.ac_conversation_pin') IS NOT NULL
       OR to_regclass('public.ac_conversation_member_setting') IS NOT NULL THEN
        RAISE EXCEPTION 'V14 conversation platform tables already exist before migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ac_message'::regclass
      AND c.conname = 'uq_ac_message_conversation_scope'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'workspace_id'
        ),
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'conversation_id'
        ),
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'message_id'
        )
      ]::smallint[];

    IF v_count <> 1 THEN
        RAISE EXCEPTION
          'Expected existing baseline uq_ac_message_conversation_scope(workspace_id, conversation_id, message_id), found % exact matches',
          v_count;
    END IF;
END
$$;

ALTER TABLE public.ac_channel
    ADD COLUMN description TEXT,
    ADD COLUMN topic VARCHAR(240);

ALTER TABLE public.ac_channel
    ADD CONSTRAINT ck_ac_channel_description_length
        CHECK (description IS NULL OR LENGTH(description) <= 4000),
    ADD CONSTRAINT ck_ac_channel_topic_length
        CHECK (topic IS NULL OR LENGTH(BTRIM(topic)) BETWEEN 1 AND 240);

CREATE TABLE public.ac_channel_rule (
    channel_rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    rule_text TEXT NOT NULL,
    sequence_no INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_by_member_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ac_channel_rule_channel
        FOREIGN KEY (workspace_id, channel_id)
        REFERENCES public.ac_channel(workspace_id, channel_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ac_channel_rule_creator
        FOREIGN KEY (workspace_id, created_by_member_id)
        REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_ac_channel_rule_text
        CHECK (LENGTH(BTRIM(rule_text)) BETWEEN 1 AND 1000),

    CONSTRAINT ck_ac_channel_rule_sequence
        CHECK (sequence_no BETWEEN 1 AND 9999),

    CONSTRAINT ck_ac_channel_rule_status
        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX ix_ac_channel_rule_active
    ON public.ac_channel_rule(workspace_id, channel_id, sequence_no)
    WHERE status = 'ACTIVE';

CREATE TABLE public.ac_conversation_pin (
    conversation_pin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,
    pinned_by_member_id UUID NOT NULL,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ac_conversation_pin_message
        UNIQUE (workspace_id, conversation_id, message_id),

    CONSTRAINT fk_ac_conversation_pin_message
        FOREIGN KEY (workspace_id, conversation_id, message_id)
        REFERENCES public.ac_message(workspace_id, conversation_id, message_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ac_conversation_pin_member
        FOREIGN KEY (workspace_id, pinned_by_member_id)
        REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT
);

CREATE INDEX ix_ac_conversation_pin_recent
    ON public.ac_conversation_pin(workspace_id, conversation_id, pinned_at DESC);

CREATE TABLE public.ac_conversation_member_setting (
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    notification_level VARCHAR(20) NOT NULL DEFAULT 'ALL',
    muted_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (
        workspace_id,
        conversation_id,
        workspace_member_id
    ),

    CONSTRAINT fk_ac_conversation_member_setting_conversation
        FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES public.ac_conversation(workspace_id, conversation_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ac_conversation_member_setting_member
        FOREIGN KEY (workspace_id, workspace_member_id)
        REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,

    CONSTRAINT ck_ac_conversation_member_setting_notification
        CHECK (notification_level IN ('ALL', 'NONE'))
);

CREATE INDEX ix_ac_conversation_member_setting_notifications
    ON public.ac_conversation_member_setting(
        workspace_id,
        conversation_id,
        notification_level,
        muted_until
    );

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.ac_channel_rule,
         public.ac_conversation_pin,
         public.ac_conversation_member_setting
TO akshaconnect;

GRANT SELECT, UPDATE
ON TABLE public.ac_channel
TO akshaconnect;

DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='ac_channel'
      AND column_name IN ('description', 'topic');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected description/topic on ac_channel after migration, found % columns', v_count;
    END IF;

    IF to_regclass('public.ac_channel_rule') IS NULL
       OR to_regclass('public.ac_conversation_pin') IS NULL
       OR to_regclass('public.ac_conversation_member_setting') IS NULL THEN
        RAISE EXCEPTION 'V14 conversation platform tables were not created';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ac_message'::regclass
      AND c.conname = 'uq_ac_message_conversation_scope'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'workspace_id'
        ),
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'conversation_id'
        ),
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.ac_message'::regclass
            AND attname = 'message_id'
        )
      ]::smallint[];

    IF v_count <> 1 THEN
        RAISE EXCEPTION
          'Baseline uq_ac_message_conversation_scope was altered or lost during migration';
    END IF;
END
$$;
