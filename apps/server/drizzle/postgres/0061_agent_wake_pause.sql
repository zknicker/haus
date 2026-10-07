-- Wake pause: after repeated failures the Server stops waking an Agent
-- automatically and probes once per 1h/4h/24h step until a run completes or a
-- human lifts it. The streak and fingerprint detect the same failure repeating;
-- the last-failure columns let the App explain the pause.
ALTER TABLE "agent_delivery" ADD COLUMN "failure_fingerprint" text;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "last_failure_code" text;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "last_failure_kind" text;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "pause_step" integer;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "same_failure_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_nonnegative_same_failure_streak" CHECK ("agent_delivery"."same_failure_streak" >= 0);--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_wake_pause" CHECK ((
                "agent_delivery"."paused_at" is null and "agent_delivery"."pause_step" is null
            ) or (
                "agent_delivery"."paused_at" is not null
                and "agent_delivery"."pause_step" between 0 and 2
                and "agent_delivery"."consecutive_failures" > 0
                and "agent_delivery"."last_failure_at" is not null
                and "agent_delivery"."last_failure_kind" is not null
            ));