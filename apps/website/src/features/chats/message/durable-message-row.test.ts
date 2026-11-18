import { describe, expect, test } from 'vitest';

import { isDurableMessageRow } from './durable-message-row.ts';

describe('durable message rows', () => {
    test('offer durable actions only for durable, settled message rows', () => {
        expect(isDurableMessageRow(messageRow('msg_durable'))).toBe(true);
        expect(isDurableMessageRow(messageRow('act_narration'))).toBe(false);
        expect(
            isDurableMessageRow(messageRow('msg_optimistic', { __hausLocalTimelineMessage: true }))
        ).toBe(false);
        expect(
            isDurableMessageRow(messageRow('msg_streaming', { runtime: { streaming: true } }))
        ).toBe(false);
        expect(isDurableMessageRow(messageRow('external-message-id'))).toBe(false);
    });
});

function messageRow(id: string, metadata: Record<string, unknown> = {}) {
    return {
        id,
        kind: 'message',
        message: { id: id.startsWith('act_') ? 'msg_narration' : id, metadata },
    } as never;
}
