import { expect, test } from 'bun:test';
import { agentDeliveryRecordSchema } from './agent-deliveries.ts';
import { agentHeartbeatRequestSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
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

const entry = {
    addressed: false,
    afterSequence: 4,
    chatId: 'cht_2',
    kind: 'channel',
    lastSpeaker: 'zach',
    messageCount: 3,
    speakers: ['zach'],
    target: '#all',
    title: 'all',
} as const;

const heartbeat = {
    createdAt: '2026-10-11T03:10:00.000Z',
    digest: { entries: [entry], more: 0 },
    id: 'dream:agt_1:2026-10-11',
    kind: 'nightly',
    since: null,
} as const;

const heartbeatReport = {
    createdAt: '2026-10-11T03:20:00.000Z',
    heartbeatKind: 'nightly',
    heartbeatRunId: 'run_1',
    id: 'heartbeat-report:run_1',
    text: 'Found one thing.',
} as const;

test('only a heartbeat or report run is chatless, and it carries nothing else', () => {
    const frame = { ...chatFrame, chatId: null, heartbeat, inboxDelivery: 'concrete' };
    expect(agentStartCommandSchema.parse(frame).heartbeat?.kind).toBe('nightly');
    expect(agentCommandSchema.safeParse(frame).success).toBe(true);

    const reportFrame = {
        ...chatFrame,
        chatId: null,
        heartbeatReport,
        inboxDelivery: 'concrete',
    };
    expect(agentStartCommandSchema.parse(reportFrame).heartbeatReport?.text).toBe(
        'Found one thing.'
    );

    expect(agentStartCommandSchema.safeParse({ ...chatFrame, chatId: null }).success).toBe(false);
    expect(agentStartCommandSchema.safeParse({ ...frame, chatId: 'cht_1' }).success).toBe(false);
    expect(agentStartCommandSchema.safeParse({ ...frame, drainItemIds: ['msg_1'] }).success).toBe(
        false
    );
    expect(agentStartCommandSchema.safeParse({ ...frame, inboxDelivery: 'notice' }).success).toBe(
        false
    );
    expect(agentStartCommandSchema.safeParse({ ...frame, heartbeatReport }).success).toBe(false);
    expect(agentStartCommandSchema.safeParse(chatFrame).success).toBe(true);
});

test('a digest holds at most twenty entries', () => {
    const entries = Array.from({ length: 21 }, () => entry);
    const frame = {
        ...chatFrame,
        chatId: null,
        heartbeat: { ...heartbeat, digest: { entries, more: 0 } },
        inboxDelivery: 'concrete',
    };
    expect(agentStartCommandSchema.safeParse(frame).success).toBe(false);
});

test('a heartbeat request names one Agent, kind, local date, and slot', () => {
    const request = {
        agentId: 'agt_1',
        kind: 'daytime',
        localDate: '2026-10-11',
        slot: '14:00',
        type: 'agent-heartbeat-request',
    } as const;
    expect(agentHeartbeatRequestSchema.parse(request)).toEqual(request);
    // Only the real slots are accepted: each distinct value would be a new dedupe key.
    for (const slot of ['14:30', '03:00', '09:00']) {
        expect(agentHeartbeatRequestSchema.safeParse({ ...request, slot }).success).toBe(false);
    }
    const night = { ...request, kind: 'nightly', slot: '03:00' } as const;
    expect(agentHeartbeatRequestSchema.parse(night)).toEqual(night);
    expect(agentHeartbeatRequestSchema.safeParse({ ...night, slot: '14:00' }).success).toBe(false);
    expect(agentHeartbeatRequestSchema.safeParse({ ...request, localDate: 'x' }).success).toBe(
        false
    );
    expect(agentHeartbeatRequestSchema.safeParse({ ...request, slot: '25:00' }).success).toBe(
        false
    );
    expect(agentHeartbeatRequestSchema.safeParse({ ...request, kind: 'dream' }).success).toBe(
        false
    );
    expect(
        agentHeartbeatRequestSchema.safeParse({ ...request, type: 'agent-dream-request' }).success
    ).toBe(false);
});

test('dream, heartbeat, and report triggers have no Chat', () => {
    const triggers = [
        { added: 3, kind: 'dream', learned: 'Prefers terse replies.', removed: 1 },
        {
            kind: 'heartbeat',
            report: { posted: true, postedChatId: 'cht_1', text: 'The Q4 budget is stuck.' },
            yielded: false,
        },
        { heartbeatRunId: 'run_1', kind: 'heartbeat_report' },
    ] as const;
    for (const trigger of triggers) {
        expect(agentTurnTriggerSchema.parse(trigger)).toEqual(trigger);
        expect(agentTurnTriggerSchema.safeParse({ ...trigger, chatId: 'cht_1' }).success).toBe(
            false
        );
    }
    expect(agentTurnTriggerSchema.safeParse({ kind: 'heartbeat' }).success).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ kind: 'dream' }).success).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ kind: 'heartbeat_report' }).success).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ kind: 'reminder' }).success).toBe(false);
});

test('only the three chatless sources deliver without a Chat', () => {
    const delivery = {
        acceptedAt: null,
        agentId: 'agt_1',
        chatId: null,
        createdAt: '2026-10-11T03:10:00.000Z',
        messageId: null,
        seenAt: null,
        servedAt: null,
        source: 'heartbeat',
        state: 'queued',
        turnId: null,
        workId: 'wrk_1',
    } as const;
    for (const source of ['dream', 'heartbeat', 'heartbeat_report']) {
        expect(agentDeliveryRecordSchema.safeParse({ ...delivery, source }).success).toBe(true);
    }
    expect(agentDeliveryRecordSchema.safeParse({ ...delivery, source: 'message' }).success).toBe(
        false
    );
    expect(agentDeliveryRecordSchema.safeParse({ ...delivery, chatId: 'cht_1' }).success).toBe(
        false
    );
});
