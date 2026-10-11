import { expect, test } from 'bun:test';
import { agentDreamRequestSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
import { agentCommandSchema } from './agent-runner.ts';
import { agentTurnTriggerSchema } from './agent-turn-trigger.ts';

const chatFrame = {
    agentId: 'agt_1',
    chatId: 'cht_1',
    inboxDelivery: 'notice',
    modelId: 'm',
    runId: 'run_1',
    runtimeId: 'codex',
    sessionGeneration: 1,
    totalPending: 0,
    type: 'start',
} as const;

const dream = { createdAt: '2026-10-11T03:10:00.000Z', id: 'dream:agt_1:2026-10-11' };

test('only a dream run is chatless, and it carries nothing but its dream', () => {
    const dreamFrame = { ...chatFrame, chatId: null, dream, inboxDelivery: 'concrete' };
    expect(agentStartCommandSchema.parse(dreamFrame).dream).toEqual(dream);
    expect(agentCommandSchema.safeParse(dreamFrame).success).toBe(true);

    expect(agentStartCommandSchema.safeParse({ ...chatFrame, chatId: null }).success).toBe(false);
    expect(agentStartCommandSchema.safeParse({ ...dreamFrame, chatId: 'cht_1' }).success).toBe(
        false
    );
    expect(
        agentStartCommandSchema.safeParse({ ...dreamFrame, drainItemIds: ['msg_1'] }).success
    ).toBe(false);
    expect(
        agentStartCommandSchema.safeParse({ ...dreamFrame, inboxDelivery: 'notice' }).success
    ).toBe(false);
    expect(agentStartCommandSchema.safeParse(chatFrame).success).toBe(true);
});

test('a dream request names one Agent and a Computer-local calendar date', () => {
    const request = {
        agentId: 'agt_1',
        localDate: '2026-10-11',
        type: 'agent-dream-request',
    } as const;
    expect(agentDreamRequestSchema.parse(request)).toEqual(request);
    expect(agentDreamRequestSchema.safeParse({ ...request, localDate: 'tonight' }).success).toBe(
        false
    );
});

test('the dream trigger is the only trigger without a Chat', () => {
    expect(agentTurnTriggerSchema.parse({ kind: 'dream' })).toEqual({ kind: 'dream' });
    expect(agentTurnTriggerSchema.safeParse({ kind: 'reminder' }).success).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ chatId: 'cht_1', kind: 'dream' }).success).toBe(
        false
    );
});
