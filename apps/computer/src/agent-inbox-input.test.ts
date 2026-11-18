import { expect, test } from 'bun:test';
import {
    agentStartCommandSchema,
    agentTurnSummarySchema,
    cloudAgentWorkAttentionSchema,
} from '@haus/api';
import { parseStartCommand } from './agent-command-frames.ts';
import { parseInbox, rejectedInboxItems } from './agent-inbox-input.ts';
import { dispatchAgentStart } from './agent-start-dispatch.ts';
import type { AgentStartCommand, AgentTurnFrame } from './launch.ts';

test('names only the items a rejected frame could not read', async () => {
    const [item] = attentionContinuation().inbox;
    expect(rejectedInboxItems([item, { id: 'msg_bad' }, { content: 'no id' }])).toEqual([
        { id: 'msg_bad', reason: 'The Computer could not read this inbox item.' },
    ]);
    expect(rejectedInboxItems('not a list')).toEqual([]);
});

test('treats a notice identity as opaque', async () => {
    const [item] = attentionContinuation().inbox;
    const id = 'car_1234567890abcdef:stall:1793941134000:3';

    expect(parseInbox([{ ...item, id }])?.[0]?.id).toBe(id);
});

test('dispatches a typed attention continuation on its own identity', async () => {
    const command = attentionContinuation();
    const started: AgentStartCommand[] = [];
    const failures: AgentTurnFrame[] = [];
    await dispatchAgentStart(command, {
        coordinator: { waitForConfiguration: async () => undefined },
        send: (failure) => {
            failures.push(failure);
            return true;
        },
        start: (accepted) => {
            started.push(accepted);
        },
    });
    expect(parseStartCommand(command)).toEqual(command);
    expect(started).toEqual([command]);
    expect(failures).toEqual([]);
});

test('reports a terminal failure for a rejected start without leaking its payload', async () => {
    const command = { ...attentionContinuation(), inbox: [{ content: 'private payload' }] };
    const started: AgentStartCommand[] = [];
    const failures: AgentTurnFrame[] = [];
    await dispatchAgentStart(command, {
        coordinator: { waitForConfiguration: async () => undefined },
        send: (failure) => {
            failures.push(failure);
            return true;
        },
        start: (accepted) => {
            started.push(accepted);
        },
    });
    expect(started).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(agentTurnSummarySchema.parse(failures[0])).toMatchObject({
        agentId: command.agentId,
        runId: command.runId,
        failureKind: 'configuration',
        status: 'failed',
        outputProduced: false,
        visibleMessages: [],
    });
    expect(JSON.stringify(failures)).not.toContain('private payload');
});

function attentionContinuation() {
    const cloudAgentWork = {
        branches: [],
        errorCode: null,
        notice: 'settled',
        provider: 'cursor',
        providerUrl: null,
        repository: 'haus/haus',
        runId: 'car_1234567890abcdef',
        stallCode: null,
        status: 'completed',
        summary: 'Opened a pull request.',
        title: 'Fix the flaky delivery test',
        workId: 'caw_1234567890abcdef',
    };
    return agentStartCommandSchema.parse({
        agentId: 'agt_cove',
        chatId: 'cht_origin',
        inbox: [
            {
                chatId: 'cht_origin',
                cloudAgentWork,
                content: '',
                createdAt: '2026-09-08T03:47:39.214Z',
                id: cloudAgentWork.runId,
                senderHandle: 'haus',
                senderType: 'system',
                sequence: 0,
                target: '@operator',
            },
        ],
        inboxDelivery: 'concrete',
        modelId: 'gpt-5.6-sol',
        runId: 'run_continuation',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    });
}

test('accepts every addressed reason the Server writes and rejects unknown ones', () => {
    const item = (addressedReason: string) => ({
        addressed: true,
        addressedReason,
        chatId: 'cht_1',
        content: 'Can you check the deploy?',
        createdAt: '2026-09-23T00:00:00.000Z',
        id: 'msg_1',
        senderHandle: 'ada',
        senderType: 'human',
        sequence: 1,
        target: '#product',
    });
    for (const reason of ['dm', 'mention', 'routing', 'sole'] as const) {
        expect(parseInbox([item(reason)])?.[0]?.addressedReason).toBe(reason);
    }
    expect(parseInbox([item('assigned')])).toBeNull();
});

test("accepts a human sender's IANA zone and refuses one on any other sender", () => {
    const item = (senderType: string, senderTimezone: string) => ({
        chatId: 'cht_1',
        content: 'Standup at 9?',
        createdAt: '2026-09-23T00:00:00.000Z',
        id: 'msg_1',
        senderHandle: 'ada',
        senderTimezone,
        senderType,
        sequence: 1,
        target: '#product',
    });
    expect(parseInbox([item('human', 'America/Chicago')])?.[0]?.senderTimezone).toBe(
        'America/Chicago'
    );
    expect(parseInbox([item('agent', 'America/Chicago')])).toBeNull();
    expect(parseInbox([item('human', '+05:00')])).toBeNull();
});

/**
 * A current Server's inline reply and settled Cloud Agent attention, each carrying a field a future Server release might
 * additively send at every nesting level the shape reaches. Before the
 * loosened response schemas, any one of these fields stranded the whole
 * inbox item: `parseInbox` requires every item in the frame to parse, so a
 * single unrecognized field failed the entire `start` or `notice` command
 * closed, rather than just the one inbox item.
 */
function inboxItemWithUnknownNestedFields() {
    const reply = {
        futureReplyField: true,
        parent: {
            author: { agentId: 'agt_orbit', futureAuthorField: true, kind: 'agent' },
            content: 'Earlier message',
            createdAt: '2026-09-04T12:00:00.000Z',
            futureReferenceField: true,
            id: 'msg_parent1234567890',
            sequence: 1,
        },
        parentMessageId: 'msg_parent1234567890',
        root: {
            author: { futureAuthorField: true, kind: 'human', userId: 'usr_zach' },
            content: 'Root message',
            createdAt: '2026-09-04T11:00:00.000Z',
            futureReferenceField: true,
            id: 'msg_root1234567890',
            sequence: 1,
        },
        rootMessageId: 'msg_root1234567890',
    };
    const cloudAgentWork = {
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
        errorCode: null,
        futureAttentionField: true,
        notice: 'settled',
        provider: 'cursor',
        providerUrl: null,
        repository: 'haus/haus',
        runId: 'car_1234567890abcdef',
        stallCode: null,
        status: 'completed',
        summary: 'Opened a pull request.',
        title: 'Fix the flaky delivery test',
        workId: 'caw_1234567890abcdef',
    };
    return {
        chatId: 'cht_origin',
        cloudAgentWork,
        content: '',
        createdAt: '2026-09-08T03:47:39.214Z',
        id: cloudAgentWork.runId,
        reply,
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: '@operator',
    };
}

test('the canonical strict cloud agent attention schema rejects a field it does not know', () => {
    const { cloudAgentWork } = inboxItemWithUnknownNestedFields();
    expect(() => cloudAgentWorkAttentionSchema.parse(cloudAgentWork)).toThrow(
        /futureAttentionField/
    );
});

test('parseInbox tolerates an inline reply and cloud agent attention carrying fields from a newer Server, at every nesting level', () => {
    const item = inboxItemWithUnknownNestedFields();
    const [parsed] = parseInbox([item]) ?? [];
    expect(parsed?.id).toBe(item.id);
    expect(parsed?.reply?.parentMessageId).toBe('msg_parent1234567890');
    expect(parsed?.cloudAgentWork?.branches[0]?.pullRequest?.number).toBe(42);
});

test('parseInbox keeps the change a pull request notice names (ADR 0052)', () => {
    const item = inboxItemWithUnknownNestedFields();
    const pullRequestChange = {
        change: 'checks_failing' as const,
        url: 'https://github.com/haus/haus/pull/42',
    };
    const [parsed] =
        parseInbox([
            {
                ...item,
                cloudAgentWork: {
                    ...item.cloudAgentWork,
                    notice: 'pull_request',
                    pullRequestChange,
                },
            },
        ]) ?? [];
    expect(parsed?.cloudAgentWork?.notice).toBe('pull_request');
    expect(parsed?.cloudAgentWork?.pullRequestChange).toEqual(pullRequestChange);
});
