ALTER TABLE "linear_outbox" DROP CONSTRAINT "linear_outbox_kind";--> statement-breakpoint
ALTER TABLE "linear_outbox" ADD CONSTRAINT "linear_outbox_kind" CHECK ("linear_outbox"."kind" in (
                'session_ack', 'session_activity', 'session_create', 'label_group_create',
                'label_create', 'label_rename', 'label_archive', 'issue_route', 'token_revoke',
                'identity_hand_back'
            ));