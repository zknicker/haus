ALTER TABLE "model_connections" ADD COLUMN "capacity" jsonb;--> statement-breakpoint
ALTER TABLE "model_connections" ADD COLUMN "capacity_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_connections" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;