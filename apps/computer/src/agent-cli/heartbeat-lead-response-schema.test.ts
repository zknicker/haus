import { expect, test } from 'bun:test';
import { heartbeatReportResponseSchema, leadListResponseSchema } from '@haus/api';
import {
    heartbeatLearnedResultResponseSchema,
    heartbeatReportResultResponseSchema,
    leadClaimResultResponseSchema,
    leadListResultResponseSchema,
} from './heartbeat-lead-response-schema.ts';

const leadWithUnknownFields = {
    agentHandle: 'orbit',
    agentId: 'agt_orbit',
    anchorChatId: 'cht_product',
    anchorMessageId: 'msg_1234567890',
    createdAt: '2026-09-04T12:00:00.000Z',
    doneAt: null,
    finding: null,
    futureLeadField: 'a field this Computer build predates',
    id: 'led_1234567890',
    topic: 'Why the Etsy payout was short',
};

test('the canonical strict heartbeat report response schema rejects a field it does not know', () => {
    expect(() =>
        heartbeatReportResponseSchema.parse({ futureAckField: true, queued: true })
    ).toThrow(/futureAckField/);
});

test('the canonical strict lead list schema rejects a field it does not know', () => {
    expect(() => leadListResponseSchema.parse({ leads: [leadWithUnknownFields] })).toThrow(
        /futureLeadField/
    );
});

test('the Computer response schema tolerates an unknown field on a heartbeat report ack', () => {
    expect(
        heartbeatReportResultResponseSchema.parse({ futureAckField: true, queued: true }).queued
    ).toBe(true);
});

test('the Computer response schema tolerates an unknown field on a heartbeat learned ack', () => {
    expect(
        heartbeatLearnedResultResponseSchema.parse({ futureAckField: true, saved: true }).saved
    ).toBe(true);
});

test('the Computer response schema tolerates an unknown field on a lead list', () => {
    expect(
        leadListResultResponseSchema.parse({ leads: [leadWithUnknownFields] }).leads
    ).toHaveLength(1);
});

test('the Computer response schema tolerates an unknown field on a lead claim result, at every nesting level', () => {
    const claimed = leadClaimResultResponseSchema.parse({
        claimed: true,
        futureClaimField: true,
        lead: leadWithUnknownFields,
    });
    expect(claimed.claimed && claimed.lead.id).toBe('led_1234567890');

    const conflict = leadClaimResultResponseSchema.parse({
        claimed: false,
        futureConflictField: true,
        heldBy: { agentHandle: 'orbit', agentId: 'agt_orbit', futureHeldByField: true },
        leadId: 'led_1234567890',
    });
    expect(!conflict.claimed && conflict.heldBy.agentHandle).toBe('orbit');
});
