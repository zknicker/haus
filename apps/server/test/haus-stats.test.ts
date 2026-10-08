import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;

const computerId = 'cmp_1234567890123456';
const usage = {
    capturedAt: '2026-07-28T20:00:00.000Z',
    claude: {
        error: { code: 'auth', message: 'Not signed in', name: 'UsageError' },
        provider: 'claude',
        status: 'error',
    },
    codex: {
        provider: 'codex',
        snapshot: {
            capturedAt: '2026-07-28T20:00:00.000Z',
            creditsBalance: null,
            planType: 'pro',
            provider: 'codex',
            source: 'chatgpt-wham-usage',
            windows: [],
        },
        status: 'ok',
    },
    connectedProviders: ['openai-codex'],
    openRouter: {
        error: null,
        overview: {
            days: 30,
            keys: [],
            message: 'Not configured',
            note: null,
            series: [],
            status: 'unconfigured',
            totalByokUsageUsd: 0,
            totalRequests: 0,
            totalUsageUsd: 0,
        },
        status: 'ok',
    },
};
const normalizedUsage = {
    ...usage,
    grok: {
        error: {
            code: 'unknown',
            message: 'Grok usage has not been reported by this Computer yet.',
            name: 'UsageError',
        },
        provider: 'grok',
        status: 'error',
    },
    runtimeUsage: [],
};

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_stats_owner', ['owner@example.com']);
    member = await signIn('user_stats_member', ['member@example.com']);
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Stats HQ',
            slug: 'stats-hq',
        })
    ).id;
    const invitation = await owner.trpc.invitation.create.mutate({
        email: 'member@example.com',
        serverId,
    });
    await member.trpc.invitation.accept.mutate({ token: invitation.token });
    const [ownerRow] = await harness.sql`
        select id from users where clerk_user_id = 'user_stats_owner'
    `;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, health,
            architecture, operating_system, product_version, protocol_version,
            usage_snapshot, usage_reported_at
        ) values (
            ${computerId}, ${serverId}, ${ownerRow.id}, ${'a'.repeat(64)}, 'offline',
            'arm64', 'darwin', '1.1.0', 3,
            ${usage}::jsonb, '2026-07-28T20:00:01.000Z'
        )
    `;
    await harness.sql`
        insert into agents (
            id, server_id, computer_id, desired_runtime_id, desired_model_id,
            display_name, handle, home_timezone
        ) values (
            'agt_1234567890abcdef', ${serverId}, ${computerId}, 'codex', 'gpt-5.6-sol',
            'Cove', 'stats-cove', 'UTC'
        )
    `;
    await harness.sql`
        insert into agent_turns (
            id, server_id, agent_id, computer_id, run_id, started_at, ended_at,
            status, summary, model_id, runtime_id, token_usage_reported,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens
        ) values (
            'atn_1234567890abcdef', ${serverId}, 'agt_1234567890abcdef', ${computerId},
            'run_stats_usage', now() - interval '1 minute', now(), 'completed', 'done',
            'gpt-5.6-sol', 'codex', true, 100, 25, 80, 10, 125
        )
    `;
});

afterAll(async () => {
    owner.close();
    member.close();
    await harness.close();
});

test('Members read every durable Computer usage snapshot while Computers are offline', async () => {
    await expect(member.trpc.computer.list.query({ serverId })).rejects.toThrow(/Owner or Admin/i);

    const overview = await member.trpc.stats.live.query({ serverId });
    expect(overview.computers).toEqual([
        {
            architecture: 'arm64',
            computerId,
            health: 'offline',
            operatingSystem: 'darwin',
            productVersion: '1.1.0',
            reportedAt: '2026-07-28T20:00:01.000Z',
            usage: normalizedUsage,
        },
    ]);
    expect(overview.tokenUsage).toMatchObject({
        breakdown: [
            {
                agentHandle: 'stats-cove',
                agentId: 'agt_1234567890abcdef',
                agentName: 'Cove',
                cacheReadTokens: 80,
                inputTokens: 100,
                modelId: 'gpt-5.6-sol',
                outputTokens: 25,
                runtimeId: 'codex',
                totalTokens: 125,
            },
        ],
        days: 90,
        totals: {
            cacheReadTokens: 80,
            cacheWriteTokens: 10,
            inputTokens: 100,
            outputTokens: 25,
            totalTokens: 125,
        },
    });

    await harness.sql`
        update agent_turns
        set input_tokens = 140, output_tokens = 30, total_tokens = 170
        where run_id = 'run_stats_usage'
    `;
    const corrected = await member.trpc.stats.live.query({ serverId });
    expect(corrected.tokenUsage.totals).toMatchObject({
        inputTokens: 140,
        outputTokens: 30,
        totalTokens: 170,
    });
    expect(corrected.tokenUsage.breakdown).toHaveLength(1);
});

test('An Agent profile reads only its own token rows', async () => {
    await harness.sql`
        insert into agents (
            id, server_id, computer_id, desired_runtime_id, desired_model_id,
            display_name, handle, home_timezone
        ) values (
            'agt_abcdef1234567890', ${serverId}, ${computerId}, 'codex', 'gpt-5.6-sol',
            'Wren', 'stats-wren', 'UTC'
        )
    `;
    await harness.sql`
        insert into agent_turns (
            id, server_id, agent_id, computer_id, run_id, started_at, ended_at,
            status, summary, model_id, runtime_id, token_usage_reported,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens
        ) values (
            'atn_abcdef1234567890', ${serverId}, 'agt_abcdef1234567890', ${computerId},
            'run_stats_usage_wren', now() - interval '1 minute', now(), 'completed', 'done',
            'gpt-5.6-sol', 'codex', true, 7, 3, 0, 0, 10
        )
    `;

    const ada = await member.trpc.stats.agentUsage.query({
        agentId: 'agt_1234567890abcdef',
        serverId,
    });
    expect(ada.breakdown.map((row) => row.agentId)).toEqual(['agt_1234567890abcdef']);
    expect(ada.totals.totalTokens).toBe(170);
    const wren = await member.trpc.stats.agentUsage.query({
        agentId: 'agt_abcdef1234567890',
        serverId,
    });
    expect(wren.totals.totalTokens).toBe(10);

    const outsider = await signIn('user_stats_outsider', ['outsider@example.com']);
    try {
        await expect(
            outsider.trpc.stats.agentUsage.query({ agentId: 'agt_1234567890abcdef', serverId })
        ).rejects.toThrow();
    } finally {
        outsider.close();
    }
});

test('Stats remain readable after the Server restarts', async () => {
    await harness.sql`update computers set health = 'healthy' where id = ${computerId}`;
    member.close();
    await harness.restart();
    member = createHausClient(harness, await harness.clerk.mintSessionToken('user_stats_member'));

    await expect(member.trpc.stats.live.query({ serverId })).resolves.toMatchObject({
        computers: [{ computerId, health: 'offline', usage: normalizedUsage }],
    });
});

async function signIn(clerkUserId: string, verifiedEmails: string[]) {
    harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}
