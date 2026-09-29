-- iPhone push: one APNs device registration per token, owned by one human.
CREATE TABLE "push_devices" (
	"bundle_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"environment" text NOT NULL,
	"last_error" text,
	"token" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "push_devices_environment" CHECK ("push_devices"."environment" in ('sandbox', 'production'))
);
--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id");