import { expect, test } from 'bun:test';
import { composeAgentInstructions } from './instructions.ts';

test('Sending teaches placement as what a reader sees, and Threads describe target construction', () => {
    const { instructions } = composeAgentInstructions({
        agentId: 'agt_test',
        agentName: 'Test',
        homeTimezone: 'UTC',
        initialRole: null,
        runtimeId: 'codex',
        workspacePath: '/workspace',
    });
    const sending = instructions.split('### Sending messages')[1]?.split('### ')[0] ?? '';
    expect(sending).toContain('A channel or DM is what its members read.');
    // Notification facts mirror packages/haus-api/src/message-notification.ts.
    expect(sending).toContain(
        'in the channel it shows only as a one-line preview under that message, and a reader who does not open it sees none of it.'
    );
    expect(sending).toContain(
        'the only people notified are the author of the message it hangs off, for every post, and anyone you @mention.'
    );
    expect(sending).toContain('In a DM every message notifies the other person, thread or not.');
    expect(sending).not.toContain('nobody is notified');
    expect(sending).not.toContain('bother nobody');
    // The Server refuses --reply-to inside a thread.
    expect(sending).toContain(
        'A message that arrived inside a thread is answered in that thread, at the same target, with no `--reply-to`.'
    );
    expect(sending).toContain(
        'an inline reply to their message in a channel or DM, or a post in the thread it arrived in, with `--done` on the message that answers it, and nothing they did not ask for.'
    );
    // Progress, even when asked for, goes in a thread on the Agent's own pickup note.
    expect(sending).toContain(
        'Working notes and progress as steps land, even when someone asked to be kept posted, go in a thread on your own pickup note in a channel'
    );
    expect(sending).toContain('a thread on their request would notify them for every post.');
    expect(sending).toContain('In a DM keep working notes to yourself.');
    expect(sending).toContain(
        'A result that exists only in your working thread is a result the requester has not received'
    );
    expect(sending).not.toContain('Post your acknowledgment, questions, and final answer');
    expect(sending).toContain('Manual topic `replies`');
    expect(sending).toContain(
        'In practice: answer a channel or DM message with `haus message send --target <target> --reply-to <shortid>`, using the received `msg=` value, and add `--done` to the message that answers it; a pickup note or a question is the same command without `--done`.'
    );
    expect(sending.indexOf('--reply-to')).toBeLessThan(sending.indexOf('**Reply to a channel**'));

    const threads = instructions.split('### Threads')[1]?.split('### ')[0] ?? '';
    expect(threads.trimStart().startsWith('- **Thread targets**')).toBe(true);
    expect(threads).not.toContain('start a thread on your own message');
    expect(threads).toContain('#general:00000000');
    expect(threads).toContain('dm:@richard:11111111');
    expect(threads).toContain('Sending to that target creates or continues the separate thread');
    expect(threads).toContain('Threads cannot be nested');
});

test('Communication style ends a finished task on the answer, not a summary', () => {
    const { instructions } = composeAgentInstructions({
        agentId: 'agt_test',
        agentName: 'Test',
        homeTimezone: 'UTC',
        initialRole: null,
        runtimeId: 'codex',
        workspacePath: '/workspace',
    });
    expect(instructions).toContain('- When done, answer what was asked, then stop.');
    expect(instructions).not.toContain('summarize the result');
});
