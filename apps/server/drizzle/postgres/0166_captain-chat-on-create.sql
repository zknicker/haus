-- ADR 0062: every Captain has exactly one Captain chat from the moment its row exists, whichever path
-- inserts it (the App, `haus agent create`, the dev seed, or a test fixture writing SQL). The
-- trigger creates the chat, opens the Captain's read of it, and joins the owner when there is one.
CREATE FUNCTION "agents_create_captain_chat"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	chat_id text := 'cht_' || translate(rtrim(encode(substring(uuid_send(gen_random_uuid()) from 1 for 12), 'base64'), '='), '+/', '-_');
BEGIN
	INSERT INTO "chats" ("id", "server_id", "kind", "captain_agent_id") VALUES (chat_id, NEW."server_id", 'captain', NEW."id");
	INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence") VALUES (NEW."server_id", NEW."id", chat_id, 0);
	IF NEW."owner_user_id" IS NOT NULL THEN
		INSERT INTO "captain_chat_members" ("server_id", "chat_id", "user_id", "subscribed") VALUES (NEW."server_id", chat_id, NEW."owner_user_id", true);
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agents_captain_chat" AFTER INSERT ON "agents" FOR EACH ROW WHEN (NEW."kind" = 'captain') EXECUTE FUNCTION "agents_create_captain_chat"();
