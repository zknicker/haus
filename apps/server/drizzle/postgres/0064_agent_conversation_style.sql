ALTER TABLE "agents" RENAME COLUMN "personality" TO "conversation_style";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_personality_length";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "signature_emoji" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_conversation_style_length" CHECK ("agents"."conversation_style" is null or char_length("agents"."conversation_style") between 1 and 2000);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_signature_emoji_length" CHECK ("agents"."signature_emoji" is null or char_length("agents"."signature_emoji") between 1 and 64);