import { expect, test } from 'bun:test';
import type { AgentCliMessage } from './agent-api-schemas.ts';
import { formatDeliveryEnvelope, formatHistoryLine } from './agent-format.ts';

function message(overrides: Partial<AgentCliMessage> = {}): AgentCliMessage {
    return {
        attachments: [],
        author: { id: 'agt_orbit', kind: 'agent', label: 'Orbit', metadata: {} },
        body_kind: 'text',
        chat_id: 'cht_product',
        content: 'The migration is staged. Should I run it?',
        created_at: '2026-09-03T12:00:00.000Z',
        deleted_at: null,
        delivery_id: null,
        id: 'msg_1a2b3c4d5e6f',
        metadata: {},
        nonce: 'msg-1',
        role: 'assistant',
        sender: { description: null, handle: 'orbit', type: 'agent' },
        sequence: 7,
        ...overrides,
    };
}

test('an ordinary Message carries no suffix, and the suffixes keep their order', () => {
    expect(formatHistoryLine(message())).toEndWith(
        '@orbit: The migration is staged. Should I run it?'
    );
    expect(
        formatHistoryLine(
            message({
                attachments: [{ filename: 'plan.md', id: 'att_1' }],
                task: {
                    assignee: { handle: 'scout', id: 'agt_scout' },
                    claimed_at: null,
                    created_at: '2026-09-03T12:00:00.000Z',
                    labels: [],
                    number: 3,
                    origin: 'composed',
                    priority: 'none',
                    status: 'in_progress',
                    updated_at: '2026-09-03T12:00:00.000Z',
                },
            })
        )
    ).toEndWith(
        '[1 attachment: plan.md (id:att_1) — use haus attachment view to download]' +
            ' [task #3 status=in_progress assignee=@scout]'
    );
});

type CloudAgentWorkBody = NonNullable<AgentCliMessage['cloud_agent_work']>;

const latestRun: NonNullable<CloudAgentWorkBody['latest_run']> = {
    branches: [
        {
            branch: 'cloud/fix-flake',
            pull_request_url: 'https://github.com/haus/haus/pull/56',
            repository: 'haus/haus',
        },
    ],
    error_code: null,
    run_id: 'car_1234567890abcdef',
    status: 'completed',
    summary: 'Opened a pull request.',
};

const cloudAgentWork: CloudAgentWorkBody = {
    activity: null,
    id: 'caw_1234567890abcdef',
    latest_run: latestRun,
    provider: 'cursor',
    provider_url: 'https://cursor.com/agents/bc_one',
    repository: 'haus/haus',
    starting_ref: 'main',
    status: 'completed',
    title: 'Fix the flaky delivery test',
};

test('a Cloud Agent work Message names the pull request it opened', () => {
    const work = message({ body_kind: 'cloud-agent-work', cloud_agent_work: cloudAgentWork });

    expect(formatHistoryLine(work)).toEndWith(
        '[cloud-agent-work status=completed title=Fix the flaky delivery test pr=#56]'
    );
    expect(formatDeliveryEnvelope('#product', work)).toEndWith(
        '[cloud-agent-work status=completed title=Fix the flaky delivery test pr=#56]'
    );
});

test('work with no pull request yet reads exactly as it always did', () => {
    expect(
        formatHistoryLine(
            message({
                body_kind: 'cloud-agent-work',
                cloud_agent_work: {
                    ...cloudAgentWork,
                    latest_run: { ...latestRun, branches: [] },
                    status: 'running',
                },
            })
        )
    ).toEndWith('[cloud-agent-work status=running title=Fix the flaky delivery test]');
    expect(
        formatHistoryLine(
            message({
                body_kind: 'cloud-agent-work',
                cloud_agent_work: { ...cloudAgentWork, latest_run: null, status: 'queued' },
            })
        )
    ).toEndWith('[cloud-agent-work status=queued title=Fix the flaky delivery test]');
});

test('a creating Message names the Agent it created, and says when that Agent is gone', () => {
    const created = {
        agent_id: 'agt_scout',
        description: 'Keeps release notes current.',
        display_name: 'Scout',
        handle: 'scout',
        retired: false,
    };
    const creation = message({
        agent_created: created,
        body_kind: 'agent-created',
        content: 'Scout is on the team now; they own release notes.',
    });

    expect(formatHistoryLine(creation)).toEndWith(
        'Scout is on the team now; they own release notes. [created @scout]'
    );
    expect(formatDeliveryEnvelope('#product', creation)).toEndWith('[created @scout]');
    expect(
        formatHistoryLine(
            message({
                agent_created: { ...created, retired: true },
                body_kind: 'agent-created',
            })
        )
    ).toEndWith('[created @scout (retired)]');
});
