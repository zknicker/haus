import { expect, test } from 'bun:test';
import { agentStartCommandSchema, agentTurnSummarySchema } from '@haus/api';
import { parseInbox } from './agent-inbox-input.ts';
import { dispatchAgentStart } from './agent-start-dispatch.ts';
import { type AgentStartCommand, type AgentTurnFrame, parseStartCommand } from './launch.ts';

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
        provider: 'cursor',
        providerUrl: null,
        repository: 'haus/haus',
        runId: 'car_1234567890abcdef',
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
