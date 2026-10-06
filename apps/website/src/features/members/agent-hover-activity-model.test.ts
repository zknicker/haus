import { expect, test } from 'bun:test';
import type { AgentActivityEvent, AgentCurrentActivity } from '@haus/api';
import {
    formatElapsedClock,
    formatHoverLiveLine,
    selectHoverLogLines,
} from './agent-hover-activity-model.ts';

const now = Date.parse('2026-10-06T17:40:42.000Z');

test('the live line names the current step on the turn clock', () => {
    const current = live({ category: 'running_command', runStartedAt: '2026-10-06T17:40:00.000Z' });
    expect(formatHoverLiveLine(current, now)).toBe('Running a command · 0:42');
    expect(formatHoverLiveLine({ ...current, runStartedAt: null }, now)).toBe('Running a command');
});

test('the clock reads minutes and seconds, then hours', () => {
    expect(formatElapsedClock(42_000)).toBe('0:42');
    expect(formatElapsedClock(725_000)).toBe('12:05');
    expect(formatElapsedClock(3_723_000)).toBe('1:02:03');
});

test('stale starts give way to the past-tense steps that ended them', () => {
    // Newest first, all within one minute: the review's pile of "…ing" lines.
    const events = [
        event('e5', 5, { category: 'editing_files', phase: 'completed' }),
        event('e4', 4, { category: 'editing_files', phase: 'started' }),
        event('e3', 3, { category: 'reading_files', phase: 'completed' }),
        event('e2', 2, { category: 'reading_files', phase: 'started' }),
        event('e1', 1, { category: 'thinking', phase: 'started' }),
    ];
    const lines = selectHoverLogLines(events, { id: 'e9', runId: 'run_one' });
    expect(lines.map((line) => line.label)).toEqual(['Edited files', 'Read files']);
    // One time for the burst, not one per line.
    expect(lines[0]?.time).toBeTruthy();
    expect(lines[1]?.time).toBeNull();
});

test('a running sub-agent stays in the log beside the status line until it settles', () => {
    const events = [
        event('e4', 4, { category: 'running_command', phase: 'started' }),
        event('e3', 3, { category: 'delegating', operationId: 'b'.repeat(16), phase: 'completed' }),
        event('e2', 2, { category: 'delegating', operationId: 'b'.repeat(16), phase: 'started' }),
        event('e1', 1, { category: 'delegating', operationId: 'a'.repeat(16), phase: 'started' }),
    ];
    // e4 is what the live line already says.
    const lines = selectHoverLogLines(events, { id: 'e4', runId: 'run_one' });
    expect(lines.map((line) => line.label)).toEqual(['Ran a sub-agent', 'Running a sub-agent…']);
});

test('the log keeps to the current run and leaves out turn bookkeeping', () => {
    const events = [
        event('e3', 3, { category: 'working', phase: 'started' }),
        event('e2', 2, { category: 'starting_work', phase: 'completed' }),
        event('e1', 1, { category: 'sending_message', phase: 'completed', runId: 'run_old' }),
    ];
    expect(selectHoverLogLines(events, { id: 'e9', runId: 'run_one' })).toEqual([]);
});

function event(
    id: string,
    position: number,
    overrides: Partial<AgentActivityEvent> = {}
): AgentActivityEvent {
    return {
        agentId: 'agt_one',
        category: 'working',
        id,
        occurredAt: '2026-10-06T17:40:10.000Z',
        phase: 'started',
        position,
        producer: 'computer',
        producerId: 'cmp_one',
        producerSequence: position,
        runId: 'run_one',
        serverId: 'srv_one',
        ...overrides,
    };
}

function live(overrides: Partial<AgentCurrentActivity>): AgentCurrentActivity {
    return { ...event('e_live', 9), runStartedAt: null, ...overrides };
}
