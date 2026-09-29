-- AkshaConnect V16-B: thread read state / read receipts
-- Additive migration. Deployment runner owns transaction + migration ledger.

DO $$
BEGIN
  IF current_database() <> 'akshaconnect'
     AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
    RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
  END IF;

  IF to_regclass('public.ac_message') IS NULL
     OR to_regclass('public.ac_workspace_member') IS NULL
     OR to_regclass('public.ac_read_cursor') IS NULL THEN
    RAISE EXCEPTION 'Required messaging/read-cursor foundation is missing';
  END IF;

  IF to_regclass('public.ac_thread_read_cursor') IS NOT NULL THEN
    RAISE EXCEPTION 'ac_thread_read_cursor already exists before V16-B migration';
  END IF;
END
$$;

CREATE TABLE public.ac_thread_read_cursor (
  workspace_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  thread_root_message_id UUID NOT NULL,
  workspace_member_id UUID NOT NULL,
  last_read_message_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (
    workspace_id,
    conversation_id,
    thread_root_message_id,
    workspace_member_id
  ),

  CONSTRAINT fk_ac_thread_read_cursor_root
    FOREIGN KEY (workspace_id, conversation_id, thread_root_message_id)
    REFERENCES public.ac_message(workspace_id, conversation_id, message_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_ac_thread_read_cursor_last_read
    FOREIGN KEY (workspace_id, conversation_id, last_read_message_id)
    REFERENCES public.ac_message(workspace_id, conversation_id, message_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_ac_thread_read_cursor_member
    FOREIGN KEY (workspace_id, workspace_member_id)
    REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id)
    ON DELETE CASCADE
);

CREATE INDEX ix_ac_thread_read_cursor_member
  ON public.ac_thread_read_cursor(
    workspace_id,
    workspace_member_id,
    read_at DESC
  );

CREATE INDEX ix_ac_thread_read_cursor_thread
  ON public.ac_thread_read_cursor(
    workspace_id,
    conversation_id,
    thread_root_message_id,
    read_at DESC
  );

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.ac_thread_read_cursor
TO akshaconnect;

DO $$
BEGIN
  IF to_regclass('public.ac_thread_read_cursor') IS NULL THEN
    RAISE EXCEPTION 'V16-B thread read cursor table was not created';
  END IF;
END
$$;
