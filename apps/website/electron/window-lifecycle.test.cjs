'use strict';

const { describe, expect, test } = require('bun:test');
const { shouldHideInsteadOfClose } = require('./window-lifecycle.cjs');

describe('shouldHideInsteadOfClose', () => {
    test('closing the last macOS window hides it', () => {
        expect(
            shouldHideInsteadOfClose({ isQuitting: false, platform: 'darwin', windowCount: 1 })
        ).toBe(true);
    });

    test('a real quit closes the last window', () => {
        expect(
            shouldHideInsteadOfClose({ isQuitting: true, platform: 'darwin', windowCount: 1 })
        ).toBe(false);
    });

    test('closing one of several windows closes it', () => {
        expect(
            shouldHideInsteadOfClose({ isQuitting: false, platform: 'darwin', windowCount: 2 })
        ).toBe(false);
    });

    test('other platforms close as usual', () => {
        expect(
            shouldHideInsteadOfClose({ isQuitting: false, platform: 'win32', windowCount: 1 })
        ).toBe(false);
    });
});
