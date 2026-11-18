import { describe, expect, test } from 'bun:test';
import { getEntityInitials } from '../../components/ui/entity-avatar.tsx';

describe('turn avatar initials', () => {
    test('agents and people share one initials rule', () => {
        expect(getEntityInitials('Scout')).toBe('SC');
        expect(getEntityInitials('Zach Knickerbocker')).toBe('ZK');
        expect(getEntityInitials('  ada  byron  lovelace ')).toBe('AL');
    });

    test('an unnamed actor still renders a mark', () => {
        expect(getEntityInitials('')).toBe('?');
        expect(getEntityInitials('   ')).toBe('?');
    });
});
