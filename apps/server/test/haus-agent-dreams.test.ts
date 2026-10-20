import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type AgentDreamRecord, dreamRetentionPerAgent } from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { recordAgentDream } from '../src/server-agents/record-agent-dream.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/** A dream's memory record: recorded from its Computer, read by any member who may view the Agent. */
let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;
let agentId: string;

const computerId = 'cmp_dreams0000000001';
const runtime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };
const patch = [
    'diff --git a/MEMORY.md b/MEMORY.md',
    '--- a/MEMORY.md',
    '+++ b/MEMORY.md',
    '@@ -6,2 +6,2 @@ ## Active Context',
    '-- Waiting on the Q4 budget.',
    '+- Q4 budget approved.',
    '',
].join('\n');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await signIn('user_dreams_owner');
    outsider = await signIn('user_dreams_outsider');
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Dreams', slug: 'dreams' }))
        .id;
    await outsider.trpc.server.create.mutate({ displayName: 'Elsewhere', slug: 'elsewhere' });
    const ownerUserId = await readUserId('user_dreams_owner');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${ownerUserId}, ${'e'.repeat(64)},
            ${{ runtimes: [runtime] }}::jsonb, 'healthy')
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'Keeps the books.',
        displayName: 'Nell',
        handle: 'nell',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
});

afterAll(async () => {
    owner.close();
    outsider.close();
    await connection.close();
    await harness.close();
});

test('a recorded dream lists newest first with totals and opens with its patch', async () => {
    await dreamRun('run_dreamread00001', 1);
    await dreamRun('run_dreamread00002', 2);
    expect(await record(dream('run_dreamread00001', 1, { files: [], patch: '' }))).toBe(true);
    expect(await record(dream('run_dreamread00002', 2))).toBe(true);

    const page = await owner.trpc.agent.dreams.query({ agentId, serverId });
    expect(page.dreams.map((entry) => entry.runId).slice(0, 2)).toEqual([
        'run_dreamread00002',
        'run_dreamread00001',
    ]);
    expect(page.dreams[0]).toEqual({
        added: 3,
        files: [
            { added: 1, change: 'modified', path: 'MEMORY.md', removed: 1 },
            { added: 2, change: 'added', path: 'notes/ramp.md', removed: 0 },
        ],
        finishedAt: '2026-01-02T03:05:00.000Z',
        followUps: [],
        removed: 1,
        runId: 'run_dreamread00002',
        startedAt: '2026-01-02T03:00:00.000Z',
        summary: null,
        truncated: false,
    });
    // A dream with no changes is still a dream.
    expect(page.dreams[1]).toMatchObject({ added: 0, files: [], removed: 0, truncated: false });

    const detail = await owner.trpc.agent.dream.query({
        agentId,
        runId: 'run_dreamread00002',
        serverId,
    });
    expect(detail?.patch).toBe(patch);
    expect(
        await owner.trpc.agent.dream.query({ agentId, runId: 'run_nodreamhere0001', serverId })
    ).toBeNull();
});

test('a dream reads back its learned summary and the reminders created during the run', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'followups',
        serverId,
    });
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'Remind me about the budget.',
        nonce: 'dream-followup-anchor',
        serverId,
    });
    await dreamRun('run_dreamsummary01', 4);
    await record(dream('run_dreamsummary01', 4));
    await harness.sql`
        insert into agent_dream_summaries (run_id, server_id, agent_id, summary, created_at, updated_at)
        values ('run_dreamsummary01', ${serverId}, ${agentId}, 'Budget approved; ramp slips.', now(), now())
    `;
    const reminder = (id: string, createdAt: string, status: string) => harness.sql`
        insert into reminders (
            id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, title, fire_at,
            timezone, status, created_at, updated_at
        )
        values (
            ${id}, ${serverId}, ${agentId}, ${channel.id}, ${anchor.message.id}, ${`Title ${id}`},
            '2026-02-01T09:00:00Z', 'UTC', ${status}, ${createdAt}, ${createdAt}
        )
    `;
    await reminder('rem_inside00000001', '2026-01-04T03:02:00Z', 'scheduled');
    await reminder('rem_canceled0000001', '2026-01-04T03:03:00Z', 'canceled');
    await reminder('rem_outside0000001', '2026-01-04T04:30:00Z', 'scheduled');

    const detail = await owner.trpc.agent.dream.query({
        agentId,
        runId: 'run_dreamsummary01',
        serverId,
    });
    expect(detail?.summary).toBe('Budget approved; ramp slips.');
    expect(detail?.followUps).toEqual([
        {
            anchorChatId: channel.id,
            fireAt: '2026-02-01T09:00:00.000Z',
            reminderId: 'rem_inside00000001',
            title: 'Title rem_inside00000001',
        },
    ]);
    const page = await owner.trpc.agent.dreams.query({ agentId, serverId });
    const listed = page.dreams.find((entry) => entry.runId === 'run_dreamsummary01');
    expect(listed?.summary).toBe('Budget approved; ramp slips.');
    expect(listed?.followUps).toHaveLength(1);
});

test('a truncated dream is kept and read back as truncated', async () => {
    await dreamRun('run_dreamtrunc0001', 3);
    expect(
        await record({
            ...dream('run_dreamtrunc0001', 3, { files: [], patch: '' }),
            truncated: true,
        })
    ).toBe(true);
    const detail = await owner.trpc.agent.dream.query({
        agentId,
        runId: 'run_dreamtrunc0001',
        serverId,
    });
    expect(detail).toMatchObject({ files: [], patch: '', truncated: true });
});

test('only the assigned Computer can record, and only for a run started as a dream', async () => {
    await dreamRun('run_dreamforeign01', 3);
    await harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
        select ${serverId}, ${agentId}, 'run_chatturn000001', 'human', 'msg_x', id
        from chats where server_id = ${serverId} limit 1
    `;
    expect(
        await recordAgentDream(connection.db, 'cmp_someoneelse001', dream('run_dreamforeign01', 3))
    ).toBe(false);
    expect(await record(dream('run_chatturn000001', 3))).toBe(false);
    expect(await record(dream('run_unknownrun0001', 3))).toBe(false);
    const runIds = (await owner.trpc.agent.dreams.query({ agentId, serverId })).dreams.map(
        (entry) => entry.runId
    );
    expect(runIds).not.toContain('run_dreamforeign01');
    expect(runIds).not.toContain('run_chatturn000001');
});

test('keeps the newest dreams per Agent and pages through them by cursor', async () => {
    const total = dreamRetentionPerAgent + 2;
    for (let night = 10; night < 10 + total; night += 1) {
        const runId = `run_dreamkeep${String(night).padStart(5, '0')}`;
        await dreamRun(runId, night);
        await record(dream(runId, night));
    }
    // A retried record replaces its own row rather than adding one.
    await record(dream(`run_dreamkeep${String(10 + total - 1).padStart(5, '0')}`, 10 + total - 1));

    const first = await owner.trpc.agent.dreams.query({ agentId, limit: 50, serverId });
    expect(first.dreams).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const rest = await owner.trpc.agent.dreams.query({
        agentId,
        cursor: first.nextCursor ?? undefined,
        limit: 50,
        serverId,
    });
    const all = [...first.dreams, ...rest.dreams].map((entry) => entry.runId);
    expect(rest.nextCursor).toBeNull();
    expect(all).toHaveLength(dreamRetentionPerAgent);
    expect(new Set(all).size).toBe(dreamRetentionPerAgent);
    expect(all[0]).toBe(`run_dreamkeep${String(10 + total - 1).padStart(5, '0')}`);
    // The two oldest nights and the earlier tests' dreams were pruned.
    expect(all).not.toContain('run_dreamkeep00010');
    expect(all).not.toContain('run_dreamkeep00011');
    expect(all).not.toContain('run_dreamread00001');
});

test('refuses non-members and unknown Agents', async () => {
    await expect(outsider.trpc.agent.dreams.query({ agentId, serverId })).rejects.toThrow();
    await expect(
        outsider.trpc.agent.dream.query({ agentId, runId: 'run_dreamread00002', serverId })
    ).rejects.toThrow();
    await expect(
        owner.trpc.agent.dreams.query({ agentId: 'agt_unknownunknown01', serverId })
    ).rejects.toThrow(/No Agent exists/i);
});

function dream(
    runId: string,
    night: number,
    changes: Pick<AgentDreamRecord, 'files' | 'patch'> = {
        files: [
            { added: 1, change: 'modified', path: 'MEMORY.md', removed: 1 },
            { added: 2, change: 'added', path: 'notes/ramp.md', removed: 0 },
        ],
        patch,
    }
): AgentDreamRecord {
    return {
        agentId,
        ...changes,
        finishedAt: new Date(Date.UTC(2026, 0, night, 3, 5)).toISOString(),
        runId,
        startedAt: new Date(Date.UTC(2026, 0, night, 3)).toISOString(),
        truncated: false,
        type: 'agent-dream-record',
    };
}

function record(entry: AgentDreamRecord) {
    return recordAgentDream(connection.db, computerId, entry);
}

async function dreamRun(runId: string, night: number) {
    await harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
        values (${serverId}, ${agentId}, ${runId}, 'dream',
            ${`dream:${agentId}:2026-01-${String(night).padStart(2, '0')}`}, null)
    `;
}

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

async function readUserId(clerkUserId: string) {
    const rows = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
