import type { SQL } from 'bun';

export async function seedTasksBeforeProjects(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name)
            VALUES ('srv_a', 'a', 'A'), ('srv_b', 'b', 'B')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_ada', 'subject-ada')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_a', 'srv_a', 'usr_ada', 'owner'), ('mem_b', 'srv_b', 'usr_ada', 'owner')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number) VALUES
            ('tky_gen', 'srv_a', 'GEN', 4),
            ('tky_sec', 'srv_a', 'SEC', 3),
            ('tky_ops', 'srv_a', 'OPS', 2),
            ('tky_old', 'srv_a', 'OLD', 3),
            ('tky_b_gen', 'srv_b', 'GEN', 1)`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, deleted_at, deleted_by_user_id)
            VALUES
                ('cht_haus', 'srv_a', 'channel', 'haus', true, null, null),
                ('cht_sec', 'srv_a', 'channel', 'sec', false, null, null),
                ('cht_ops', 'srv_a', 'channel', 'ops', false, null, null),
                ('cht_gone', 'srv_a', 'channel', 'gone', false, '2026-02-01T00:00:00Z', 'usr_ada'),
                ('cht_b_haus', 'srv_b', 'channel', 'haus', true, null, null)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id) VALUES
            ('cht_haus', 'srv_a', 'tky_gen'),
            ('cht_sec', 'srv_a', 'tky_sec'),
            ('cht_ops', 'srv_a', 'tky_ops'),
            ('cht_b_haus', 'srv_b', 'tky_b_gen')`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
            VALUES
                ('msg_sec', 'srv_a', 'cht_sec', 'usr_ada', 'Rotate the key', 'n-sec', 1),
                ('msg_ops', 'srv_a', 'cht_ops', 'usr_ada', 'Patch the host', 'n-ops', 1),
                ('msg_gone', 'srv_a', 'cht_gone', 'usr_ada', 'Gone work', 'n-gone', 1)`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
            VALUES
                ('cht_t_sec', 'srv_a', 'task', 'cht_sec', 'channel', 'msg_sec'),
                ('cht_t_ops', 'srv_a', 'task', 'cht_ops', 'channel', 'msg_ops'),
                ('cht_t_gone', 'srv_a', 'task', 'cht_gone', 'channel', 'msg_gone')`;
        await tx`INSERT INTO tasks (id, server_id, key_id, number, title, state, completed_at,
                created_by_user_id, chat_id)
            VALUES
                ('tsk_sec', 'srv_a', 'tky_sec', 1, 'Rotate', 'open', null, 'usr_ada', 'cht_t_sec'),
                ('tsk_ops', 'srv_a', 'tky_gen', 3, 'Patch', 'open', null, 'usr_ada', 'cht_t_ops'),
                ('tsk_gone', 'srv_a', 'tky_sec', 2, 'Gone', 'open', null, 'usr_ada', 'cht_t_gone'),
                ('tsk_held', 'srv_a', 'tky_ops', 1, 'Held', 'done', now(), 'usr_ada', null),
                ('tsk_orphan', 'srv_a', 'tky_old', 2, 'Orphan', 'done', now(), 'usr_ada', null)`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone) VALUES
            ('agt_ada', 'srv_a', 'Ada', 'ada', 'UTC'),
            ('agt_bob', 'srv_b', 'Bob', 'bob', 'UTC')`;
    });
}
