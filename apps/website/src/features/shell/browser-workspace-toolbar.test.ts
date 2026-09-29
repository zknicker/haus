import { expect, test } from 'bun:test';
import { resolveBrowserAddress } from './browser-workspace-toolbar.tsx';

test('browser address entry keeps explicit schemes and distinguishes websites from search terms', () => {
    expect(resolveBrowserAddress('https://example.com/path')).toBe('https://example.com/path');
    expect(resolveBrowserAddress('example.com/path')).toBe('https://example.com/path');
    expect(resolveBrowserAddress('Haus browser tabs')).toBe(
        'https://www.google.com/search?q=Haus%20browser%20tabs'
    );
    expect(resolveBrowserAddress('javascript:alert(1)')).toBe('javascript:alert(1)');
});
