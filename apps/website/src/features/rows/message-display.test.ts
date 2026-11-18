import assert from 'node:assert/strict';
import test from 'node:test';
import { getMessageDisplay } from './message-display.ts';

test('getMessageDisplay keeps agent tool-call headers visible', () => {
    const display = getMessageDisplay({
        content: '',
        metadata: {
            toolCallId: 'call-1',
        },
        senderType: 'agent',
    });

    assert.deepEqual(display, {
        content: '',
        showHeader: true,
        showBodyContent: false,
    });
});

test('getMessageDisplay hides empty tool-result headers for serialized payloads', () => {
    const display = getMessageDisplay({
        content: '{"status":"forbidden","error":"Session history visibility is restricted."}',
        metadata: {
            toolCallId: 'call-1',
        },
        senderType: 'system',
    });

    assert.deepEqual(display, {
        content: '{"status":"forbidden","error":"Session history visibility is restricted."}',
        showHeader: false,
        showBodyContent: false,
    });
});

test('getMessageDisplay hides empty agent headers without tool metadata', () => {
    const display = getMessageDisplay({
        content: '',
        senderType: 'agent',
    });

    assert.deepEqual(display, {
        content: '',
        showHeader: false,
        showBodyContent: false,
    });
});
