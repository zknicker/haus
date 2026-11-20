import { expect, test } from 'bun:test';
import {
    agentWorkerListReceiptSchema,
    agentWorkerSendReceiptSchema,
    workerSchema,
} from '@haus/api';
import {
    agentWorkerListReceiptResponseSchema,
    agentWorkerSendReceiptResponseSchema,
    workerResponseSchema,
} from './worker-response-schema.ts';

const workerWithUnknownFields = {
    activity: { at: '2026-09-04T12:01:00.000Z', summary: 'Reading the failing test.' },
    agentId: 'agt_orbit',
    branch: null,
    carrierComputerId: 'cmp_studio',
    closedAt: null,
    closingAt: null,
    createdAt: '2026-09-04T12:00:00.000Z',
    environmentId: 'env_claude',
    environmentName: 'Haus production',
    futureWorkerField: 'a field this Computer build predates',
    id: 'wkr_1234567890abcdef',
    job: {
        followUp: null,
        futureJobField: 'next release only',
        startedAt: '2026-09-04T12:00:30.000Z',
        state: 'working',
    },
    launchMessageId: null,
    model: null,
    originChatId: null,
    place: { kind: 'claude' },
    providerAgentId: 'cse_abc',
    providerUrl: 'https://claude.ai/code',
    pullRequest: null,
    repository: 'haus/haus',
    runtime: null,
    startedAt: '2026-09-04T12:00:30.000Z',
    startingRef: 'main',
    status: 'done',
    taskId: 'tsk_1234567890abcdef',
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    turns: [
        {
            acknowledgedAt: '2026-09-04T12:00:01.000Z',
            branches: [
                {
                    branch: 'fix/flaky-delivery',
                    futureBranchField: true,
                    pullRequestUrl: 'https://github.com/haus/haus/pull/42',
                    repository: 'haus/haus',
                },
            ],
            createdAt: '2026-09-04T12:00:00.000Z',
            dispatchedAt: '2026-09-04T12:00:00.000Z',
            errorCode: null,
            futureTurnField: 'next release only',
            input: [
                {
                    at: '2026-09-04T12:00:00.000Z',
                    author: { futureAuthorField: true, id: 'agt_orbit', kind: 'agent' },
                    kind: 'brief',
                    messageId: null,
                    text: 'Fix the flaky delivery test.',
                },
            ],
            model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
            outcome: {
                futureOutcomeField: true,
                kind: 'report',
                report: {
                    ask: null,
                    futureReportField: true,
                    messageId: 'msg_report1234567890',
                    outcome: 'done',
                    personId: null,
                    personRefused: null,
                    pullRequestUrls: ['https://github.com/haus/haus/pull/42'],
                    source: 'provider',
                    text: 'Opened a pull request.',
                },
            },
            providerRunId: 'run_abc',
            rawStatus: 'idle',
            report: { clipped: false, futureResultField: true, text: 'Opened a pull request.' },
            stall: null,
            startedAt: '2026-09-04T12:00:30.000Z',
            status: 'completed',
            stopRequestedAt: null,
            stopRequestedBy: null,
            summary: 'Opened a pull request.',
            terminalAt: '2026-09-04T12:10:00.000Z',
            turnId: 'wkt_1234567890abcdef',
            usage: { costUsd: 0.42, futureUsageField: true, inputTokens: 100, outputTokens: 50 },
        },
    ],
    updatedAt: '2026-09-04T12:01:00.000Z',
    workerMdRevisionId: null,
};

test('the canonical strict Worker schema rejects a field it does not know', () => {
    expect(() => workerSchema.parse(workerWithUnknownFields)).toThrow(/futureWorkerField/);
});

test('the Computer response schema parses a Worker carrying fields from a newer Server at every level', () => {
    const parsed = workerResponseSchema.parse(workerWithUnknownFields);
    expect(parsed.id).toBe('wkr_1234567890abcdef');
    expect(parsed.turns[0]?.input?.[0]?.text).toBe('Fix the flaky delivery test.');
    expect(parsed.turns[0]?.outcome).toMatchObject({ kind: 'report', report: { outcome: 'done' } });
    expect(parsed.turns[0]?.report?.text).toBe('Opened a pull request.');
});

test('the Computer response schema tolerates an unknown field on a list or send receipt', () => {
    const list = { futureReceiptField: true, workers: [workerWithUnknownFields] };
    expect(() => agentWorkerListReceiptSchema.parse(list)).toThrow();
    expect(agentWorkerListReceiptResponseSchema.parse(list).workers).toHaveLength(1);

    const send = { idempotent: false, turnId: 'wkt_next', worker: workerWithUnknownFields };
    expect(() => agentWorkerSendReceiptSchema.parse(send)).toThrow();
    expect(agentWorkerSendReceiptResponseSchema.parse(send).worker.id).toBe('wkr_1234567890abcdef');
});
