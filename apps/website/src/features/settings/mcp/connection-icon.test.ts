import { describe, expect, test } from 'bun:test';
import { connectionIcon } from './connection-icon.ts';

const light = 'data:image/png;base64,AAAA';
const dark = 'data:image/png;base64,BBBB';

function connection(icon: { dark: null | string; light: null | string } | null) {
    return { icon, id: 'mcp_abcdefghijklmnop', name: 'Demo Tools' };
}

describe('connectionIcon', () => {
    test('picks the variant matching the viewer theme', () => {
        expect(connectionIcon(connection({ dark, light }), 'dark')).toEqual({
            kind: 'image',
            src: dark,
        });
        expect(connectionIcon(connection({ dark, light }), 'light')).toEqual({
            kind: 'image',
            src: light,
        });
    });

    test('falls back to the other variant when one is missing', () => {
        // The Server stores one icon serving both themes in `light` alone, so
        // this fallback is the common path, not an edge case.
        expect(connectionIcon(connection({ dark: null, light }), 'dark')).toEqual({
            kind: 'image',
            src: light,
        });
    });

    test('falls back to a monogram when the server stored no icon', () => {
        const icon = connectionIcon(connection(null), 'dark');

        expect(icon.kind).toBe('monogram');
        expect(icon).toMatchObject({ letter: 'D' });
    });

    test('gives the same connection the same monogram colour every time', () => {
        const first = connectionIcon(connection(null), 'dark');
        const second = connectionIcon(connection(null), 'light');

        expect(first).toEqual(second);
    });

    test('handles a name that starts with a multi-byte character', () => {
        const icon = connectionIcon({ icon: null, id: 'mcp_x', name: '🧩 Puzzle' }, 'dark');

        expect(icon).toMatchObject({ letter: '🧩' });
    });
});
