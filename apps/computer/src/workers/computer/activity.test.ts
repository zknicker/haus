import { expect, test } from 'bun:test';
import { activityLine, activityThrottle } from './activity.ts';

const call = (toolName: string, input: unknown) =>
    ({ input, toolCallId: 'call_1', toolName, type: 'tool-call' }) as const;

test('a tool call reads as one bounded line of what the Worker is doing', () => {
    expect(activityLine(call('bash', { command: 'bun test\n  apps/computer' }))).toBe(
        'Running bun test apps/computer'
    );
    expect(activityLine(call('Edit', { file_path: 'src/index.ts' }))).toBe('Editing src/index.ts');
    expect(activityLine(call('mcp__linear__create', {}))).toBe('Using mcp__linear__create');
    expect(activityLine(call('bash', { command: 'x'.repeat(300) }))?.length).toBe(120);
    expect(activityLine({ id: 't', text: 'thinking', type: 'text-delta' })).toBeNull();
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
