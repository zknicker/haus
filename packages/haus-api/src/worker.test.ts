import { expect, test } from 'bun:test';
import {
    agentWorkerStartInputSchema,
    agentCommandSchema,
    agentInboxItemSchema,
    cloudAgentCapabilityRequestSchema,
    cloudAgentCapabilityResultSchema,
    cloudAgentCapabilityStateSchema,
    workerObservationSchema,
    workerSchema,
    workerUpdatedEventSchema,
    computerInventorySchema,
    computerProtocolVersion,
    formatWorkerSuffix,
    messageBodySchema,
} from './index.ts';
import { work } from './worker-record-fixture.ts';

test('Worker stores bounded, provider-safe execution state', () => {
    expect(workerSchema.parse(work)).toMatchObject({ status: 'working' });
    expect(workerSchema.safeParse({ ...work, status: 'running' }).success).toBe(false);
    expect(
        workerSchema.parse({ ...work, launchMessageId: null, originChatId: null })
    ).toMatchObject({ launchMessageId: null, originChatId: null });
    expect(workerSchema.safeParse({ ...work, repository: 'haus' }).success).toBe(false);
    expect(workerSchema.safeParse({ ...work, status: 'idle' }).success).toBe(false);
    expect(workerSchema.safeParse({ ...work, title: 'a'.repeat(121) }).success).toBe(false);
    expect(
        workerSchema.safeParse({
            ...work,
            activity: { at: work.createdAt, summary: 'a'.repeat(121) },
        }).success
    ).toBe(false);
    expect(workerSchema.safeParse({ ...work, instructions: 'do it' }).success).toBe(false);
});

test('Worker is linked from text, never a Message body', () => {
    expect(messageBodySchema.safeParse({ kind: 'worker', work }).success).toBe(false);
    expect(formatWorkerSuffix({ status: 'running', title: work.title })).toBe(
        ' [worker status=running title=Fix the flaky delivery test]'
    );
});

test('a Worker update names the Worker and its Task, never their rows', () => {
    const event = {
        chatId: 'cht_task',
        serverId: 'srv_1',
        taskId: 'tsk_1',
        workerId: work.id,
    };
    expect(workerUpdatedEventSchema.parse(event)).toEqual(event);
    expect(() => workerUpdatedEventSchema.parse({ ...event, taskId: null })).toThrow();
    expect(() => workerUpdatedEventSchema.parse({ ...event, work })).toThrow();
});

test('the Agent start input carries the brief and the place, never provider instructions', () => {
    const input = {
        brief: 'Fix the flaky test.',
        nonce: 'worker-1',
        place: 'cursor',
        repository: 'haus/haus',
        task: 'ENG-41',
        title: 'Fix the flaky delivery test',
    };
    expect(agentWorkerStartInputSchema.parse(input).startingRef).toBeNull();
    expect(agentWorkerStartInputSchema.parse({ ...input, place: undefined }).place).toBeUndefined();
    expect(agentWorkerStartInputSchema.safeParse({ ...input, instructions: 'do it' }).success).toBe(
        false
    );
    expect(agentWorkerStartInputSchema.safeParse({ ...input, brief: '' }).success).toBe(false);
    expect(agentWorkerStartInputSchema.safeParse({ ...input, place: 'computer' }).success).toBe(
        false
    );
});

test('an observation is bounded and its frames ride the command union', () => {
    expect(
        workerObservationSchema.parse({
            observedAt: '2026-09-04T12:05:00.000Z',
            turnId: 'car_1234567890abcdef',
            status: 'completed',
            summary: 'Opened a pull request.',
            workerId: 'caw_1234567890abcdef',
        }).status
    ).toBe('completed');
    expect(
        agentCommandSchema.safeParse({
            place: 'cursor',
            providerAgentId: 'bc_abc',
            providerRunId: 'run_abc',
            turnId: 'car_1234567890abcdef',
            type: 'worker-stop',
            workerId: 'caw_1234567890abcdef',
        }).success
    ).toBe(true);
    expect(
        agentCommandSchema.safeParse({
            type: 'worker-reconcile',
            workers: [
                {
                    place: 'cursor',
                    providerAgentId: null,
                    providerRunId: null,
                    status: 'queued',
                    stopRequested: true,
                    turnId: 'car_1234567890abcdef',
                    workerId: 'caw_1234567890abcdef',
                },
            ],
        }).success
    ).toBe(true);
});

test('a Worker stall is a bodiless inbox item keyed by its turn', () => {
    const attention = {
        branches: [
            {
                branch: 'cloud/fix-flake',
                pullRequestUrl: 'https://github.com/haus/haus/pull/12',
                repository: 'haus/haus',
            },
        ],
        errorCode: null,
        notice: 'stall',
        place: 'cursor',
        providerUrl: 'https://cursor.com/agents/bc_abc',
        repository: 'haus/haus',
        turnId: 'car_1234567890abcdef',
        stallCode: 'followup-auto-interrupt-failed',
        status: 'queued',
        summary: null,
        title: 'Fix the flaky delivery test',
        workerId: 'caw_1234567890abcdef',
    };
    const item = {
        chatId: 'cht_product',
        worker: attention,
        content: '',
        createdAt: '2026-09-04T12:05:00.000Z',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: '#product',
    };
    expect(agentInboxItemSchema.parse(item).worker?.workerId).toBe('caw_1234567890abcdef');
    expect(agentInboxItemSchema.safeParse({ ...item, id: 'opaque:key' }).success).toBe(true);
    expect(agentInboxItemSchema.safeParse({ ...item, sequence: 3 }).success).toBe(false);
    expect(
        agentInboxItemSchema.safeParse({ ...item, worker: { ...attention, notice: 'settled' } })
            .success
    ).toBe(false);
});

test('Computer inventory reports Cloud Agent provider readiness on the current protocol', () => {
    expect(
        computerInventorySchema.parse({
            cloudAgentProviders: [
                { provider: 'cursor', ready: false, reason: 'provider-unavailable' },
            ],
            runtimes: [],
        }).cloudAgentProviders
    ).toHaveLength(1);
    expect(
        computerInventorySchema
            .parse({
                cloudAgentProviders: [
                    {
                        isDefault: true,
                        provider: 'cursor',
                        ready: false,
                        reason: 'provider-unavailable',
                    },
                ],
                runtimes: [],
            })
            .cloudAgentProviders?.map((provider) => provider.isDefault)
    ).toEqual([true]);
    expect(computerProtocolVersion).toBe(43);
});

test('a Cloud Agent capability state names exactly one of ready or a reason', () => {
    const connected = {
        accountEmail: 'delegate@example.com',
        expiresAt: '2026-12-01T00:00:00.000Z',
        provider: 'cursor',
        ready: true,
        reason: null,
    };
    expect(cloudAgentCapabilityStateSchema.parse(connected).ready).toBe(true);
    expect(
        cloudAgentCapabilityStateSchema.safeParse({ ...connected, reason: 'expired' }).success
    ).toBe(false);
    expect(
        cloudAgentCapabilityStateSchema.safeParse({ ...connected, ready: false, reason: null })
            .success
    ).toBe(false);
    for (const reason of ['not-connected', 'expired', 'provider-unavailable'] as const) {
        expect(
            cloudAgentCapabilityStateSchema.parse({
                accountEmail: null,
                expiresAt: null,
                provider: 'cursor',
                ready: false,
                reason,
            }).reason
        ).toBe(reason);
    }
});

test('sign-in links only accept the trusted Cursor HTTPS website', () => {
    const state = {
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    };
    const signIn = { status: 'waiting', expiresAt: '2026-09-21T18:00:00.000Z' };
    for (const url of [
        'not a URL',
        'javascript:alert(1)',
        'http://cursor.com/login',
        'https://cursor.com.evil.test/login',
        'https://user:secret@cursor.com/login',
        'https://cursor.com:444/login',
    ]) {
        expect(
            cloudAgentCapabilityStateSchema.safeParse({ ...state, signIn: { ...signIn, url } })
                .success
        ).toBe(false);
    }
    expect(
        cloudAgentCapabilityStateSchema.safeParse({
            ...state,
            signIn: { ...signIn, url: 'https://cursor.com/loginDeepControl?uuid=test' },
        }).success
    ).toBe(true);
});

test('the capability request rides the Computer command union and answers with one shape', () => {
    const request = {
        operation: { kind: 'connect' },
        provider: 'cursor',
        requestId: 'req_connect_cursor',
        type: 'cloud-agent-capability-request',
    };
    expect(cloudAgentCapabilityRequestSchema.parse(request).operation.kind).toBe('connect');
    expect(agentCommandSchema.parse(request).type).toBe('cloud-agent-capability-request');
    expect(
        cloudAgentCapabilityResultSchema.parse({
            error: 'The Cursor login was cancelled.',
            requestId: 'req_connect_cursor',
            type: 'cloud-agent-capability-result',
        }).error
    ).toBe('The Cursor login was cancelled.');
    expect(
        cloudAgentCapabilityResultSchema.safeParse({
            error: 'Both at once is a mapping failure.',
            requestId: 'req_connect_cursor',
            result: {
                accountEmail: null,
                expiresAt: null,
                provider: 'cursor',
                ready: false,
                reason: 'not-connected',
            },
            type: 'cloud-agent-capability-result',
        }).success
    ).toBe(false);
});
