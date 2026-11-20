import { expect, test } from 'bun:test';
import { agentPathSegment } from './agent-path-segment.ts';

test('an Agent id names a directory only when it is one plain path segment', () => {
    expect(agentPathSegment('agt_Q-cl9dec0eLIIgzm')).toBe('agt_Q-cl9dec0eLIIgzm');
    for (const unsafe of ['', '.', '..', '../agt_other', 'agt/x', 'agt\\x', '.hidden', 'a\0b']) {
        expect(() => agentPathSegment(unsafe)).toThrow(
            'is not an Agent id that can name a directory.'
        );
    }
});
