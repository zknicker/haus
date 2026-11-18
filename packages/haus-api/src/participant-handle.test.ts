import { describe, expect, test } from 'bun:test';
import { participantHandleSchema, suggestParticipantHandle } from './participant-handle.ts';

describe('participant handles', () => {
    test('normalizes one shared lowercase grammar', () => {
        expect(participantHandleSchema.parse('  Ada-Labs  ')).toBe('ada-labs');
        expect(participantHandleSchema.safeParse('a').success).toBe(false);
        expect(participantHandleSchema.safeParse('ada_labs').success).toBe(false);
        expect(participantHandleSchema.safeParse('ada labs').success).toBe(false);
        expect(participantHandleSchema.safeParse('a'.repeat(32)).success).toBe(false);
    });

    test('rejects reserved handles case-insensitively for every participant kind', () => {
        expect(participantHandleSchema.safeParse('SYSTEM').success).toBe(false);
        expect(participantHandleSchema.safeParse('cove').success).toBe(false);
        expect(participantHandleSchema.safeParse('HAUS').success).toBe(false);
        expect(participantHandleSchema.safeParse('HAUS').success).toBe(false);
    });

    test('suggests a valid handle from a profile without coupling future changes', () => {
        expect(suggestParticipantHandle('Ada Lovelace')).toBe('ada-lovelace');
        expect(suggestParticipantHandle('System')).toBe('human-member');
    });
});
