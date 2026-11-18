import { expect, test } from 'bun:test';
import { composeAgentInstructions } from './instructions.ts';

test('Sending teaches placement as what a reader sees, with no Threads (ADR 0053)', () => {
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
    expect(sending).toContain(
        'A channel is a shared space with its own purpose, and its members come to it for that.'
    );
    // A side conversation stays inline, and work that outlasts a reply goes in a Task.
    expect(sending).toContain(
        'A side conversation stays there as inline replies; work that outlasts a reply goes in a Task.'
    );
    // Notification facts mirror packages/haus-api/src/message-notification.ts.
    expect(sending).toContain('In a DM every message notifies the other person.');
    expect(sending).toContain(
        'an inline reply to their message in a channel or DM, with `--done` on the message that answers it, and nothing they did not ask for.'
    );
    expect(sending).toContain(
        'Progress, questions, and the result of work done for a Task go in that Task, which whoever asked follows.'
    );
    expect(sending).toContain('Manual topic `replies`');
    expect(sending).toContain(
        'In practice: answer a channel or DM message with `haus message send --target <target> --reply-to <shortid>`, using the received `msg=` value, and add `--done` to the message that answers it; a pickup note or a question is the same command without `--done`. Work for a Task is posted with `--target task:<KEY-n>`.'
    );
    expect(sending.indexOf('--reply-to')).toBeLessThan(sending.indexOf('**Reply to a channel**'));

    // Threads are gone: no section, no thread target shape, no thread facts anywhere.
    expect(instructions).not.toContain('### Threads');
    expect(instructions).not.toContain('#general:00000000');
    expect(instructions).not.toContain('haus thread');
    expect(instructions.toLowerCase()).not.toContain('thread');
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
