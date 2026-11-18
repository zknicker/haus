import { describe, expect, test } from 'bun:test';
import { slugifyServerName } from './server-slug.ts';

describe('slugifyServerName', () => {
    test('derives a valid Server address from its name', () => {
        expect(slugifyServerName('Haus HQ')).toBe('haus-hq');
        expect(slugifyServerName('  Café & Tools  ')).toBe('cafe-tools');
        expect(slugifyServerName('A Server with more than thirty-two characters')).toBe(
            'a-server-with-more-than-thirty-t'
        );
    });
});
