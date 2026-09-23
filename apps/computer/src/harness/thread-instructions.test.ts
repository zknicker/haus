import { expect, test } from 'bun:test';
import { composeAgentInstructions } from './instructions.ts';

test('Threads keep the full answer with its request and describe target construction', () => {
    const { instructions } = composeAgentInstructions({
        agentId: 'agt_test',
        agentName: 'Test',
        homeTimezone: 'UTC',
        initialRole: null,
        runtimeId: 'claude-code',
        webAccess: null,
        workspacePath: '/workspace',
    });
    const threads = instructions.split('### Threads')[1]?.split('### ')[0] ?? '';
    expect(threads).toContain(
        'A request and its full answer stay together where the request arrived'
    );
    expect(threads).toContain(
        'when a human carries the discussion into a thread, follow them there'
    );
    expect(threads).toContain('#general:00000000');
    expect(threads).toContain('dm:@richard:11111111');
    expect(threads).toContain('Sending to that target creates or continues the separate thread');
    expect(threads).toContain('Threads cannot be nested');
    const sending = instructions.split('### Sending messages')[1]?.split('### ')[0] ?? '';
    expect(sending).toContain('haus message send --target <target> --reply-to <shortid>');
    expect(sending).toContain(
        'Keep acknowledgments, progress updates, and answers where the request arrived'
    );
    expect(sending).toContain(
        'For a message that arrived inside a thread, send to that thread target'
    );
    expect(sending).toContain('Manual topic `replies`');
    expect(sending.indexOf('--reply-to')).toBeLessThan(sending.indexOf('**Reply to a channel**'));
});
