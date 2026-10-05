-- A Reminder's title becomes a short label, like a calendar invite subject, and
-- the full instruction moves to `description`. Existing titles were written as
-- whole action sentences, so each one is copied into its description and left
-- in place: nothing is lost, and nothing is shortened automatically. The cause
-- snapshot gains the same field; causes recorded before this keep it null.
ALTER TABLE "message_causes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "description" text;--> statement-breakpoint
UPDATE "reminders" SET "description" = "title";--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_description_length" CHECK ("reminders"."description" is null or char_length("reminders"."description") between 1 and 300);
