import type { SQL } from 'bun';

export async function seedChannelsBeforeProjects(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name)
            VALUES ('srv_a', 'a', 'A'), ('srv_b', 'b', 'B')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_ada', 'subject-ada')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_a', 'srv_a', 'usr_ada', 'owner'), ('mem_b', 'srv_b', 'usr_ada', 'owner')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number, created_at) VALUES
            ('tky_gen', 'srv_a', 'GEN', 3, '2026-01-01T00:00:00Z'),
            ('tky_ops', 'srv_a', 'OPS', 4, '2026-01-02T00:00:00Z'),
            ('tky_tie', 'srv_a', 'TIE', 1, '2026-01-02T00:00:00Z'),
            ('tky_old', 'srv_a', 'OLD', 1, '2026-01-02T00:00:00Z'),
            ('tky_gone', 'srv_a', 'GONE', 1, '2026-01-02T00:00:00Z'),
            ('tky_haus', 'srv_a', 'HAUS', 1, '2026-01-02T00:00:00Z'),
            ('tky_b_gen', 'srv_b', 'GEN', 1, '2026-01-01T00:00:00Z')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, task_key_id, created_at,
                archived_at, archived_by_user_id, deleted_at, deleted_by_user_id) VALUES
            ('cht_all', 'srv_a', 'channel', 'all', true, 'tky_gen', '2026-01-01T00:00:00Z', null, null, null, null),
            ('cht_misc', 'srv_a', 'channel', 'misc', false, 'tky_gen', '2026-01-02T00:00:00Z', null, null, null, null),
            ('cht_haus', 'srv_a', 'channel', 'haus', false, null, '2026-01-03T00:00:00Z', null, null, null, null),
            ('cht_haus2', 'srv_a', 'channel', 'haus-2', false, null, '2026-01-03T00:00:00Z',
                null, null, '2026-02-01T00:00:00Z', 'usr_ada'),
            ('cht_ops', 'srv_a', 'channel', 'ops', false, 'tky_ops', '2026-01-04T00:00:00Z', null, null, null, null),
            ('cht_infra', 'srv_a', 'channel', 'infra', false, 'tky_ops', '2026-01-05T00:00:00Z', null, null, null, null),
            ('cht_alpha', 'srv_a', 'channel', 'alpha', false, 'tky_tie', '2026-01-06T00:00:00Z', null, null, null, null),
            ('cht_beta', 'srv_a', 'channel', 'beta', false, 'tky_tie', '2026-01-07T00:00:00Z', null, null, null, null),
            ('cht_plans', 'srv_a', 'channel', '2024-plans', false, null, '2026-01-08T00:00:00Z', null, null, null, null),
            ('cht_dash', 'srv_a', 'channel', '--', false, null, '2026-01-09T00:00:00Z', null, null, null, null),
            ('cht_under', 'srv_a', 'channel', '__', false, null, '2026-01-10T00:00:00Z', null, null, null, null),
            ('cht_old', 'srv_a', 'channel', 'old', false, 'tky_old', '2026-01-11T00:00:00Z',
                '2026-02-01T00:00:00Z', 'usr_ada', null, null),
            ('cht_gone', 'srv_a', 'channel', 'gone', false, 'tky_gone', '2026-01-12T00:00:00Z',
                null, null, '2026-02-01T00:00:00Z', 'usr_ada'),
            ('cht_b_all', 'srv_b', 'channel', 'all', true, null, '2026-01-01T00:00:00Z', null, null, null, null),
            ('cht_b_ops', 'srv_b', 'channel', 'ops', false, null, '2026-01-02T00:00:00Z', null, null, null, null)`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
            VALUES
                ('cht_t_misc', 'srv_a', 'task', 'cht_misc', 'channel', 'msg_misc'),
                ('cht_t_misc2', 'srv_a', 'task', 'cht_misc', 'channel', 'msg_misc2'),
                ('cht_t_ops', 'srv_a', 'task', 'cht_ops', 'channel', 'msg_ops'),
                ('cht_t_infra', 'srv_a', 'task', 'cht_infra', 'channel', 'msg_infra'),
                ('cht_t_infra2', 'srv_a', 'task', 'cht_infra', 'channel', 'msg_infra2')`;
        await tx`INSERT INTO tasks (id, server_id, key_id, number, title, state, created_by_user_id, chat_id)
            VALUES
                ('tsk_misc', 'srv_a', 'tky_gen', 1, 'Misc one', 'open', 'usr_ada', 'cht_t_misc'),
                ('tsk_misc2', 'srv_a', 'tky_gen', 2, 'Misc two', 'open', 'usr_ada', 'cht_t_misc2'),
                ('tsk_ops', 'srv_a', 'tky_ops', 1, 'Ops one', 'open', 'usr_ada', 'cht_t_ops'),
                ('tsk_infra', 'srv_a', 'tky_ops', 2, 'Infra one', 'open', 'usr_ada', 'cht_t_infra'),
                ('tsk_infra2', 'srv_a', 'tky_ops', 3, 'Infra two', 'open', 'usr_ada', 'cht_t_infra2')`;
    });
}
