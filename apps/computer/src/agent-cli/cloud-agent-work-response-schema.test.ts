import { expect, test } from 'bun:test';
import {
    agentCloudAgentListReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    cloudAgentWorkSchema,
} from '@haus/api';
import {
    agentCloudAgentListReceiptResponseSchema,
    agentCloudAgentSendReceiptResponseSchema,
    cloudAgentWorkResponseSchema,
} from './cloud-agent-work-response-schema.ts';

/**
 * A current Server's cloud-agent work, plus fields a future Server release
 * might additively send that this Computer build does not know about yet:
 * `futureWorkField` on the work itself, and one planted at every nesting
 * level the shape reaches (a run, its branch, its usage, and its job).
 */
const workWithUnknownFields = {
    activity: { at: '2026-09-04T12:01:00.000Z', summary: 'Reading the failing test.' },
    agentId: 'agt_orbit',
    cancelRequestedAt: null,
    cancelRequestedBy: { futureCancelField: true, id: 'agt_orbit', kind: 'agent' },
    chatId: 'cht_product',
    computerId: 'cmp_studio',
    createdAt: '2026-09-04T12:00:00.000Z',
    environmentId: 'env_claude',
    environmentName: 'Haus production',
    futureWorkField: 'a field this Computer build predates',
    id: 'caw_1234567890abcdef',
    job: {
        futureJobField: 'next release only',
        followUp: null,
        startedAt: '2026-09-04T12:00:30.000Z',
        state: 'working',
    },
    messageId: 'msg_1234567890abcdef',
    provider: 'claude',
    providerAgentId: 'bc_abc',
    providerUrl: 'https://cursor.com/agents/bc_abc',
    repository: 'haus/haus',
    runs: [
        {
            branches: [
                {
                    branch: 'fix/flaky-delivery',
                    futureBranchField: true,
                    pullRequest: {
                        additions: 12,
                        changedFiles: 2,
                        deletions: 3,
                        futurePullRequestField: true,
                        number: 42,
                        observedAt: '2026-09-04T12:05:00.000Z',
                        state: 'open',
                    },
                    pullRequestUrl: 'https://github.com/haus/haus/pull/42',
                    repository: 'haus/haus',
                },
            ],
            createdAt: '2026-09-04T12:00:00.000Z',
            errorCode: null,
            futureRunField: 'next release only',
            model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
            providerRunId: 'run_abc',
            rawStatus: 'RUNNING',
            runId: 'car_1234567890abcdef',
            stall: null,
            startedAt: '2026-09-04T12:00:30.000Z',
            status: 'running',
            summary: null,
            terminalAt: null,
            usage: { costUsd: 0.42, futureUsageField: true, inputTokens: 100, outputTokens: 50 },
        },
    ],
    startedAt: '2026-09-04T12:00:30.000Z',
    startingRef: 'main',
    status: 'running',
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    updatedAt: '2026-09-04T12:01:00.000Z',
};

test('the canonical strict work schema rejects a field it does not know, reproducing the stranding bug', () => {
    expect(() => cloudAgentWorkSchema.parse(workWithUnknownFields)).toThrow(/futureWorkField/);
});

test('the Computer response schema parses a work record carrying fields from a newer Server', () => {
    const parsed = cloudAgentWorkResponseSchema.parse(workWithUnknownFields);
    expect(parsed.id).toBe('caw_1234567890abcdef');
    expect(parsed.title).toBe('Fix the flaky delivery test');
    expect(parsed.runs[0]?.runId).toBe('car_1234567890abcdef');
});

test('the Computer response schema tolerates an unknown field on a list receipt', () => {
    const payload = { futureReceiptField: true, works: [workWithUnknownFields] };
    expect(() => agentCloudAgentListReceiptSchema.parse(payload)).toThrow();
    expect(agentCloudAgentListReceiptResponseSchema.parse(payload).works).toHaveLength(1);
});

test('the Computer response schema tolerates an unknown field on a send receipt', () => {
    const payload = {
        idempotent: false,
        predecessors: [],
        runId: 'car_1234567890abcdef',
        work: workWithUnknownFields,
    };
    expect(() => agentCloudAgentSendReceiptSchema.parse(payload)).toThrow();
    expect(agentCloudAgentSendReceiptResponseSchema.parse(payload).work.id).toBe(
        'caw_1234567890abcdef'
    );
});
