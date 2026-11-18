import { expect, test } from 'bun:test';
import { requestMessageReveal, takeMessageReveal } from './use-pending-message-reveal.ts';

test('a reveal request is served once, for its own chat', () => {
    requestMessageReveal('chat-1', { id: 'msg-1', sequence: 4 });
    expect(takeMessageReveal('chat-2')).toBeNull();
    expect(takeMessageReveal('chat-1')).toEqual({ id: 'msg-1', sequence: 4 });
    expect(takeMessageReveal('chat-1')).toBeNull();
});

test('a later request replaces an unserved one', () => {
    requestMessageReveal('chat-1', { id: 'msg-1', sequence: 4 });
    requestMessageReveal('chat-1', { id: 'msg-2', sequence: 9 });
    expect(takeMessageReveal('chat-1')).toEqual({ id: 'msg-2', sequence: 9 });
});
