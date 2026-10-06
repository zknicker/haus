import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAgentDelegationSummary } from './agent-hover-delegations.ts';

const now = Date.parse('2026-10-06T12:10:00.000Z');

test('the delegation line is hidden when no sub-agent is running', () => {
    assert.equal(formatAgentDelegationSummary(undefined, now), null);
    assert.equal(formatAgentDelegationSummary([], now), null);
});

test('the delegation line counts sub-agents and times the earliest start', () => {
    assert.equal(
        formatAgentDelegationSummary(
            [
                { operationId: 'op_b', startedAt: '2026-10-06T12:08:30.000Z' },
                { operationId: 'op_a', startedAt: '2026-10-06T12:07:00.000Z' },
            ],
            now
        ),
        '2 sub-agents running · 3:00'
    );
    assert.equal(
        formatAgentDelegationSummary(
            [{ operationId: 'op_a', startedAt: '2026-10-06T12:09:15.000Z' }],
            now
        ),
        '1 sub-agent running · 0:45'
    );
    assert.equal(
        formatAgentDelegationSummary(
            [{ operationId: 'op_a', startedAt: '2026-10-06T10:55:00.000Z' }],
            now
        ),
        '1 sub-agent running · 1:15:00'
    );
});
