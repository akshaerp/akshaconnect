-- AkshaConnect V20-A durable mentions

CREATE TABLE IF NOT EXISTS public.ac_message_mention (
  mention_id uuid NOT NULL PRIMARY KEY,
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  mention_type text NOT NULL,
  target_workspace_member_id uuid,
  target_channel_conversation_id uuid,
  display_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_ac_message_mention_message
    FOREIGN KEY (workspace_id, conversation_id, message_id)
    REFERENCES public.ac_message (workspace_id, conversation_id, message_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ac_message_mention_member
    FOREIGN KEY (workspace_id, target_workspace_member_id)
    REFERENCES public.ac_workspace_member (workspace_id, workspace_member_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ac_message_mention_channel
    FOREIGN KEY (workspace_id, target_channel_conversation_id)
    REFERENCES public.ac_conversation (workspace_id, conversation_id)
    ON DELETE CASCADE,
  CONSTRAINT ck_ac_message_mention_type
    CHECK (mention_type IN ('MEMBER','CHANNEL')),
  CONSTRAINT ck_ac_message_mention_target
    CHECK (
      (mention_type = 'MEMBER'
       AND target_workspace_member_id IS NOT NULL
       AND target_channel_conversation_id IS NULL)
      OR
      (mention_type = 'CHANNEL'
       AND target_workspace_member_id IS NULL
       AND target_channel_conversation_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_message_mention_member
  ON public.ac_message_mention
     (workspace_id, conversation_id, message_id, target_workspace_member_id)
  WHERE mention_type = 'MEMBER';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_message_mention_channel
  ON public.ac_message_mention
     (workspace_id, conversation_id, message_id, target_channel_conversation_id)
  WHERE mention_type = 'CHANNEL';

CREATE INDEX IF NOT EXISTS ix_ac_message_mention_target_member
  ON public.ac_message_mention
     (workspace_id, target_workspace_member_id, created_at DESC)
  WHERE mention_type = 'MEMBER';

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.ac_message_mention TO akshaconnect;
