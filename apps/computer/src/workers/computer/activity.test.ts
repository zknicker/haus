import { expect, test } from 'bun:test';
import { createJournalRedactor } from '../../execution-journal-upload/journal-redaction.ts';
import { activityLine, activityThrottle } from './activity.ts';

const token = 'hwt_turntokenvalue0123456789';
const redact = createJournalRedactor([token]);
const call = (toolName: string, input: unknown) =>
    ({ input, toolCallId: 'call_1', toolName, type: 'tool-call' }) as const;
const line = (event: Parameters<typeof activityLine>[0]) => activityLine(event, redact);

test('a tool call reads as one bounded line of what the Worker is doing', () => {
    expect(line(call('bash', { command: 'bun test\n  apps/computer' }))).toBe(
        'Running bun test apps/computer'
    );
    expect(line(call('Edit', { file_path: 'src/index.ts' }))).toBe('Editing src/index.ts');
    expect(line(call('mcp__linear__create', {}))).toBe('Using mcp__linear__create');
    expect(line(call('bash', { command: 'x'.repeat(300) }))?.length).toBe(120);
    expect(line({ id: 't', text: 'thinking', type: 'text-delta' })).toBeNull();
});

test('an activity line never carries a secret the command named', () => {
    expect(
        line(call('bash', { command: `curl -H "Authorization: Bearer abcdef0123456789" x` }))
    ).toBe('Running curl -H "Authorization: Bearer [redacted]" x');
    expect(line(call('bash', { command: `HAUS_WORKER_TOKEN=${token} haus worker report` }))).toBe(
        'Running HAUS_WORKER_TOKEN=[redacted] haus worker report'
    );
    expect(
        line(
            call('bash', {
                command: 'git push https://user:ghp_0123456789abcdefghijABCD@github.com/o/r',
            })
        )
    ).toBe('Running git push https://[redacted]@github.com/o/r');
});

test('activity is sent at most once every five seconds, newest line first', () => {
    const sent: string[] = [];
    let now = 0;
    const offer = activityThrottle({ now: () => now, send: (line) => sent.push(line.summary) });
    offer('Running one');
    now = 1000;
    offer('Running two');
    offer('Running three');
    now = 5000;
    offer(null);
    now = 6000;
    offer('Running four');

    expect(sent).toEqual(['Running one', 'Running three']);
});
