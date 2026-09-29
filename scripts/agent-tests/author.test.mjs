import { describe, expect, test } from 'bun:test';
import { agentSendAttempts } from './author.mjs';

describe('agentSendAttempts', () => {
    test('sends the content first, then retries a held send as a content-free draft send', () => {
        const [first, retry] = agentSendAttempts({
            content: 'Lane A is done.',
            nonce: 'agenttests_1',
            target: '#product',
        });
        expect(first).toEqual({
            content: 'Lane A is done.',
            nonce: 'agenttests_1',
            sendDraft: false,
            target: '#product',
        });
        // The Server refuses a draft send with content (SEND_DRAFT_STDIN_UNSUPPORTED).
        expect(retry).toEqual({ nonce: 'agenttests_1', sendDraft: true, target: '#product' });
        expect(retry).not.toHaveProperty('content');
    });
});
