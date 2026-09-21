import { expect, test } from 'bun:test';
import { work } from './cloud-agent-fixture.ts';
import {
    agentCloudAgentStartInputSchema,
    agentCommandSchema,
    agentInboxItemSchema,
    cloudAgentCapabilityRequestSchema,
    cloudAgentCapabilityResultSchema,
    cloudAgentCapabilityStateSchema,
    cloudAgentObservationSchema,
    cloudAgentWorkSchema,
    computerInventorySchema,
    computerProtocolVersion,
    formatCloudAgentWorkSuffix,
    messageBodySchema,
    serverdurableeventSchema,
} from './index.ts';

test('Cloud Agent work stores bounded, provider-safe execution state', () => {
    expect(cloudAgentWorkSchema.parse(work)).toMatchObject({ status: 'running' });
    expect(cloudAgentWorkSchema.safeParse({ ...work, repository: 'haus' }).success).toBe(false);
    expect(cloudAgentWorkSchema.safeParse({ ...work, status: 'idle' }).success).toBe(false);
    expect(cloudAgentWorkSchema.safeParse({ ...work, title: 'a'.repeat(121) }).success).toBe(false);
    expect(
        cloudAgentWorkSchema.safeParse({
            ...work,
            activity: { at: work.createdAt, summary: 'a'.repeat(121) },
        }).success
    ).toBe(false);
    expect(cloudAgentWorkSchema.safeParse({ ...work, instructions: 'do it' }).success).toBe(false);
});

test('a Message body projects Cloud Agent work beside text and ask', () => {
    expect(messageBodySchema.parse({ kind: 'cloud-agent-work', work })).toMatchObject({
        kind: 'cloud-agent-work',
        work: { id: 'caw_1234567890abcdef' },
    });
    expect(formatCloudAgentWorkSuffix(cloudAgentWorkSchema.parse(work))).toBe(
        ' [cloud-agent-work status=running title=Fix the flaky delivery test]'
    );
});

test('the durable event union carries the Message and work identities', () => {
    expect(
        serverdurableeventSchema.parse({
            chatId: 'cht_product',
            cloudAgentWorkId: 'caw_1234567890abcdef',
            createdAt: '2026-09-04T12:01:00.000Z',
            cursor: '42',
            id: 'evt_1',
            messageId: 'msg_1234567890abcdef',
            parentChatId: null,
            sequence: 7,
            serverId: 'srv_1',
            type: 'cloud-agent-work.updated',
        }).type
    ).toBe('cloud-agent-work.updated');
});

test('the Agent start input never carries provider instructions', () => {
    const input = {
        content: 'Handing the flaky test to a cloud agent.',
        nonce: 'cloud-agent-1',
        provider: 'cursor',
        repository: 'haus/haus',
        target: '#product',
        title: 'Fix the flaky delivery test',
    };
    expect(agentCloudAgentStartInputSchema.parse(input).startingRef).toBeNull();
    expect(
        agentCloudAgentStartInputSchema.safeParse({ ...input, instructions: 'do it' }).success
    ).toBe(false);
    expect(agentCloudAgentStartInputSchema.safeParse({ ...input, content: '' }).success).toBe(
        false
    );
});

test('an observation is bounded and its frames ride the command union', () => {
    expect(
        cloudAgentObservationSchema.parse({
            observedAt: '2026-09-04T12:05:00.000Z',
            runId: 'car_1234567890abcdef',
            status: 'completed',
            summary: 'Opened a pull request.',
            workId: 'caw_1234567890abcdef',
        }).status
    ).toBe('completed');
    expect(
        agentCommandSchema.safeParse({
            provider: 'cursor',
            providerAgentId: 'bc_abc',
            providerRunId: 'run_abc',
            runId: 'car_1234567890abcdef',
            type: 'cloud-agent-cancel',
            workId: 'caw_1234567890abcdef',
        }).success
    ).toBe(true);
    expect(
        agentCommandSchema.safeParse({
            type: 'cloud-agent-reconcile',
            work: [
                {
                    cancelRequested: true,
                    provider: 'cursor',
                    providerAgentId: null,
                    providerRunId: null,
                    runId: 'car_1234567890abcdef',
                    status: 'queued',
                    workId: 'caw_1234567890abcdef',
                },
            ],
        }).success
    ).toBe(true);
});

test('a Cloud Agent attention is a bodiless inbox item keyed by its Run', () => {
    const attention = {
        branches: [
            {
                branch: 'cloud/fix-flake',
                pullRequestUrl: 'https://github.com/haus/haus/pull/12',
                repository: 'haus/haus',
            },
        ],
        errorCode: null,
        provider: 'cursor',
        providerUrl: 'https://cursor.com/agents/bc_abc',
        repository: 'haus/haus',
        runId: 'car_1234567890abcdef',
        status: 'completed',
        summary: 'Opened a pull request.',
        title: 'Fix the flaky delivery test',
        workId: 'caw_1234567890abcdef',
    };
    const item = {
        chatId: 'cht_product',
        cloudAgentWork: attention,
        content: '',
        createdAt: '2026-09-04T12:05:00.000Z',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: '#product',
    };
    expect(agentInboxItemSchema.parse(item).cloudAgentWork?.workId).toBe('caw_1234567890abcdef');
    expect(agentInboxItemSchema.safeParse({ ...item, id: 'msg_other' }).success).toBe(false);
    expect(agentInboxItemSchema.safeParse({ ...item, sequence: 3 }).success).toBe(false);
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
    expect(computerProtocolVersion).toBe(23);
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
