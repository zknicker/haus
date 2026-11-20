ALTER TABLE "chats" DROP CONSTRAINT "chats_shape";--> statement-breakpoint
DO $$
DECLARE
    taken record;
    free_name text;
    n integer;
BEGIN
    FOR taken IN
        SELECT "id", "server_id" FROM "chats"
        WHERE "kind" = 'channel' AND "name" = 'all' AND NOT "is_all"
        ORDER BY "server_id", "id"
    LOOP
        n := 2;
        LOOP
            free_name := 'all-' || n;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "chats"
                WHERE "server_id" = taken."server_id" AND "kind" = 'channel' AND "name" = free_name
            );
            n := n + 1;
        END LOOP;
        UPDATE "chats" SET "name" = free_name WHERE "id" = taken."id";
        RAISE NOTICE 'all returns: Server % renamed channel % from all to %',
            taken."server_id", taken."id", free_name;
    END LOOP;
END $$;--> statement-breakpoint
UPDATE "chats" SET "name" = 'all' WHERE "is_all" AND "name" <> 'all';--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_shape" CHECK ((
                (
                    "chats"."kind" = 'channel'
                    and "chats"."name" is not null
                    and "chats"."dm_agent_id" is null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is null
                    and "chats"."parent_chat_kind" is null
                    and (not "chats"."is_all" or "chats"."name" = 'all')
                )
                or (
                    "chats"."kind" = 'dm'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."dm_member_one_stint" is not null
                    and "chats"."dm_member_one_user_id" is not null
                    and "chats"."parent_chat_id" is null
                    and "chats"."parent_chat_kind" is null
                    and (
                        (
                            "chats"."dm_agent_id" is null
                            and "chats"."dm_member_two_stint" is not null
                            and "chats"."dm_member_two_user_id" is not null
                            and "chats"."dm_member_one_user_id" collate "C" < "chats"."dm_member_two_user_id" collate "C"
                        )
                        or (
                            "chats"."dm_agent_id" is not null
                            and "chats"."dm_member_two_stint" is null
                            and "chats"."dm_member_two_user_id" is null
                        )
                    )
                )
                or (
                    "chats"."kind" = 'task'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."dm_agent_id" is null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is not null
                    and "chats"."parent_chat_kind" = 'channel'
                )
            ));