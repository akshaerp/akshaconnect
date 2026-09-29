-- AkshaConnect V16-A Quoted Reply
-- Additive migration. Deployment runner owns transaction + migration ledger.

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
       OR to_regclass('public.ac_message') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect messaging foundation is missing';
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
        WHERE table_schema = 'public'
          AND table_name = 'ac_message'
          AND column_name = 'quote_message_id'
    ) THEN
        RAISE EXCEPTION 'ac_message.quote_message_id already exists before V16-A migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ac_message'::regclass
      AND c.conname = 'uq_ac_message_conversation_scope'
      AND c.contype = 'u';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected uq_ac_message_conversation_scope before V16-A migration';
    END IF;
END
$$;

ALTER TABLE public.ac_message
    ADD COLUMN quote_message_id UUID;

ALTER TABLE public.ac_message
    ADD CONSTRAINT fk_ac_message_quote
        FOREIGN KEY (workspace_id, conversation_id, quote_message_id)
        REFERENCES public.ac_message(workspace_id, conversation_id, message_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT ck_ac_message_quote_not_self
        CHECK (quote_message_id IS NULL OR quote_message_id <> message_id);

CREATE INDEX ix_ac_message_quote
    ON public.ac_message(workspace_id, conversation_id, quote_message_id)
    WHERE quote_message_id IS NOT NULL;

DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_message'
      AND column_name = 'quote_message_id';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected ac_message.quote_message_id after V16-A migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ac_message'::regclass
      AND c.conname IN ('fk_ac_message_quote', 'ck_ac_message_quote_not_self');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'V16-A quoted-reply constraints were not created';
    END IF;

    IF to_regclass('public.ix_ac_message_quote') IS NULL THEN
        RAISE EXCEPTION 'V16-A quoted-reply index was not created';
    END IF;
END
$$;
