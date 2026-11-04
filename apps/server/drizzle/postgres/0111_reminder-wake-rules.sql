-- Smarter wake rules for script reminders: `--wake-on-change` dedupes repeated
-- output by its hash, and `--fail-after N` requires N consecutive failures
-- before waking (then wakes once more on recovery). Every fire now records its
-- own outcome so `reminder log` and the Automations page can summarize
-- quiet/unchanged/woke/failed/recovered runs without re-deriving them from exit
-- codes at read time. `wake_total_tokens` is filled in later, when the woken
-- turn settles and reports usage.
ALTER TABLE "reminders" ADD COLUMN "wake_on_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "fail_after" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "failure_streak_woken" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "last_wake_output_hash" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_fail_after_range" CHECK ("reminders"."fail_after" is null or ("reminders"."fail_after" between 1 and 20));--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_consecutive_failures_range" CHECK ("reminders"."consecutive_failures" >= 0);--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD COLUMN "wake_total_tokens" integer;--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD CONSTRAINT "reminder_fires_outcome" CHECK ("reminder_fires"."outcome" is null or "reminder_fires"."outcome" in ('quiet', 'unchanged', 'woke', 'failed', 'recovered'));--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD CONSTRAINT "reminder_fires_duration_ms_range" CHECK ("reminder_fires"."duration_ms" is null or "reminder_fires"."duration_ms" >= 0);--> statement-breakpoint
ALTER TABLE "reminder_fires" ADD CONSTRAINT "reminder_fires_wake_total_tokens_range" CHECK ("reminder_fires"."wake_total_tokens" is null or "reminder_fires"."wake_total_tokens" >= 0);--> statement-breakpoint
-- A plain reminder (no script) always wakes its Agent; backfill its settled history.
UPDATE "reminder_fires" SET "outcome" = 'woke' WHERE "has_script" = false;--> statement-breakpoint
-- A settled script fire woke its Agent unless it exited 0 with no output to
-- report -- today's rule, before this change introduced `unchanged`, `failed`,
-- and `recovered`. An unsettled script fire (the Computer never reported back)
-- keeps a null outcome.
UPDATE "reminder_fires" SET "outcome" = 'woke'
    WHERE "has_script" = true AND ("script_timed_out" = true OR "script_exit_code" <> 0);--> statement-breakpoint
UPDATE "reminder_fires" SET "outcome" = 'woke'
    WHERE "has_script" = true AND "script_exit_code" = 0
        AND "script_output" IS NOT NULL AND trim("script_output") <> '';--> statement-breakpoint
UPDATE "reminder_fires" SET "outcome" = 'quiet'
    WHERE "has_script" = true AND "script_exit_code" = 0 AND "script_timed_out" = false
        AND ("script_output" IS NULL OR trim("script_output") = '');
