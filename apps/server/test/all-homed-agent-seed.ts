import type { SQL } from 'bun';

export async function seedServerWithAllChannelAgent(database: SQL) {
    await database.begin(async (tx) => {
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'hq', 'HQ')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_a', 'subject-a')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_a', 'srv_a', 'usr_a', 'owner')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all)
            VALUES ('cht_all', 'srv_a', 'channel', 'all', true)`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_homed', 'srv_a', 'homed', 'Homed', 'UTC')`;
    });
}
