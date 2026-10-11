CREATE TABLE "agent_dreams" (
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"files" jsonb NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"patch" text NOT NULL,
	"run_id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_dreams_span" CHECK ("agent_dreams"."finished_at" >= "agent_dreams"."started_at")
);
--> statement-breakpoint
ALTER TABLE "agent_dreams" ADD CONSTRAINT "agent_dreams_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dreams" ADD CONSTRAINT "agent_dreams_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_dreams_agent_started_idx" ON "agent_dreams" USING btree ("server_id","agent_id","started_at","run_id");