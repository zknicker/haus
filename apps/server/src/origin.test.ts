import { describe, expect, test } from 'bun:test';
import { isAllowedAppOrigin } from './origin.ts';

describe('isAllowedAppOrigin', () => {
    test('allows packaged Electron file origins', () => {
        expect(isAllowedAppOrigin('file://', 'https://app.haus.test')).toBe(true);
        expect(
            isAllowedAppOrigin('file:///Applications/Haus.app/index.html', 'https://app.haus.test')
        ).toBe(true);
    });
});
