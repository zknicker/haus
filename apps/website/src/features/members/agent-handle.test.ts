import { describe, expect, test } from 'bun:test';
import { createAgentHandle } from './agent-handle.ts';

describe('createAgentHandle', () => {
    test('derives a valid handle without exposing a second identity field', () => {
        expect(createAgentHandle('  Research & Ops  ', [])).toBe('research-ops');
        expect(createAgentHandle('A', [])).toBe('a-agent');
    });

    test('chooses the next available handle', () => {
        expect(createAgentHandle('Cove', [])).toBe('cove-2');
        expect(createAgentHandle('Cove', [{ handle: 'cove' }, { handle: 'cove-2' }])).toBe(
            'cove-3'
        );
    });
});
