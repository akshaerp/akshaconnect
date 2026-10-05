BEGIN;

CREATE TABLE IF NOT EXISTS public.ac_message_delivery_receipt (
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (
        workspace_id,
        message_id,
        workspace_member_id
    ),
    CONSTRAINT fk_ac_message_delivery_receipt_conversation
        FOREIGN KEY (
            workspace_id,
            conversation_id
        )
        REFERENCES public.ac_conversation(
            workspace_id,
            conversation_id
        )
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_message_delivery_receipt_message
        FOREIGN KEY (
            workspace_id,
            message_id
        )
        REFERENCES public.ac_message(
            workspace_id,
            message_id
        )
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_message_delivery_receipt_member
        FOREIGN KEY (
            workspace_id,
            workspace_member_id
        )
        REFERENCES public.ac_workspace_member(
            workspace_id,
            workspace_member_id
        )
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ac_message_delivery_receipt_conversation_member
    ON public.ac_message_delivery_receipt(
        workspace_id,
        conversation_id,
        workspace_member_id,
        delivered_at DESC
    );

CREATE INDEX IF NOT EXISTS ix_ac_message_delivery_receipt_message
    ON public.ac_message_delivery_receipt(
        workspace_id,
        conversation_id,
        message_id,
        delivered_at DESC
    );

COMMIT;
