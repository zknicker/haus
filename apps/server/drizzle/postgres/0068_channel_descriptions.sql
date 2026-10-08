ALTER TABLE "chats" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_description_length" CHECK ("chats"."description" is null or ("chats"."kind" = 'channel' and char_length("chats"."description") between 1 and 500));--> statement-breakpoint
UPDATE "chats" SET "description" = 'General channel for all members and team-wide announcements.' WHERE "is_all" = true AND "description" IS NULL;
