-- Keep the physical personality column for rollback to Server 7.1.0.
ALTER TABLE "agents" DROP CONSTRAINT "agents_personality_length";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "signature_emoji" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_conversation_style_length" CHECK ("agents"."personality" is null or char_length("agents"."personality") between 1 and 2000);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_signature_emoji_length" CHECK ("agents"."signature_emoji" is null or char_length("agents"."signature_emoji") between 1 and 64);
