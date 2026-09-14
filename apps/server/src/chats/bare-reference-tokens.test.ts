import { describe, expect, it } from 'bun:test';
import { formatAgentReferenceTarget } from '@haus/api';
import { mentionsBareAgentHandle } from './bare-reference-tokens.ts';
import { canonicalizeAgentMessageContent } from './canonicalize-agent-references.ts';

const orbit = { handle: 'orbit', id: 'agt_orbit' };

describe('mentionsBareAgentHandle', () => {
    it('accepts a handle standing against ordinary punctuation', () => {
        expect(mentionsBareAgentHandle('Meet @orbit, our release lead.', 'orbit')).toBe(true);
        expect(mentionsBareAgentHandle('Meet (@orbit) on release notes.', 'orbit')).toBe(true);
        expect(mentionsBareAgentHandle('Release notes now belong to @orbit.', 'orbit')).toBe(true);
        expect(mentionsBareAgentHandle('Meet @ORBIT.', 'orbit')).toBe(true);
    });

    it('refuses a handle that is not a reference a reader could click', () => {
        expect(mentionsBareAgentHandle('Meet Orbit, our release lead.', 'orbit')).toBe(false);
        expect(mentionsBareAgentHandle('Meet `@orbit`.', 'orbit')).toBe(false);
        expect(mentionsBareAgentHandle('Meet @orbit-2.', 'orbit')).toBe(false);
        expect(mentionsBareAgentHandle('Mail orbit@example.com.', 'orbit')).toBe(false);
        expect(mentionsBareAgentHandle('See https://example.com/@orbit.', 'orbit')).toBe(false);
    });

    // The gate and the canonicalizer must never disagree: a mention the gate
    // accepts is one the reader is handed as a chip, and one it refuses is text.
    it('agrees with the canonicalizer on every announcement it judges', () => {
        const announcements = [
            'Meet @orbit, our release lead.',
            'Meet (@orbit) on release notes.',
            'Release notes now belong to @orbit.',
            'Meet Orbit, our release lead.',
            'Meet `@orbit`.',
            'Mail orbit@example.com.',
            'See https://example.com/@orbit.',
            'Already linked [@orbit](agent://agt_other).',
        ];

        for (const content of announcements) {
            const canonicalized = canonicalizeAgentMessageContent(content, {
                users: [],
                agents: [orbit],
                channels: [],
            });
            expect([content, mentionsBareAgentHandle(content, 'orbit')]).toEqual([
                content,
                canonicalized.includes(`](${formatAgentReferenceTarget(orbit.id)})`),
            ]);
        }
    });
});
