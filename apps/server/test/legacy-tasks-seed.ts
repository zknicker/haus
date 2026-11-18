import type { SQL } from 'bun';

export async function seedLegacyTasks(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES
            ('usr_ada', 'subject-ada'), ('usr_bo', 'subject-bo')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role) VALUES
            ('mem_ada', 'srv_one', 'usr_ada', 'owner'), ('mem_bo', 'srv_one', 'usr_bo', 'member')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone) VALUES
            ('agt_one', 'srv_one', 'one', 'One', 'UTC'), ('agt_two', 'srv_one', 'two', 'Two', 'UTC')`;
        await tx`INSERT INTO boards (id, server_id, key, name, next_number)
            VALUES ('brd_gen', 'srv_one', 'GEN', 'General', 9)`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number)
            VALUES ('brd_gen', 'srv_one', 'GEN', 7)`;
        await tx`INSERT INTO board_columns (id, server_id, board_id, name, category, position) VALUES
            ('col_backlog', 'srv_one', 'brd_gen', 'Backlog', 'backlog', 0),
            ('col_todo', 'srv_one', 'brd_gen', 'Todo', 'todo', 1),
            ('col_active', 'srv_one', 'brd_gen', 'Doing', 'active', 2),
            ('col_done', 'srv_one', 'brd_gen', 'Done', 'done', 3),
            ('col_canceled', 'srv_one', 'brd_gen', 'Canceled', 'canceled', 4)`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, last_message_sequence, task_key_id)
            VALUES ('cht_all', 'srv_one', 'channel', 'all', true, 2, 'brd_gen'),
                   ('cht_ops', 'srv_one', 'channel', 'ops', false, 2, 'brd_gen'),
                   ('cht_new', 'srv_one', 'channel', 'new', false, 0, null)`;
        await tx`INSERT INTO chats (id, server_id, kind, dm_member_one_user_id, dm_member_one_stint, dm_agent_id, last_message_sequence)
            VALUES ('cht_dm', 'srv_one', 'dm', 'usr_ada', 1, 'agt_one', 1)`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, author_agent_id, content, nonce, sequence, created_at)
            VALUES
                ('msg_all_1', 'srv_one', 'cht_all', 'usr_ada', null, 'hi', 'a1', 1, '2026-01-01T00:00:00Z'),
                ('msg_all_2', 'srv_one', 'cht_all', null, 'agt_one', 'hello', 'a2', 2, '2026-01-01T00:01:00Z'),
                ('msg_dm', 'srv_one', 'cht_dm', 'usr_ada', null, 'GEN-1 please', 'd1', 1, '2026-01-01T00:00:00Z'),
                ('msg_ops_1', 'srv_one', 'cht_ops', 'usr_bo', null, 'GEN-1 is broken', 'o1', 1, '2026-01-02T00:00:00Z'),
                ('msg_ops_2', 'srv_one', 'cht_ops', 'usr_ada', null, 'still GEN-1', 'o2', 2, '2026-01-03T00:00:00Z')`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
            VALUES ('cht_task_place', 'srv_one', 'task', 'cht_ops', 'channel', 'msg_ops_1')`;
        await tx`INSERT INTO tasks (id, server_id, board_id, column_id, key_id, number, title, state,
                assignee_agent_id, assignee_user_id, created_by_user_id, created_by_agent_id,
                completed_at, chat_id, created_at)
            VALUES
                ('tsk_linked', 'srv_one', 'brd_gen', 'col_active', 'brd_gen', 1, 'Rotate the keys', 'open',
                 'agt_one', null, 'usr_ada', null, null, null, '2026-01-01T00:00:00Z'),
                ('tsk_tracked_a', 'srv_one', 'brd_gen', 'col_todo', 'brd_gen', 2, 'Ship the docs', 'todo',
                 'agt_two', null, null, 'agt_one', null, null, '2026-01-01T00:00:00Z'),
                ('tsk_tracked_b', 'srv_one', 'brd_gen', 'col_backlog', 'brd_gen', 3, 'Fix the build', 'todo',
                 'agt_one', null, 'usr_bo', null, null, null, '2026-01-02T00:00:00Z'),
                ('tsk_drift', 'srv_one', 'brd_gen', 'col_done', 'brd_gen', 4, 'Drifted', 'open',
                 'agt_one', null, 'usr_ada', null, '2026-01-05T00:00:00Z', null, '2026-01-03T00:00:00Z'),
                ('tsk_human', 'srv_one', 'brd_gen', 'col_active', 'brd_gen', 5, 'Ada work', 'open',
                 null, 'usr_bo', 'usr_ada', null, null, null, '2026-01-04T00:00:00Z'),
                ('tsk_unassigned', 'srv_one', 'brd_gen', 'col_todo', 'brd_gen', 6, 'Someday', 'todo',
                 null, null, 'usr_ada', null, null, null, '2026-01-05T00:00:00Z'),
                ('tsk_done', 'srv_one', 'brd_gen', 'col_done', 'brd_gen', 7, 'Done one', 'done',
                 'agt_one', null, 'usr_ada', null, '2026-01-06T00:00:00Z', null, '2026-01-06T00:00:00Z'),
                ('tsk_canceled', 'srv_one', 'brd_gen', 'col_canceled', 'brd_gen', 8, 'Dropped', 'canceled',
                 null, null, 'usr_ada', null, '2026-01-07T00:00:00Z', null, '2026-01-07T00:00:00Z'),
                ('tsk_place', 'srv_one', 'brd_gen', 'col_active', 'brd_gen', 9, 'Already a place', 'open',
                 'agt_one', null, null, 'agt_one', null, 'cht_task_place', '2026-01-08T00:00:00Z')`;
        await tx`INSERT INTO task_message_links (message_id, ordinal, server_id, task_id, text) VALUES
            ('msg_dm', 0, 'srv_one', 'tsk_linked', 'GEN-1'),
            ('msg_ops_1', 0, 'srv_one', 'tsk_linked', 'GEN-1'),
            ('msg_ops_2', 0, 'srv_one', 'tsk_linked', 'GEN-1')`;
        await tx`INSERT INTO task_inbox_items (server_id, task_id, user_id, assigned_by_user_id, assignment_version)
            VALUES ('srv_one', 'tsk_human', 'usr_bo', 'usr_ada', 1)`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key, source, mentioned)
            VALUES ('inb_assignment000001', 'srv_one', 'agt_one', null,
                ${JSON.stringify({
                    assignedBy: 'ada',
                    assignedByAgent: false,
                    board: 'General',
                    column: 'Doing',
                    id: 'task-assign:tsk_linked:1',
                    key: 'GEN-1',
                    priority: 'none',
                    taskId: 'tsk_linked',
                    title: 'Rotate the keys',
                })},
                'task-assign:tsk_linked:1', 'task_assignment', true)`;
    });
}
