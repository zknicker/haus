import { expect, test } from 'bun:test';
import {
    heartbeatLearnedInputSchema,
    heartbeatReportInputSchema,
    leadClaimInputSchema,
    leadClaimResultSchema,
    leadDoneInputSchema,
    leadListResponseSchema,
} from './heartbeat.ts';

const lead = {
    agentHandle: 'blippy',
    agentId: 'agt_1',
    anchorChatId: null,
    anchorMessageId: null,
    createdAt: '2026-10-11T10:00:00.000Z',
    doneAt: null,
    finding: null,
    id: 'led_1',
    topic: 'Etsy fee change',
} as const;

test('report and learned text are bounded', () => {
    expect(heartbeatReportInputSchema.safeParse({ text: 'ok' }).success).toBe(true);
    expect(heartbeatReportInputSchema.safeParse({ text: '' }).success).toBe(false);
    expect(heartbeatReportInputSchema.safeParse({ text: 'x'.repeat(4001) }).success).toBe(false);
    expect(heartbeatLearnedInputSchema.safeParse({ text: 'x'.repeat(2000) }).success).toBe(true);
    expect(heartbeatLearnedInputSchema.safeParse({ text: 'x'.repeat(2001) }).success).toBe(false);
});

test('lead claim, list, and done follow the wire contract', () => {
    expect(leadClaimInputSchema.safeParse({ topic: 'a' }).success).toBe(true);
    expect(leadClaimInputSchema.safeParse({ messageId: 'msg_1', topic: 'a' }).success).toBe(true);
    expect(leadClaimInputSchema.safeParse({ topic: 'x'.repeat(201) }).success).toBe(false);
    expect(leadListResponseSchema.parse({ leads: [lead] }).leads).toHaveLength(1);
    expect(leadDoneInputSchema.safeParse({ finding: 'x'.repeat(1000) }).success).toBe(true);
    expect(leadDoneInputSchema.safeParse({ finding: 'x'.repeat(1001) }).success).toBe(false);
});

test('a lost claim names who holds the lead', () => {
    const conflict = {
        claimed: false,
        heldBy: { agentHandle: 'tiny', agentId: 'agt_2' },
        leadId: 'led_9',
    } as const;
    expect(leadClaimResultSchema.parse(conflict)).toEqual(conflict);
    expect(leadClaimResultSchema.parse({ claimed: true, lead }).claimed).toBe(true);
    expect(leadClaimResultSchema.safeParse({ claimed: false, leadId: 'led_9' }).success).toBe(
        false
    );
});
