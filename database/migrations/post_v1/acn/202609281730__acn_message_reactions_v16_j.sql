-- AkshaConnect V16-J message reactions
-- Additive migration. One active reaction per member per message.

CREATE TABLE IF NOT EXISTS public.ac_message_reaction (
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  workspace_member_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_ac_message_reaction PRIMARY KEY
    (workspace_id, conversation_id, message_id, workspace_member_id),
  CONSTRAINT fk_ac_message_reaction_message FOREIGN KEY
    (workspace_id, conversation_id, message_id)
    REFERENCES public.ac_message (workspace_id, conversation_id, message_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ac_message_reaction_member FOREIGN KEY
    (workspace_id, workspace_member_id)
    REFERENCES public.ac_workspace_member (workspace_id, workspace_member_id)
    ON DELETE CASCADE,
  CONSTRAINT ck_ac_message_reaction_emoji CHECK
    (emoji IN ('👍','❤️','😂','🎉','👀','✅'))
);

CREATE INDEX IF NOT EXISTS ix_ac_message_reaction_message
  ON public.ac_message_reaction (workspace_id, conversation_id, message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ac_message_reaction TO akshaconnect;
