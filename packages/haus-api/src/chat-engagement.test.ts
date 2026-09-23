import { describe, expect, test } from 'bun:test';
import { chatEngagementEventSchema } from './chat-engagement.ts';
import { messageRoutingAuditSchema } from './message-routing.ts';

const base = {
    agentId: 'agt_test',
    chatId: 'cht_test',
    emittedAt: '2026-09-23T12:00:00.000Z',
    runId: 'run_test',
    serverId: 'srv_test',
};

describe('Chat engagement contract', () => {
    test('a start carries no reason and an end requires one', () => {
        expect(
            chatEngagementEventSchema.parse({ ...base, type: 'chat.engagement.started' })
        ).toEqual({ ...base, type: 'chat.engagement.started' });
        expect(
            chatEngagementEventSchema.safeParse({
                ...base,
                reason: 'sent',
                type: 'chat.engagement.started',
            }).success
        ).toBe(false);
        for (const reason of ['sent', 'settled', 'interrupted'] as const) {
            expect(
                chatEngagementEventSchema.parse({ ...base, reason, type: 'chat.engagement.ended' })
            ).toMatchObject({ reason });
        }
        expect(
            chatEngagementEventSchema.safeParse({ ...base, type: 'chat.engagement.ended' }).success
        ).toBe(false);
    });

    test('routing audits written before the reply judgment read it as null', () => {
        const audit = {
            candidateAgentIds: [],
            recipientAgentIds: [],
            outcome: 'bypass',
            bypassReason: 'direct-message',
            model: null,
            promptVersion: null,
            confidence: null,
            probability: null,
            choice: null,
            threshold: null,
            elapsedMs: null,
        };
        expect(messageRoutingAuditSchema.parse(audit).expectsReply).toBeNull();
        expect(messageRoutingAuditSchema.parse({ ...audit, expectsReply: 0.1 }).expectsReply).toBe(
            0.1
        );
    });
});
