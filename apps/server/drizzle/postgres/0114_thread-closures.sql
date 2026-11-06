CREATE TABLE "thread_closures" (
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_through_sequence" integer NOT NULL,
	"server_id" text NOT NULL,
	"thread_chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "thread_closures_server_id_thread_chat_id_user_id_pk" PRIMARY KEY("server_id","thread_chat_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "thread_closures" ADD CONSTRAINT "thread_closures_thread_fk" FOREIGN KEY ("server_id","thread_chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_closures" ADD CONSTRAINT "thread_closures_membership_fk" FOREIGN KEY ("server_id","user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;