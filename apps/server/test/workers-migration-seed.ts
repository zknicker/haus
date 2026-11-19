import type { SQL } from 'bun';

const inventory = (defaultProvider: 'claude' | 'cursor') =>
    JSON.stringify({
        cloudAgentProviders: (['cursor', 'claude'] as const).map((provider) => ({
            isDefault: provider === defaultProvider,
            models: null,
            provider,
            ready: true,
            reason: null,
        })),
        runtimes: [],
    });

const pullRequestUrl = 'https://github.com/acme/app/pull/12';

export async function seedPreWorkerRows(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_one0000000000000', 'srv_one', 'usr_one', 'owner')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number)
            VALUES ('tky_gen', 'srv_one', 'GEN', 8)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id)
            VALUES ('cht_ops', 'srv_one', 'tky_gen')`;
        await tx`INSERT INTO tasks (id, server_id, key_id, project_id, number, title, state, created_by_user_id)
            VALUES ('tsk_one', 'srv_one', 'tky_gen', 'cht_ops', 7, 'Fix the flake', 'open', 'usr_one')`;
        await tx`INSERT INTO computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory)
            VALUES ('cmp_new0000000000000', 'srv_one', 'usr_one', ${'a'.repeat(64)}, ${inventory('claude')}::text::jsonb),
                   ('cmp_old0000000000000', 'srv_one', 'usr_one', ${'b'.repeat(64)}, ${inventory('cursor')}::text::jsonb)`;
        await tx`INSERT INTO cloud_agent_work (id, server_id, agent_id, chat_id, computer_id,
                launch_message_id, provider, repository, title, task_id, status, created_at,
                updated_at, terminal_at)
            VALUES
                ('caw_aaaaaaaaaaaaaaaa', 'srv_one', 'agt_one', 'cht_ops', 'cmp_new0000000000000', 'msg_link',
                    'cursor', 'acme/app', 'Fix flake', 'tsk_one', 'running',
                    '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', null),
                ('caw_bbbbbbbbbbbbbbbb', 'srv_one', 'agt_one', 'cht_ops', 'cmp_old0000000000000', 'msg_old',
                    'claude', 'acme/app', 'Old', null, 'cancelled',
                    '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z', '2026-09-02T00:00:00Z'),
                ('caw_cccccccccccccccc', 'srv_one', 'agt_one', 'cht_ops', 'cmp_old0000000000000', 'msg_older',
                    'cursor', 'acme/app', 'Older', null, 'running',
                    '2026-08-01T00:00:00Z', '2026-08-05T00:00:00Z', null)`;
        await tx`INSERT INTO cloud_agent_runs (id, server_id, work_id, status, summary,
                error_code, provider_run_id, branches, created_at, terminal_at)
            VALUES
                ('car_a1aaaaaaaaaaaaaa', 'srv_one', 'caw_aaaaaaaaaaaaaaaa', 'completed',
                    'Opened a pull request.', null, 'run_a1',
                    ${JSON.stringify([{ branch: 'fix', pullRequestUrl, repository: 'acme/app' }])}::text::jsonb,
                    '2026-10-01T00:00:00Z', '2026-10-01T01:00:00Z'),
                ('car_a2aaaaaaaaaaaaaa', 'srv_one', 'caw_aaaaaaaaaaaaaaaa', 'queued',
                    null, null, null, '[]'::jsonb, '2026-10-02T00:00:00Z', null),
                ('car_b1bbbbbbbbbbbbbb', 'srv_one', 'caw_bbbbbbbbbbbbbbbb', 'pending_input',
                    'Which key?', null, 'run_b1', '[]'::jsonb,
                    '2026-09-01T00:00:00Z', '2026-09-01T01:00:00Z'),
                ('car_b2bbbbbbbbbbbbbb', 'srv_one', 'caw_bbbbbbbbbbbbbbbb', 'cancelled',
                    null, null, 'run_b2', '[]'::jsonb, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z'),
                ('car_c1cccccccccccccc', 'srv_one', 'caw_cccccccccccccccc', 'failed',
                    null, 'boom', 'run_c1', '[]'::jsonb, '2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z'),
                ('car_c2cccccccccccccc', 'srv_one', 'caw_cccccccccccccccc', 'expired',
                    null, 'gone', 'run_c2', '[]'::jsonb, '2026-08-02T00:00:00Z', '2026-08-02T01:00:00Z'),
                ('car_c3cccccccccccccc', 'srv_one', 'caw_cccccccccccccccc', 'running',
                    null, null, 'run_c3', '[]'::jsonb, '2026-08-03T00:00:00Z', null)`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, nonce, sequence, content)
            VALUES ('msg_link', 'srv_one', 'cht_ops', 'usr_one', 'n1', 1,
                ${'Started.\n\n[Fix flake](cloud-agent://caw_aaaaaaaaaaaaaaaa) and [Old \\[draft](cloud-agent://caw_bbbbbbbbbbbbbbbb)'})`;
        await tx`INSERT INTO cloud_agent_work_links (server_id, message_id, chat_id, work_id, ordinal)
            VALUES ('srv_one', 'msg_link', 'cht_ops', 'caw_aaaaaaaaaaaaaaaa', 0),
                   ('srv_one', 'msg_link', 'cht_ops', 'caw_bbbbbbbbbbbbbbbb', 1)`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, cloud_agent_notice, cloud_agent_run_id)
            VALUES
                ('inb_settled000000000', 'srv_one', 'agt_one', 'cht_ops', '', 'car_a1', 'cloud_agent_work', 'settled', 'car_a1aaaaaaaaaaaaaa'),
                ('inb_stall00000000000', 'srv_one', 'agt_one', 'cht_ops', '', 'car_c3:stall', 'cloud_agent_work', 'stall', 'car_c3cccccccccccccc'),
                ('inb_pullrequest00000', 'srv_one', 'agt_one', 'cht_ops', '', 'acme/app#12:ready', 'cloud_agent_work', 'pull_request', null),
                ('inb_human00000000000', 'srv_one', 'agt_one', 'cht_ops', 'hi', 'msg_link', 'human', null, null)`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
            VALUES ('srv_one', 'agt_one', 'run_one', 'cht_ops', 'cloud_agent_work', 'car_a1'),
                   ('srv_one', 'agt_one', 'run_two', 'cht_ops', 'human', 'msg_link')`;
    });
}
