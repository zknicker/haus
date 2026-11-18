import assert from 'node:assert/strict';
import test from 'node:test';
import { agentRuntimeEventSchema } from './contracts.ts';

test('engine restart events parse through the runtime event union', () => {
    for (const phase of ['scheduled', 'restarting', 'completed']) {
        const event = agentRuntimeEventSchema.parse({
            phase,
            timestamp: '2026-06-11T12:00:00.000Z',
            type: 'engine.restart',
        });
        assert.equal(event.type, 'engine.restart');
    }
});

test('engine restart events reject unknown phases', () => {
    assert.throws(() =>
        agentRuntimeEventSchema.parse({
            phase: 'thinking-about-it',
            timestamp: '2026-06-11T12:00:00.000Z',
            type: 'engine.restart',
        })
    );
});

test('Runtime update changes parse through the runtime event union', () => {
    const event = agentRuntimeEventSchema.parse({
        timestamp: '2026-06-11T12:00:00.000Z',
        type: 'runtime.update',
    });

    assert.equal(event.type, 'runtime.update');
});

test('reminder changes parse through the runtime event union', () => {
    const event = agentRuntimeEventSchema.parse({
        timestamp: '2026-06-11T12:00:00.000Z',
        type: 'reminder.updated',
    });

    assert.equal(event.type, 'reminder.updated');
});
